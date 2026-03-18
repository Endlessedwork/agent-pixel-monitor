import { useCallback, useEffect, useRef, useState } from 'react';

interface MonitoredProject {
  id: string;
  path: string;
  name: string;
  source: 'claude-code' | 'openclaw';
}

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: MonitoredProject[];
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
  padding: '16px 20px',
  minWidth: 380,
  maxWidth: 500,
  boxShadow: 'var(--pixel-shadow)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '22px',
  color: 'var(--pixel-text)',
  marginBottom: 4,
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '22px',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const btnStyle: React.CSSProperties = {
  padding: '5px 14px',
  fontSize: '22px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--pixel-agent-bg)',
  border: '2px solid var(--pixel-agent-border)',
  color: 'var(--pixel-agent-text)',
};

export function AddProjectModal({ isOpen, onClose, projects }: AddProjectModalProps) {
  const [folderPath, setFolderPath] = useState('');
  const [source, setSource] = useState<'claude-code' | 'openclaw'>('claude-code');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderPath('');
      setProjectName('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleAdd = useCallback(async () => {
    const trimmed = folderPath.trim();
    if (!trimmed) {
      setError('Please enter a folder path');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/config/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: trimmed,
          source,
          name: projectName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add project');
        return;
      }

      setFolderPath('');
      setProjectName('');
    } catch {
      setError('Failed to connect to server');
    } finally {
      setIsSubmitting(false);
    }
  }, [folderPath, source, projectName]);

  const handleRemove = useCallback(async (id: string) => {
    try {
      await fetch(`/api/config/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // Server will broadcast configUpdated on success
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleAdd();
      if (e.key === 'Escape') onClose();
    },
    [handleAdd, onClose],
  );

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '28px', color: 'var(--pixel-text)', marginBottom: 12 }}>
          Add Project
        </div>

        {/* Add form */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Folder Path</label>
          <input
            ref={inputRef}
            style={inputStyle}
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/Users/.../my-project"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Source</label>
            <select
              style={selectStyle}
              value={source}
              onChange={(e) => setSource(e.target.value as 'claude-code' | 'openclaw')}
            >
              <option value="claude-code">Claude Code</option>
              <option value="openclaw">OpenClaw</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Name (optional)</label>
            <input
              style={inputStyle}
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="My Project"
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '20px', color: '#e55', marginBottom: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <button style={btnPrimary} onClick={handleAdd} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add'}
          </button>
          <button style={btnStyle} onClick={onClose}>
            Close
          </button>
        </div>

        {/* Monitored projects list */}
        {projects.length > 0 && (
          <div>
            <div style={{ fontSize: '22px', color: 'var(--pixel-text-dim)', marginBottom: 6 }}>
              Monitored Projects
            </div>
            {projects.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  marginBottom: 2,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--pixel-border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '22px', color: 'var(--pixel-text)' }}>{p.name}</div>
                  <div
                    style={{
                      fontSize: '18px',
                      color: 'var(--pixel-text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.path}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                  <span
                    style={{
                      fontSize: '16px',
                      color: p.source === 'claude-code' ? 'var(--pixel-accent)' : '#c9a0dc',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.source === 'claude-code' ? 'Claude' : 'OpenClaw'}
                  </span>
                  <button
                    style={{
                      ...btnStyle,
                      padding: '2px 8px',
                      fontSize: '18px',
                      color: 'var(--pixel-close-text)',
                    }}
                    onClick={() => handleRemove(p.id)}
                    title="Remove project"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
