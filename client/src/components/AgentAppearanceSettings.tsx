import { useEffect, useState } from 'react';
import { authFetch } from '../wsClient.js';

interface AgentAppearanceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AgentInfo {
  id: string;
  name: string;
}

interface AppearanceConfig {
  gender: string;
  palette?: number;
  hueShift?: number;
}

export function AgentAppearanceSettings({ isOpen, onClose }: AgentAppearanceSettingsProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [appearances, setAppearances] = useState<Record<string, AppearanceConfig>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      authFetch('/api/openclaw/agents').then(r => r.json()),
      authFetch('/api/config/appearances').then(r => r.json()),
    ])
      .then(([agentData, appearData]) => {
        setAgents(agentData.agents || []);
        setAppearances(appearData || {});
      })
      .catch(() => {
        setAgents([]);
        setAppearances({});
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleGenderChange = async (agentId: string, gender: string) => {
    const key = `openclaw:${agentId}`;
    const updated: AppearanceConfig = { gender, palette: undefined, hueShift: undefined };
    setAppearances(prev => ({ ...prev, [key]: updated }));
    await authFetch(`/api/config/appearances/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Dark backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 59,
        }}
      />
      {/* Modal panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 60,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 320,
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>
            Agent Appearances
          </span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: '4px 10px 8px' }}>
          {loading && (
            <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '24px', padding: '8px 0' }}>
              Loading...
            </div>
          )}
          {!loading && agents.length === 0 && (
            <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '24px', padding: '8px 0' }}>
              No OpenClaw agents found.
            </div>
          )}
          {!loading &&
            agents.map(agent => {
              const key = `openclaw:${agent.id}`;
              const appearance = appearances[key];
              const currentGender = appearance?.gender || 'any';
              const currentPalette = appearance?.palette;

              return (
                <div
                  key={agent.id}
                  onMouseEnter={() => setHovered(agent.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 4px',
                    background:
                      hovered === agent.id ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {/* Agent info */}
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <div
                      style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: 'rgba(255, 255, 255, 0.9)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {agent.name}
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        color: 'rgba(255, 255, 255, 0.4)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {agent.id}
                    </div>
                  </div>

                  {/* Palette indicator */}
                  {currentPalette != null && (
                    <span
                      style={{
                        fontSize: '20px',
                        color: 'rgba(255, 255, 255, 0.4)',
                        marginRight: 8,
                        flexShrink: 0,
                      }}
                    >
                      P{currentPalette}
                    </span>
                  )}

                  {/* Gender select */}
                  <select
                    value={currentGender}
                    onChange={e => handleGenderChange(agent.id, e.target.value)}
                    style={{
                      background: 'var(--pixel-btn-bg)',
                      color: 'var(--pixel-text)',
                      border: '2px solid var(--pixel-border)',
                      borderRadius: 0,
                      padding: '2px 6px',
                      fontSize: '22px',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      flexShrink: 0,
                      outline: 'none',
                    }}
                  >
                    <option value="any">Any</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
