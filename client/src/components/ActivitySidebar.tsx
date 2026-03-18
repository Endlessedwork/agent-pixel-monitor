import { useEffect, useMemo, useState } from 'react';

import { ACTIVITY_TIMESTAMP_REFRESH_MS } from '../constants.js';
import { formatActivity } from '../office/formatActivity.js';
import type { ActivityEntry } from '../office/types.js';

interface ActivitySidebarProps {
  readonly activityLog: readonly ActivityEntry[];
  readonly agents: readonly number[];
  readonly agentNames: Readonly<Record<number, string>>;
}

function formatRelativeTime(timestamp: number, now: number): string {
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 5) return 'now';
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h`;
}

function StatusDot({ entry }: { entry: ActivityEntry }) {
  const color = entry.done
    ? 'var(--pixel-status-done)'
    : entry.permissionWait
      ? 'var(--pixel-status-permission)'
      : 'var(--pixel-status-active)';

  return (
    <span
      className={!entry.done && !entry.permissionWait ? 'pixel-agents-pulse' : undefined}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: entry.done ? 'none' : `0 0 4px ${color}`,
      }}
    />
  );
}

const sidebarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 260,
  background: 'var(--pixel-bg)',
  borderLeft: '2px solid var(--pixel-border)',
  boxShadow: 'var(--pixel-shadow)',
  zIndex: 45,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const titleBarStyle: React.CSSProperties = {
  padding: '8px 12px',
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
  padding: '8px 12px 4px',
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

const activeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 12px 5px 16px',
  fontSize: '13px',
  color: 'var(--pixel-text)',
  borderLeft: '2px solid var(--pixel-status-active)',
  margin: '1px 0',
  background: 'rgba(55, 148, 255, 0.06)',
};

const doneRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 12px 4px 16px',
  fontSize: '13px',
  color: 'var(--pixel-text-dim)',
  borderLeft: '2px solid transparent',
  margin: '1px 0',
  opacity: 0.55,
};

const permissionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 12px 5px 16px',
  fontSize: '13px',
  color: 'var(--pixel-text)',
  borderLeft: '2px solid var(--pixel-status-permission)',
  margin: '1px 0',
  background: 'rgba(204, 167, 0, 0.08)',
};

function getRowStyle(entry: ActivityEntry): React.CSSProperties {
  if (entry.permissionWait) return permissionRowStyle;
  if (entry.done) return doneRowStyle;
  return activeRowStyle;
}

/** Count active (non-done) entries for an agent */
function countActive(entries: readonly ActivityEntry[]): number {
  return entries.filter((e) => !e.done).length;
}

export function ActivitySidebar({ activityLog, agentNames }: ActivitySidebarProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), ACTIVITY_TIMESTAMP_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

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
    const sortedIds = [...groups.keys()].sort((a, b) => {
      const aLatest = groups.get(a)![0].timestamp;
      const bLatest = groups.get(b)![0].timestamp;
      return bLatest - aLatest;
    });
    return { groups, sortedIds };
  }, [activityLog]);

  if (activityLog.length === 0) {
    return (
      <div style={sidebarStyle}>
        <div style={titleBarStyle}>Activity</div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--pixel-text-dim)',
            fontSize: '13px',
            opacity: 0.5,
          }}
        >
          No activity yet
        </div>
      </div>
    );
  }

  return (
    <div style={sidebarStyle}>
      <div style={titleBarStyle}>Activity</div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {grouped.sortedIds.map((agentId) => {
          const entries = grouped.groups.get(agentId)!;
          const name = agentNames[agentId] || `Agent #${agentId}`;
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
              {entries.map((entry) => {
                const { icon, label } = formatActivity(entry.status);
                const timeStr = formatRelativeTime(entry.timestamp, now);
                return (
                  <div key={entry.id} style={getRowStyle(entry)} title={entry.status}>
                    <StatusDot entry={entry} />
                    <span style={{ flexShrink: 0, fontSize: '13px', lineHeight: 1 }}>{icon}</span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.3,
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: timeStr === 'now'
                          ? 'var(--pixel-status-active)'
                          : 'var(--pixel-text-dim)',
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
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
