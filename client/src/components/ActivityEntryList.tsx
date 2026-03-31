import { useState, useEffect } from 'react';

import { ACTIVITY_TIMESTAMP_REFRESH_MS } from '../constants.js';
import { formatActivity } from '../office/formatActivity.js';
import type { ActivityEntry } from '../office/types.js';

// ── Formatting ──

export function formatRelativeTime(timestamp: number, now: number): string {
  const sec = Math.floor((now - timestamp) / 1000);
  if (sec < 5) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

// ── StatusDot ──

export function StatusDot({ entry }: { entry: ActivityEntry }) {
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

// ── Entry Row Styles ──

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

// ── Component ──

interface ActivityEntryListProps {
  entries: readonly ActivityEntry[];
  maxHeight?: string;
  /** When true, show agent name on each entry row (for flat lists without agent group headers) */
  showAgentName?: boolean;
  /** Fallback agent name lookup by id */
  agentNames?: Readonly<Record<number, string>>;
}

export function ActivityEntryList({ entries, maxHeight, showAgentName, agentNames }: ActivityEntryListProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ACTIVITY_TIMESTAMP_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      {entries.map((entry) => {
        const { icon } = formatActivity(entry.status);
        const timeStr = formatRelativeTime(entry.timestamp, now);
        const name = showAgentName
          ? entry.agentName || agentNames?.[entry.agentId] || `Agent #${entry.agentId}`
          : undefined;
        return (
          <div key={entry.id} style={getRowStyle(entry)} title={entry.status}>
            <StatusDot entry={entry} />
            <span style={{ flexShrink: 0, fontSize: '13px', lineHeight: 1 }}>{icon}</span>
            {name && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '11px',
                  color: 'var(--pixel-accent, #4fc3f7)',
                  fontWeight: 'bold',
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </span>
            )}
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}
            >
              {entry.status}
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
}
