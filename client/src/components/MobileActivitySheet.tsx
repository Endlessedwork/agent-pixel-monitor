import type { ActivityEntry } from '../office/types.js';
import { MobileBottomSheet } from './MobileBottomSheet.js';
import { ActivityEntryList } from './ActivityEntryList.js';

interface MobileActivitySheetProps {
  activities: readonly ActivityEntry[];
  isOpen: boolean;
  onClose: () => void;
  agentCount: number;
}

export function MobileActivitySheet({
  activities,
  isOpen,
  onClose,
  agentCount,
}: MobileActivitySheetProps) {
  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[0.5, 0.85]}>
      <div style={{ padding: '0 12px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{
            color: 'var(--pixel-accent, #5a8cff)',
            fontWeight: 'bold',
            fontSize: 13,
          }}>
            Activity Log
          </span>
          <span style={{
            color: 'var(--pixel-text-dim)',
            fontSize: 11,
          }}>
            {activities.length} entries · {agentCount} agents
          </span>
        </div>
        <ActivityEntryList entries={activities} showAgentName />
      </div>
    </MobileBottomSheet>
  );
}
