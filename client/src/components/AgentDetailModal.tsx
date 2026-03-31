import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ACTIVITY_TIMESTAMP_REFRESH_MS } from '../constants.js';
import { formatActivity } from '../office/formatActivity.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { MALE_PALETTES, FEMALE_PALETTES } from '../office/engine/officeState.js';
import { getCharacterSprites } from '../office/sprites/spriteData.js';
import { Direction, type ActivityEntry, type Character, type SpriteData, type ToolActivity } from '../office/types.js';
import type { MonitoredProjectInfo } from '../hooks/useExtensionMessages.js';

interface AgentDetailModalProps {
  readonly agentId: number;
  readonly officeState: OfficeState;
  readonly agentTools: Record<number, ToolActivity[]>;
  readonly agentStatuses: Record<number, string>;
  readonly activityLog: readonly ActivityEntry[];
  readonly monitoredProjects: readonly MonitoredProjectInfo[];
  readonly onClose: () => void;
  readonly onCloseAgent: (id: number) => void;
}

const DETAIL_ACTIVITY_MAX = 20;

function formatRelativeTime(timestamp: number, now: number): string {
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 5) return 'now';
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h`;
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: 0,
  minWidth: 380,
  maxWidth: 500,
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: 'var(--pixel-shadow)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '2px solid var(--pixel-border)',
  background: 'rgba(255, 255, 255, 0.03)',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '8px 16px 4px',
  fontSize: '11px',
  fontWeight: 'bold',
  color: 'var(--pixel-text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '1.5px',
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  padding: '4px 16px',
  fontSize: '13px',
  gap: 8,
};

const toolRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 16px',
  fontSize: '13px',
};

const activityRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 16px',
  fontSize: '12px',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  padding: '12px 16px',
  borderTop: '2px solid var(--pixel-border)',
};

const btnStyle: React.CSSProperties = {
  padding: '5px 14px',
  fontSize: '13px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--pixel-text-dim)',
  fontSize: '18px',
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
};

const PREVIEW_SCALE = 4;
const PREVIEW_FRAME_MS = 400;
const MINI_PREVIEW_SCALE = 3;

/** Renders a pixel-art character sprite on a small canvas, animated like an RPG character select screen */
function CharacterPreview({ character }: { readonly character: Character }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const sprites = useMemo(
    () => getCharacterSprites(character.palette, character.hueShift),
    [character.palette, character.hueShift],
  );

  const drawFrame = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Use front-facing idle walk animation (frame 0,1,2,1 loop)
      const walkCycle = [0, 1, 2, 1];
      const spriteData: SpriteData = sprites.walk[Direction.DOWN][walkCycle[frame % 4]];
      if (!spriteData || spriteData.length === 0) return;

      const rows = spriteData.length;
      const cols = spriteData[0].length;
      canvas.width = cols * PREVIEW_SCALE;
      canvas.height = rows * PREVIEW_SCALE;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const color = spriteData[r][c];
          if (color === '') continue;
          ctx.fillStyle = color;
          ctx.fillRect(c * PREVIEW_SCALE, r * PREVIEW_SCALE, PREVIEW_SCALE, PREVIEW_SCALE);
        }
      }
    },
    [sprites],
  );

  useEffect(() => {
    drawFrame(0);
    const interval = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % 4;
      drawFrame(frameRef.current);
    }, PREVIEW_FRAME_MS);
    return () => clearInterval(interval);
  }, [drawFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        imageRendering: 'pixelated',
        flexShrink: 0,
      }}
    />
  );
}

function MiniCharacterPreview({ palette, hueShift }: { readonly palette: number; readonly hueShift: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const sprites = useMemo(
    () => getCharacterSprites(palette, hueShift),
    [palette, hueShift],
  );

  const drawFrame = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const walkCycle = [0, 1, 2, 1];
      const spriteData: SpriteData = sprites.walk[Direction.DOWN][walkCycle[frame % 4]];
      if (!spriteData || spriteData.length === 0) return;
      const rows = spriteData.length;
      const cols = spriteData[0].length;
      canvas.width = cols * MINI_PREVIEW_SCALE;
      canvas.height = rows * MINI_PREVIEW_SCALE;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const color = spriteData[r][c];
          if (color === '') continue;
          ctx.fillStyle = color;
          ctx.fillRect(c * MINI_PREVIEW_SCALE, r * MINI_PREVIEW_SCALE, MINI_PREVIEW_SCALE, MINI_PREVIEW_SCALE);
        }
      }
    },
    [sprites],
  );

  useEffect(() => {
    frameRef.current = 0;
    drawFrame(0);
    const interval = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % 4;
      drawFrame(frameRef.current);
    }, PREVIEW_FRAME_MS);
    return () => clearInterval(interval);
  }, [drawFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}

function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={pulse ? 'pixel-agents-pulse' : undefined}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: `0 0 4px ${color}`,
      }}
    />
  );
}

function getStatusInfo(status: string | undefined): { label: string; color: string; pulse: boolean } {
  if (!status || status === 'active') {
    return { label: 'Active', color: 'var(--pixel-status-active)', pulse: true };
  }
  if (status === 'waiting') {
    return { label: 'Waiting for input', color: 'var(--pixel-status-permission)', pulse: true };
  }
  return { label: status, color: 'var(--pixel-text-dim)', pulse: false };
}

export function AgentDetailModal({
  agentId,
  officeState,
  agentTools,
  agentStatuses,
  activityLog,
  monitoredProjects,
  onClose,
  onCloseAgent,
}: AgentDetailModalProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), ACTIVITY_TIMESTAMP_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const character = officeState.characters.get(agentId);

  const [selectedPalette, setSelectedPalette] = useState<number>(character?.palette ?? 0);
  const [selectedHueShift, setSelectedHueShift] = useState<number>(character?.hueShift ?? 0);
  const [saving, setSaving] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState(false);

  const hasChanges = character != null && (
    selectedPalette !== character.palette || selectedHueShift !== character.hueShift
  );

  const name = character?.folderName || `Agent #${agentId}`;
  const project = monitoredProjects.find((p) => p.id === character?.projectId);

  const tools = agentTools[agentId] || [];
  const activeTools = tools.filter((t) => !t.done);
  const status = agentStatuses[agentId];
  const statusInfo = getStatusInfo(character?.isActive ? undefined : status);

  // If agent is active (has tools running), show active status
  const displayStatus = activeTools.length > 0
    ? { label: 'Active', color: 'var(--pixel-status-active)', pulse: true }
    : statusInfo;

  // Filter activity log for this agent, limited to most recent entries
  const agentActivity = useMemo(
    () => activityLog.filter((e) => e.agentId === agentId).slice(0, DETAIL_ACTIVITY_MAX),
    [activityLog, agentId],
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {character && (
              <CharacterPreview
                character={
                  character.openclawAgentId && editingCharacter
                    ? { ...character, palette: selectedPalette, hueShift: selectedHueShift }
                    : character
                }
              />
            )}
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--pixel-accent)' }}>
              {name}
            </span>
          </div>
          <button style={closeBtnStyle} onClick={onClose} title="Close">
            X
          </button>
        </div>

        {/* Info Section */}
        <div style={{ padding: '8px 0' }}>
          <div style={sectionHeaderStyle}>Info</div>
          {project && (
            <>
              <div style={infoRowStyle}>
                <span style={{ color: 'var(--pixel-text-dim)', flexShrink: 0 }}>Project</span>
                <span
                  style={{
                    color: 'var(--pixel-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={project.path}
                >
                  {project.name}
                </span>
              </div>
              <div style={infoRowStyle}>
                <span style={{ color: 'var(--pixel-text-dim)', flexShrink: 0 }}>Path</span>
                <span
                  style={{
                    color: 'var(--pixel-text)',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: 0.7,
                  }}
                  title={project.path}
                >
                  {project.path}
                </span>
              </div>
              <div style={infoRowStyle}>
                <span style={{ color: 'var(--pixel-text-dim)', flexShrink: 0 }}>Source</span>
                <span
                  style={{
                    color: project.source === 'claude-code' ? 'var(--pixel-accent)' : '#c9a0dc',
                  }}
                >
                  {project.source === 'claude-code' ? 'Claude Code' : 'OpenClaw'}
                </span>
              </div>
            </>
          )}
          <div style={infoRowStyle}>
            <span style={{ color: 'var(--pixel-text-dim)', flexShrink: 0 }}>Status</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusDot color={displayStatus.color} pulse={displayStatus.pulse} />
              <span style={{ color: 'var(--pixel-text)' }}>{displayStatus.label}</span>
            </span>
          </div>
        </div>

        {/* Character Selection */}
        {character?.openclawAgentId && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Character</span>
              {!editingCharacter && (
                <button
                  onClick={() => setEditingCharacter(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--pixel-accent)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '0 0 0 8px',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                  }}
                >
                  Edit
                </button>
              )}
            </div>

            {!editingCharacter ? null : (<>
            {/* Male palettes */}
            <div style={{ padding: '4px 16px 2px', fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
              Male
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '4px 16px' }}>
              {MALE_PALETTES.map((p) => (
                <div
                  key={p}
                  onClick={() => setSelectedPalette(p)}
                  style={{
                    cursor: 'pointer',
                    border: selectedPalette === p
                      ? '2px solid var(--pixel-accent)'
                      : '2px solid transparent',
                    padding: 2,
                    background: selectedPalette === p ? 'rgba(255,255,255,0.06)' : 'transparent',
                  }}
                >
                  <MiniCharacterPreview palette={p} hueShift={selectedPalette === p ? selectedHueShift : 0} />
                </div>
              ))}
            </div>

            {/* Female palettes */}
            <div style={{ padding: '4px 16px 2px', fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
              Female
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '4px 16px' }}>
              {FEMALE_PALETTES.map((p) => (
                <div
                  key={p}
                  onClick={() => setSelectedPalette(p)}
                  style={{
                    cursor: 'pointer',
                    border: selectedPalette === p
                      ? '2px solid var(--pixel-accent)'
                      : '2px solid transparent',
                    padding: 2,
                    background: selectedPalette === p ? 'rgba(255,255,255,0.06)' : 'transparent',
                  }}
                >
                  <MiniCharacterPreview palette={p} hueShift={selectedPalette === p ? selectedHueShift : 0} />
                </div>
              ))}
            </div>

            {/* Hue Shift slider */}
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', flexShrink: 0 }}>Hue Shift</span>
              <input
                type="range"
                min={0}
                max={315}
                step={45}
                value={selectedHueShift}
                onChange={(e) => setSelectedHueShift(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '11px', color: 'var(--pixel-text)', minWidth: 30, textAlign: 'right' }}>
                {selectedHueShift}°
              </span>
            </div>

            {/* Save button */}
            <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => {
                  setEditingCharacter(false);
                  setSelectedPalette(character?.palette ?? 0);
                  setSelectedHueShift(character?.hueShift ?? 0);
                }}
                style={btnStyle}
              >
                Cancel
              </button>
              <button
                disabled={!hasChanges || saving}
                onClick={async () => {
                  if (!character?.openclawAgentId) return;
                  setSaving(true);
                  const gender = MALE_PALETTES.includes(selectedPalette) ? 'male' : 'female';
                  const agentKey = `openclaw:${character.openclawAgentId}`;
                  try {
                    const response = await fetch(`/api/config/appearances/${agentKey}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gender, palette: selectedPalette, hueShift: selectedHueShift }),
                    });
                    if (response.ok) {
                      // Update OfficeState directly
                      character.palette = selectedPalette;
                      character.hueShift = selectedHueShift;
                      setEditingCharacter(false);
                    }
                  } finally {
                    setSaving(false);
                  }
                }}
                style={{
                  ...btnStyle,
                  opacity: (!hasChanges || saving) ? 0.4 : 1,
                  cursor: (!hasChanges || saving) ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            </>)}
          </div>
        )}

        {/* Current Tools */}
        {activeTools.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
            <div style={sectionHeaderStyle}>Current Tools</div>
            {activeTools.map((tool) => {
              const { icon } = formatActivity(tool.status);
              const dotColor = tool.permissionWait
                ? 'var(--pixel-status-permission)'
                : 'var(--pixel-status-active)';
              return (
                <div key={tool.toolId} style={toolRowStyle}>
                  <StatusDot color={dotColor} pulse={!tool.permissionWait} />
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>{icon}</span>
                  <span
                    style={{
                      color: 'var(--pixel-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tool.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Activity */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
          <div style={sectionHeaderStyle}>Recent Activity</div>
          {agentActivity.length === 0 ? (
            <div
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                color: 'var(--pixel-text-dim)',
                opacity: 0.5,
              }}
            >
              No activity yet
            </div>
          ) : (
            agentActivity.map((entry) => {
              const { icon } = formatActivity(entry.status);
              const timeStr = formatRelativeTime(entry.timestamp, now);
              const dotColor = entry.done
                ? 'var(--pixel-status-done)'
                : entry.permissionWait
                  ? 'var(--pixel-status-permission)'
                  : 'var(--pixel-status-active)';
              return (
                <div
                  key={entry.id}
                  style={{
                    ...activityRowStyle,
                    opacity: entry.done ? 0.55 : 1,
                  }}
                  title={entry.status}
                >
                  <StatusDot color={dotColor} pulse={!entry.done && !entry.permissionWait} />
                  <span style={{ fontSize: '12px', lineHeight: 1 }}>{icon}</span>
                  <span
                    style={{
                      flex: 1,
                      color: 'var(--pixel-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.status}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: timeStr === 'now' ? 'var(--pixel-status-active)' : 'var(--pixel-text-dim)',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 24,
                      textAlign: 'right',
                    }}
                  >
                    {timeStr}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button
            style={{ ...btnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => {
              onCloseAgent(agentId);
              onClose();
            }}
          >
            Close Agent
          </button>
          <button style={btnStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
