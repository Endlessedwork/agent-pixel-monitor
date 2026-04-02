/**
 * MiniappSettings — Settings Phase 1 for Telegram MiniApp
 *
 * Presents as a MobileBottomSheet (dark theme).
 * Settings:
 *  1. Default Agent — dropdown
 *  2. Notification Settings — toggle + channel selector
 *  3. Language — Thai / English
 *
 * Storage: localStorage (primary) + server sync via /api/settings/miniapp
 */

import { useState, useEffect, useCallback } from 'react';
import { MobileBottomSheet } from './MobileBottomSheet.js';
import { useI18n, type Language } from '../i18n.js';
import { authFetch } from '../wsClient.js';

// ── Types ────────────────────────────────────────────────────

export interface MiniappSettingsData {
  defaultAgent: string;
  notificationsEnabled: boolean;
  notificationChannel: 'telegram' | 'line';
  language: Language;
}

const DEFAULT_SETTINGS: MiniappSettingsData = {
  defaultAgent: 'main',
  notificationsEnabled: true,
  notificationChannel: 'telegram',
  language: 'th',
};

const STORAGE_KEY = 'miniapp_settings_v1';

function loadSettings(): MiniappSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

async function saveSettingsToServer(data: MiniappSettingsData): Promise<void> {
  try {
    await authFetch('/api/settings/miniapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch { /* silently fail — offline */ }
}

// ── Agent list fetcher ───────────────────────────────────────

interface AgentEntry {
  id: string;
  name: string;
}

async function fetchAgents(): Promise<AgentEntry[]> {
  try {
    const res = await authFetch('/api/openclaw/agents');
    if (!res.ok) return [];
    const data = await res.json() as { agents: AgentEntry[] };
    return data.agents || [];
  } catch {
    return [];
  }
}

// ── Styles ───────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  paddingBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 'bold',
  color: 'var(--pixel-accent, #5a8cff)',
  marginBottom: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.85)',
};

const descStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.45)',
  marginTop: 2,
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.9)',
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  minWidth: 120,
  maxWidth: 160,
};

// ── Toggle Switch ────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        background: value ? 'var(--pixel-accent, #5a8cff)' : 'rgba(255,255,255,0.15)',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0,
      }}
      aria-checked={value}
      role="switch"
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: value ? 20 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}
      />
    </button>
  );
}

// ── Channel Selector ─────────────────────────────────────────

function ChannelSelector({
  value,
  onChange,
}: {
  value: 'telegram' | 'line';
  onChange: (v: 'telegram' | 'line') => void;
}) {
  const channels: Array<{ id: 'telegram' | 'line'; icon: string; label: string }> = [
    { id: 'telegram', icon: '▲', label: 'Telegram' },
    { id: 'line', icon: '●', label: 'LINE' },
  ];

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {channels.map((ch) => (
        <button
          key={ch.id}
          onClick={() => onChange(ch.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 16,
            border: `1px solid ${value === ch.id ? 'var(--pixel-accent, #5a8cff)' : 'rgba(255,255,255,0.2)'}`,
            background:
              value === ch.id ? 'rgba(90,140,255,0.2)' : 'rgba(255,255,255,0.06)',
            color:
              value === ch.id ? 'var(--pixel-accent, #5a8cff)' : 'rgba(255,255,255,0.6)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 9 }}>{ch.icon}</span>
          {ch.label}
        </button>
      ))}
    </div>
  );
}

// ── Language Selector ────────────────────────────────────────

function LangSelector({
  value,
  onChange,
}: {
  value: Language;
  onChange: (v: Language) => void;
}) {
  const options: Array<{ id: Language; icon: string; label: string }> = [
    { id: 'th', icon: '◆', label: 'ไทย' },
    { id: 'en', icon: '◆', label: 'English' },
  ];

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 12px',
            borderRadius: 16,
            border: `1px solid ${value === opt.id ? 'var(--pixel-accent, #5a8cff)' : 'rgba(255,255,255,0.2)'}`,
            background:
              value === opt.id ? 'rgba(90,140,255,0.2)' : 'rgba(255,255,255,0.06)',
            color:
              value === opt.id ? 'var(--pixel-accent, #5a8cff)' : 'rgba(255,255,255,0.6)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 0.15s',
            fontWeight: value === opt.id ? 'bold' : 'normal',
          }}
        >
          <span
            style={{
              fontSize: 7,
              color: value === opt.id ? 'var(--pixel-accent, #5a8cff)' : 'rgba(255,255,255,0.4)',
            }}
          >
            {value === opt.id ? '◆' : '◇'}
          </span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

interface MiniappSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MiniappSettings({ isOpen, onClose }: MiniappSettingsProps) {
  const { t, setLang } = useI18n();

  const [settings, setSettings] = useState<MiniappSettingsData>(loadSettings);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);

  // Load agents list
  useEffect(() => {
    if (isOpen) {
      void fetchAgents().then(setAgents);
    }
  }, [isOpen]);

  // Persist whenever settings change
  const updateSettings = useCallback(
    (patch: Partial<MiniappSettingsData>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch { /* ignore */ }
        // Apply language change immediately
        if (patch.language) {
          setLang(patch.language);
        }
        return next;
      });
    },
    [setLang],
  );

  const handleSave = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
    await saveSettingsToServer(settings);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [settings]);

  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[0.7, 0.92]}>
      <div style={{ padding: '0 16px 16px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            paddingBottom: 10,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Gear icon using CSS unicode solid */}
            <span
              style={{
                fontSize: 16,
                color: 'var(--pixel-accent, #5a8cff)',
                lineHeight: 1,
              }}
            >
              ⚙
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.95)',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              {t('settings')}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 16,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Section 1: Default Agent ─── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ fontSize: 10 }}>■</span>
            {t('defaultAgent')}
          </div>
          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>{t('defaultAgent')}</div>
              <div style={descStyle}>{t('defaultAgentDesc')}</div>
            </div>
            <select
              value={settings.defaultAgent}
              onChange={(e) => updateSettings({ defaultAgent: e.target.value })}
              style={selectStyle}
            >
              {/* Fallback static list always shown */}
              {agents.length === 0 && (
                <>
                  {['main', 'max', 'seo', 'saturn', 'kwangnoi', 'shakespeare', 'kampra', 'ky', 'arnold', 'jerry', 'coder', 'docs', 'einstein', 'research', 'yolo'].map((id) => (
                    <option key={id} value={id} style={{ background: '#1e1e2e' }}>
                      {id}
                    </option>
                  ))}
                </>
              )}
              {agents.map((a) => (
                <option key={a.id} value={a.id} style={{ background: '#1e1e2e' }}>
                  {a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Section 2: Notifications ─── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ fontSize: 10 }}>●</span>
            {t('notifications')}
          </div>
          <div style={{ ...rowStyle, marginBottom: 12 }}>
            <div style={labelStyle}>{t('notificationsEnabled')}</div>
            <Toggle
              value={settings.notificationsEnabled}
              onChange={(v) => updateSettings({ notificationsEnabled: v })}
            />
          </div>
          {settings.notificationsEnabled && (
            <div style={rowStyle}>
              <div style={labelStyle}>{t('notificationChannel')}</div>
              <ChannelSelector
                value={settings.notificationChannel}
                onChange={(v) => updateSettings({ notificationChannel: v })}
              />
            </div>
          )}
        </div>

        {/* ── Section 3: Language ─── */}
        <div style={{ ...sectionStyle, borderBottom: 'none', marginBottom: 8 }}>
          <div style={sectionTitleStyle}>
            <span style={{ fontSize: 10 }}>◆</span>
            {t('language')}
          </div>
          <div style={rowStyle}>
            <div style={labelStyle}>{t('languageLabel')}</div>
            <LangSelector
              value={settings.language}
              onChange={(v) => updateSettings({ language: v })}
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 8,
            border: 'none',
            background: savedFlash
              ? 'var(--pixel-green, #5ac88c)'
              : 'var(--pixel-accent, #5a8cff)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background 0.3s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {savedFlash ? (
            <>
              <span>★</span> {t('saved')}
            </>
          ) : (
            <>
              <span>■</span> {t('save')}
            </>
          )}
        </button>
      </div>
    </MobileBottomSheet>
  );
}

// ── Export settings loader for external use ──────────────────
export { loadSettings };
