import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ACTIVITY_LOG_MAX_ENTRIES } from './constants.js';
import { ActivityEntryList } from './components/ActivityEntryList.js';
import type { ActivityEntry } from './office/types.js';
import { wsClient } from './wsClient.js';

// ── Styles ──

const pageStyle: React.CSSProperties = {
  width: '100%',
  height: '100vh',
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'FS Pixel Sans', monospace",
  overflow: 'hidden',
};

const titleBarStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '13px',
  fontWeight: 'bold',
  color: 'var(--pixel-text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '1.5px',
  borderBottom: '2px solid var(--pixel-border)',
  background: 'rgba(255, 255, 255, 0.03)',
  flexShrink: 0,
};

const agentHeaderStyle: React.CSSProperties = {
  padding: '8px 16px 4px',
  fontSize: '14px',
  fontWeight: 'bold',
  color: 'var(--pixel-accent, #4fc3f7)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  background: 'rgba(255, 255, 255, 0.02)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

function countActive(entries: readonly ActivityEntry[]): number {
  return entries.filter((e) => !e.done).length;
}

// ── Component ──

export default function ActivitiesPage() {
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const agentNamesRef = useRef<Record<number, string>>({});
  const [, forceRender] = useState(0);

  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>;
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'agentCreated' || msg.type === 'existingAgents') {
      // Track agent names
      if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        const name = (msg.agentName as string) || (msg.folderName as string);
        if (name) {
          agentNamesRef.current[id] = name;
          forceRender((n) => n + 1);
        }
      } else {
        const agents = msg.agents as Array<Record<string, unknown>>;
        if (Array.isArray(agents)) {
          for (const a of agents) {
            const id = a.id as number;
            const name = (a.agentName as string) || (a.folderName as string);
            if (name) agentNamesRef.current[id] = name;
          }
          forceRender((n) => n + 1);
        }
      }
    } else if (msg.type === 'existingActivities') {
      const activities = msg.activities as ActivityEntry[];
      setActivityLog((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEntries = activities.filter((e) => !existingIds.has(e.id));
        if (newEntries.length === 0) return prev;
        const merged = [...prev, ...newEntries];
        merged.sort((a, b) => b.timestamp - a.timestamp);
        return merged.length > 200 ? merged.slice(0, 200) : merged;
      });
    } else if (msg.type === 'agentToolStart') {
      const id = msg.id as number;
      const toolId = msg.toolId as string;
      const status = msg.status as string;
      setActivityLog((prev) => {
        const key = `${id}-${toolId}`;
        if (prev.some((e) => e.id === key)) return prev;
        const entry: ActivityEntry = {
          id: key,
          agentId: id,
          agentName: agentNamesRef.current[id],
          toolName: status,
          status,
          timestamp: Date.now(),
          done: false,
          permissionWait: false,
        };
        const next = [entry, ...prev];
        return next.length > ACTIVITY_LOG_MAX_ENTRIES ? next.slice(0, ACTIVITY_LOG_MAX_ENTRIES) : next;
      });
    } else if (msg.type === 'agentToolDone') {
      const id = msg.id as number;
      const toolId = msg.toolId as string;
      setActivityLog((prev) => {
        const key = `${id}-${toolId}`;
        const idx = prev.findIndex((e) => e.id === key);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), { ...prev[idx], done: true, timestamp: Date.now() }, ...prev.slice(idx + 1)];
      });
    } else if (msg.type === 'agentToolPermission') {
      const id = msg.id as number;
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
    } else if (msg.type === 'agentToolPermissionClear') {
      const id = msg.id as number;
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
    } else if (msg.type === 'activitiesCleared') {
      setActivityLog([]);
    }
  }, []);

  useEffect(() => {
    wsClient.connect();
    const unsubscribe = wsClient.onMessage(handleMessage);
    wsClient.send({ type: 'webviewReady' });
    return () => {
      unsubscribe();
    };
  }, [handleMessage]);

  const grouped = useMemo(() => {
    const groups = new Map<number, ActivityEntry[]>();
    for (const entry of activityLog) {
      const list = groups.get(entry.agentId);
      if (list) {
        list.push(entry);
      } else {
        groups.set(entry.agentId, [entry]);
      }
    }
    for (const [, entries] of groups) {
      entries.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.timestamp - a.timestamp;
      });
    }
    const sortedIds = [...groups.keys()].sort((a, b) => {
      const aLatest = groups.get(a)![0].timestamp;
      const bLatest = groups.get(b)![0].timestamp;
      return bLatest - aLatest;
    });
    return { groups, sortedIds };
  }, [activityLog]);

  return (
    <div style={pageStyle}>
      <div style={titleBarStyle}>Activity</div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {activityLog.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--pixel-text-dim)',
              fontSize: '13px',
              opacity: 0.5,
            }}
          >
            No activity yet
          </div>
        ) : (
          grouped.sortedIds.map((agentId) => {
            const entries = grouped.groups.get(agentId)!;
            const nameFromEntries = entries.find((e) => e.agentName)?.agentName;
            const name = agentNamesRef.current[agentId] || nameFromEntries || `Agent #${agentId}`;
            const active = countActive(entries);
            return (
              <div key={agentId} style={{ marginBottom: 4 }}>
                <div style={agentHeaderStyle}>
                  <span>{name}</span>
                  {active > 0 && (
                    <span
                      style={{
                        fontSize: '11px',
                        background: 'var(--pixel-status-active)',
                        color: '#fff',
                        borderRadius: 3,
                        padding: '0 5px',
                        lineHeight: '16px',
                        fontWeight: 'normal',
                      }}
                    >
                      {active}
                    </span>
                  )}
                </div>
                <ActivityEntryList entries={entries} showAgentName />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
