import { useMemo } from 'react';

import type { ActivityEntry } from '../office/types.js';
import { ActivityEntryList } from './ActivityEntryList.js';

interface ActivitySidebarProps {
  readonly activityLog: readonly ActivityEntry[];
  readonly agents: readonly number[];
  readonly agentNames: Readonly<Record<number, string>>;
}

const sidebarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 340,
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

/** Count active (non-done) entries for an agent */
function countActive(entries: readonly ActivityEntry[]): number {
  return entries.filter((e) => !e.done).length;
}

export function ActivitySidebar({ activityLog, agentNames }: ActivitySidebarProps) {
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
    // Sort entries within each group: active (not done) first, then by timestamp descending
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
              <ActivityEntryList entries={entries} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
