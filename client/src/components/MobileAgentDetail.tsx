import type { ToolActivity } from '../office/types.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { MonitoredProjectInfo } from '../hooks/useExtensionMessages.js';
import { formatActivity } from '../office/formatActivity.js';
import { MobileBottomSheet } from './MobileBottomSheet.js';

interface MobileAgentDetailProps {
  agentId: number | null;
  officeState: OfficeState;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  monitoredProjects: readonly MonitoredProjectInfo[];
  onClose: () => void;
}

export function MobileAgentDetail({
  agentId,
  officeState,
  agentTools,
  agentStatuses,
  monitoredProjects,
  onClose,
}: MobileAgentDetailProps) {
  if (agentId === null) return null;

  // Character is a Map — use .get()
  const character = officeState.characters.get(agentId);
  if (!character) return null;

  const name = character.agentName || character.folderName || `Agent #${agentId}`;
  const tools = agentTools[agentId] ?? [];
  const activeTools = tools.filter(t => !t.done);
  const status = agentStatuses[agentId] ?? 'idle';

  // Find project via character.projectId (not projectPath/projectName — those don't exist)
  const project = monitoredProjects.find(p => p.id === character.projectId);

  return (
    <MobileBottomSheet isOpen={true} onClose={onClose} snapPoints={[0.45]}>
      <div style={{ padding: '0 12px' }}>
        {/* Agent header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            🧑‍💻
          </div>
          <div>
            <div
              style={{
                color: 'var(--pixel-accent, #5a8cff)',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: character.isActive
                  ? 'var(--pixel-status-active, #3794ff)'
                  : 'var(--pixel-text-dim)',
              }}
            >
              ● {character.isActive ? 'Active' : 'Idle'}
            </div>
          </div>
        </div>

        {/* Info cards */}
        {project && (
          <>
            <InfoCard label="Project" value={project.name} />
            <InfoCard label="Path" value={project.path} />
            <InfoCard label="Source" value={project.source} />
          </>
        )}

        {/* Active tools — use formatActivity(tool.status) since ToolActivity has no label field */}
        {activeTools.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--pixel-text-dim)',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Active Tools
            </div>
            {activeTools.map((tool, i) => {
              const { icon } = formatActivity(tool.status);
              return (
                <div
                  key={i}
                  style={{
                    padding: '4px 8px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 4,
                    fontSize: 11,
                    color: 'var(--pixel-text)',
                    marginBottom: 3,
                  }}
                >
                  {icon} {tool.status}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 4,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: 'var(--pixel-text-dim)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--pixel-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}
