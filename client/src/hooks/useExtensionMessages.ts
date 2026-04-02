import { useEffect, useRef, useState } from 'react';

import { playActivityTick, playDoneSound, playSpawnSound, setSoundEnabled } from '../notificationSound.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { setFloorSprites } from '../office/floorTiles.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { setCharacterTemplates } from '../office/sprites/spriteData.js';
import { extractToolName } from '../office/toolUtils.js';
import { formatActivity } from '../office/formatActivity.js';
import { ACTIVITY_LOG_MAX_ENTRIES, SPEECH_BUBBLE_PERSIST_MS } from '../constants.js';
import type { ActivityEntry, AgentBubble, OfficeLayout, ToolActivity } from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';
import { authFetch, wsClient } from '../wsClient.js';

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

export interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

export interface MonitoredProjectInfo {
  id: string;
  path: string;
  name: string;
  source: 'claude-code' | 'openclaw';
}

export interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  layoutWasReset: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaceFolders: WorkspaceFolder[];
  monitoredProjects: MonitoredProjectInfo[];
  activityLog: ActivityEntry[];
  agentBubbles: Readonly<Record<number, AgentBubble>>;
  showInactiveAgents: boolean;
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue;
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
  }
  wsClient.send({ type: 'saveAgentSeats', seats });
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutWasReset, setLayoutWasReset] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [monitoredProjects, setMonitoredProjects] = useState<MonitoredProjectInfo[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [agentBubbles, setAgentBubbles] = useState<Record<number, AgentBubble>>({});
  const [showInactiveAgents, setShowInactiveAgents] = useState(true);

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false);

  // Saved appearances for OpenClaw agents
  const appearancesRef = useRef<Record<string, { gender?: string; palette?: number; hueShift?: number }>>({});

  // Fetch appearances on mount
  useEffect(() => {
    authFetch('/api/config/appearances')
      .then((r) => r.json())
      .then((data) => {
        appearancesRef.current = data;
      })
      .catch(() => {});
  }, []);

  // Periodically clean up expired speech bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      setAgentBubbles((prev) => {
        const now = Date.now();
        const expired = Object.entries(prev).filter(([, b]) => b.expiresAt <= now);
        if (expired.length === 0) return prev;
        const next = { ...prev };
        for (const [id] of expired) {
          delete next[Number(id)];
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: Array<{
      id: number;
      palette?: number;
      hueShift?: number;
      seatId?: string;
      folderName?: string;
      projectId?: string;
      gender?: 'male' | 'female' | 'any';
      openclawAgentId?: string;
      agentName?: string;
      isActive?: boolean;
    }> = [];

    let knownServerVersion: string | null = null;

    // Use wsClient.onMessage instead of window.addEventListener('message')
    const unsubscribe = wsClient.onMessage((raw: unknown) => {
      const msg = raw as Record<string, unknown>;
      const os = getOfficeState();

      if (msg.type === 'serverVersion') {
        const version = msg.version as string;
        if (knownServerVersion !== null && knownServerVersion !== version) {
          console.log('[WebSocket] Server version changed, reloading...');
          window.location.reload();
          return;
        }
        knownServerVersion = version;
        return;
      }

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          return;
        }
        const rawLayout = msg.layout as OfficeLayout | null;
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null;
        if (layout) {
          os.rebuildFromLayout(layout);
          onLayoutLoaded?.(layout);
        } else {
          // Default layout -- snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout());
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName, p.projectId, p.gender, p.openclawAgentId, p.agentName, p.isActive);
          // Save appearance for new OpenClaw agents
          if (p.openclawAgentId && !p.palette) {
            const ch = os.characters.get(p.id);
            if (ch) {
              const key = `openclaw:${p.openclawAgentId}`;
              const appearance = { gender: p.gender || 'any', palette: ch.palette, hueShift: ch.hueShift };
              appearancesRef.current[key] = appearance;
              authFetch(`/api/config/appearances/${key}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appearance),
              }).catch(() => {});
            }
          }
        }
        pendingAgents = [];
        layoutReadyRef.current = true;
        setLayoutReady(true);
        if (msg.wasReset) {
          setLayoutWasReset(true);
        }
        if (os.characters.size > 0) {
          saveAgentSeats(os);
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        const folderName = msg.folderName as string | undefined;
        const projectId = msg.projectId as string | undefined;
        const openclawAgentId = msg.openclawAgentId as string | undefined;
        const agentName = msg.agentName as string | undefined;
        const isActive = msg.isActive !== false; // default true
        const identityGender = (msg as any).identityGender as 'male' | 'female' | 'any' | undefined;

        // Look up saved appearance
        const appearanceKey = openclawAgentId ? `openclaw:${openclawAgentId}` : undefined;
        const saved = appearanceKey ? appearancesRef.current[appearanceKey] : undefined;
        // Use saved gender, fall back to identity gender from IDENTITY.md
        const gender = (saved?.gender || identityGender || 'any') as 'male' | 'female' | 'any';

        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
        if (isActive) {
          setSelectedAgent(id);
          playSpawnSound();
        }
        os.addAgent(id, saved?.palette, saved?.hueShift, undefined, undefined, folderName, projectId, gender, openclawAgentId, agentName, isActive);
        saveAgentSeats(os);

        // Save appearance if OpenClaw and no saved appearance yet
        if (openclawAgentId && !saved?.palette) {
          const ch = os.characters.get(id);
          if (ch) {
            const appearance = { gender, palette: ch.palette, hueShift: ch.hueShift };
            appearancesRef.current[`openclaw:${openclawAgentId}`] = appearance;
            authFetch(`/api/config/appearances/openclaw:${openclawAgentId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(appearance),
            }).catch(() => {});
          }
        }
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number;
        setAgents((prev) => prev.filter((a) => a !== id));
        setSelectedAgent((prev) => (prev === id ? null : prev));
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os.removeAgent(id);
        // Remove speech bubble
        setAgentBubbles((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[];
        const meta = (msg.agentMeta || {}) as Record<
          number,
          { palette?: number; hueShift?: number; seatId?: string; folderName?: string; source?: string; projectId?: string; openclawAgentId?: string; agentName?: string; isActive?: boolean; identityGender?: 'male' | 'female' | 'any' }
        >;
        // If layout is already loaded, add agents immediately; otherwise buffer
        for (const id of incoming) {
          const m = meta[id];

          // Look up saved appearance for OpenClaw agents
          const appearanceKey = m?.openclawAgentId ? `openclaw:${m.openclawAgentId}` : undefined;
          const saved = appearanceKey ? appearancesRef.current[appearanceKey] : undefined;
          const palette = saved?.palette ?? m?.palette;
          const hueShift = saved?.hueShift ?? m?.hueShift;
          // Use saved gender, fall back to identity gender from IDENTITY.md
          const gender = (saved?.gender || m?.identityGender || 'any') as 'male' | 'female' | 'any';

          if (layoutReadyRef.current) {
            const agentIsActive = m?.isActive !== false;
            os.addAgent(id, palette, hueShift, m?.seatId, true, m?.folderName, m?.projectId, gender, m?.openclawAgentId, m?.agentName, agentIsActive);
            // Save appearance for new OpenClaw agents
            if (m?.openclawAgentId && !saved?.palette) {
              const ch = os.characters.get(id);
              if (ch) {
                const key = `openclaw:${m.openclawAgentId}`;
                const appearance = { gender, palette: ch.palette, hueShift: ch.hueShift };
                appearancesRef.current[key] = appearance;
                authFetch(`/api/config/appearances/${key}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(appearance),
                }).catch(() => {});
              }
            }
          } else {
            pendingAgents.push({
              id,
              palette,
              hueShift,
              seatId: m?.seatId,
              folderName: m?.folderName,
              projectId: m?.projectId,
              gender,
              openclawAgentId: m?.openclawAgentId,
              agentName: m?.agentName,
              isActive: m?.isActive,
            });
          }
        }
        if (layoutReadyRef.current && os.characters.size > 0) {
          saveAgentSeats(os);
        }
        setAgents((prev) => {
          const ids = new Set(prev);
          const merged = [...prev];
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id);
            }
          }
          return merged.sort((a, b) => a - b);
        });
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        setAgentTools((prev) => {
          const list = prev[id] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return { ...prev, [id]: [...list, { toolId, status, done: false }] };
        });
        const toolName = extractToolName(status);
        os.setAgentTool(id, toolName);
        os.setAgentActive(id, true);
        os.clearPermissionBubble(id);
        // Record in activity log (skip if already recorded)
        setActivityLog((prev) => {
          const key = `${id}-${toolId}`;
          if (prev.some((e) => e.id === key)) return prev;
          const char = os.characters.get(id);
          const entry: ActivityEntry = {
            id: key,
            agentId: id,
            agentName: char?.folderName,
            toolName: toolName || status,
            status,
            timestamp: Date.now(),
            done: false,
            permissionWait: false,
          };
          const next = [entry, ...prev];
          return next.length > ACTIVITY_LOG_MAX_ENTRIES ? next.slice(0, ACTIVITY_LOG_MAX_ENTRIES) : next;
        });
        // Play soft tick sound for new activity
        playActivityTick();
        // Update speech bubble (no expiry while tool is active)
        const bubble = formatActivity(status);
        setAgentBubbles((prev) => ({
          ...prev,
          [id]: { icon: bubble.icon, label: bubble.label, expiresAt: Infinity },
        }));
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim();
          const subId = os.addSubagent(id, toolId);
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev;
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }];
          });
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          };
        });
        // Mark done in activity log
        setActivityLog((prev) => {
          const key = `${id}-${toolId}`;
          const idx = prev.findIndex((e) => e.id === key);
          if (idx === -1) return prev;
          return [...prev.slice(0, idx), { ...prev[idx], done: true, timestamp: Date.now() }, ...prev.slice(idx + 1)];
        });
        // Start bubble persist timer if no other active tools remain
        setAgentBubbles((prev) => {
          const existing = prev[id];
          if (!existing) return prev;
          // Only set expiry if bubble isn't already expiring (a newer tool may have started)
          if (existing.expiresAt !== Infinity) return prev;
          return { ...prev, [id]: { ...existing, expiresAt: Date.now() + SPEECH_BUBBLE_PERSIST_MS } };
        });
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os.setAgentTool(id, null);
        os.clearPermissionBubble(id);
        // Set bubble to expire after persist duration
        setAgentBubbles((prev) => {
          const existing = prev[id];
          if (!existing) return prev;
          return { ...prev, [id]: { ...existing, expiresAt: Date.now() + SPEECH_BUBBLE_PERSIST_MS } };
        });
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number;
        setSelectedAgent(id);
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number;
        const status = msg.status as string;
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: status };
        });
        os.setAgentActive(id, status === 'active');
        if (status === 'waiting') {
          os.showWaitingBubble(id);
          playDoneSound();
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
        os.showPermissionBubble(id);
        // Mark permission in activity log
        setActivityLog((prev) => {
          let changed = false;
          const next = prev.map((e) => {
            if (e.agentId === id && !e.done && !e.permissionWait) {
              changed = true;
              return { ...e, permissionWait: true };
            }
            return e;
          });
          return changed ? next : prev;
        });
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          os.showPermissionBubble(subId);
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const hasPermission = list.some((t) => t.permissionWait);
          if (!hasPermission) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          };
        });
        os.clearPermissionBubble(id);
        // Clear permission in activity log
        setActivityLog((prev) => {
          let changed = false;
          const next = prev.map((e) => {
            if (e.agentId === id && e.permissionWait) {
              changed = true;
              return { ...e, permissionWait: false };
            }
            return e;
          });
          return changed ? next : prev;
        });
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId);
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {};
          const list = agentSubs[parentToolId] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] },
          };
        });
        // Update sub-agent character's tool and active state
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          const subToolName = extractToolName(status);
          os.setAgentTool(subId, subToolName);
          os.setAgentActive(subId, true);
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const list = agentSubs[parentToolId];
          if (!list) return prev;
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
            },
          };
        });
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs || !(parentToolId in agentSubs)) return prev;
          const next = { ...agentSubs };
          delete next[parentToolId];
          if (Object.keys(next).length === 0) {
            const outer = { ...prev };
            delete outer[id];
            return outer;
          }
          return { ...prev, [id]: next };
        });
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId);
        setSubagentCharacters((prev) =>
          prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)),
        );
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{
          down: string[][][];
          up: string[][][];
          right: string[][][];
        }>;
        setCharacterTemplates(characters);
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        setFloorSprites(sprites);
      } else if (msg.type === 'wallTilesLoaded') {
        const sets = msg.sets as string[][][][];
        setWallSprites(sets);
      } else if (msg.type === 'workspaceFolders') {
        const folders = msg.folders as WorkspaceFolder[];
        setWorkspaceFolders(folders);
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean;
        setSoundEnabled(soundOn);
        if (typeof msg.showInactiveAgents === 'boolean') {
          setShowInactiveAgents(msg.showInactiveAgents);
        }
      } else if (msg.type === 'configUpdated') {
        const cfg = msg.config as { projects: MonitoredProjectInfo[]; showInactiveAgents?: boolean };
        if (cfg?.projects) {
          setMonitoredProjects(cfg.projects);
        }
        if (typeof cfg?.showInactiveAgents === 'boolean') {
          setShowInactiveAgents(cfg.showInactiveAgents);
        }
      } else if (msg.type === 'agentActivated') {
        const id = msg.id as number;
        os.setAgentActive(id, true);
        playSpawnSound();
      } else if (msg.type === 'agentDeactivated') {
        const id = msg.id as number;
        os.setAgentActive(id, false);
        os.setAgentTool(id, null);
        setAgentTools((prev) => { const n = { ...prev }; delete n[id]; return n; });
        setAgentStatuses((prev) => { const n = { ...prev }; delete n[id]; return n; });
      } else if (msg.type === 'existingActivities') {
        const activities = msg.activities as Array<{
          id: string;
          agentId: number;
          toolName: string;
          status: string;
          timestamp: number;
          done: boolean;
          permissionWait: boolean;
        }>;
        setActivityLog((prev) => {
          // Merge: keep existing entries, add history entries that aren't already present
          const existingIds = new Set(prev.map((e) => e.id));
          const newEntries = activities.filter((e) => !existingIds.has(e.id));
          if (newEntries.length === 0) return prev;
          const merged = [...prev, ...newEntries];
          // Sort newest first
          merged.sort((a, b) => b.timestamp - a.timestamp);
          return merged.length > 200 ? merged.slice(0, 200) : merged;
        });
      } else if (msg.type === 'activitiesCleared') {
        setActivityLog([]);
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[];
          const sprites = msg.sprites as Record<string, string[][]>;
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        } catch (err) {
          console.error('[WebSocket] Error processing furnitureAssetsLoaded:', err);
        }
      }
    });

    // Tell the server we're ready
    wsClient.send({ type: 'webviewReady' });

    return () => {
      unsubscribe();
    };
  }, [getOfficeState]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    monitoredProjects,
    activityLog,
    agentBubbles,
    showInactiveAgents,
  };
}
