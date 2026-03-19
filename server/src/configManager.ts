/**
 * Config Manager - Handles config persistence and layout file management.
 * Replaces vscode.ExtensionContext/workspaceState with file-based storage.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  CONFIG_FILE,
  LAYOUT_FILE_DIR,
  LAYOUT_FILE_NAME,
  LAYOUT_FILE_POLL_INTERVAL_MS,
  LAYOUT_REVISION_KEY,
} from './constants.js';
import type { AgentAppearance, AppConfig, MonitoredProject } from './types.js';

// ── Config File Operations ───────────────────────────────────

function ensureConfigDir(): void {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        ...parsed,
        showInactiveAgents: (parsed.showInactiveAgents as boolean) ?? true,
      } as AppConfig;
    }
  } catch (err) {
    console.error('[ConfigManager] Failed to read config:', err);
  }
  return {
    projects: [],
    layoutFile: path.join(LAYOUT_FILE_DIR, LAYOUT_FILE_NAME),
    soundEnabled: true,
    showInactiveAgents: true,
    agentAppearances: {},
  };
}

export function saveConfig(config: AppConfig): void {
  try {
    ensureConfigDir();
    const json = JSON.stringify(config, null, 2);
    const tmpPath = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, CONFIG_FILE);
  } catch (err) {
    console.error('[ConfigManager] Failed to write config:', err);
  }
}

export function addProject(config: AppConfig, project: MonitoredProject): AppConfig {
  const exists = config.projects.some((p) => p.id === project.id);
  if (exists) return config;
  const updatedConfig: AppConfig = {
    ...config,
    projects: [...config.projects, project],
  };
  saveConfig(updatedConfig);
  return updatedConfig;
}

export function removeProject(config: AppConfig, projectId: string): AppConfig {
  const updatedConfig: AppConfig = {
    ...config,
    projects: config.projects.filter((p) => p.id !== projectId),
  };
  saveConfig(updatedConfig);
  return updatedConfig;
}

export function updateSoundEnabled(config: AppConfig, enabled: boolean): AppConfig {
  const updatedConfig: AppConfig = {
    ...config,
    soundEnabled: enabled,
  };
  saveConfig(updatedConfig);
  return updatedConfig;
}

export function updateShowInactiveAgents(config: AppConfig, enabled: boolean): AppConfig {
  const updatedConfig: AppConfig = { ...config, showInactiveAgents: enabled };
  saveConfig(updatedConfig);
  return updatedConfig;
}

export function updateAgentAppearance(
  config: AppConfig,
  agentKey: string,
  appearance: AgentAppearance,
): AppConfig {
  const current = config.agentAppearances ?? {};
  const updated = { ...current, [agentKey]: appearance };
  const newConfig = { ...config, agentAppearances: updated };
  saveConfig(newConfig);
  return newConfig;
}

// ── Layout File Operations ───────────────────────────────────

function getLayoutFilePath(): string {
  return path.join(LAYOUT_FILE_DIR, LAYOUT_FILE_NAME);
}

export function readLayoutFromFile(): Record<string, unknown> | null {
  const filePath = getLayoutFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error('[ConfigManager] Failed to read layout file:', err);
    return null;
  }
}

export function writeLayoutToFile(layout: Record<string, unknown>): void {
  const filePath = getLayoutFilePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(layout, null, 2);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[ConfigManager] Failed to write layout file:', err);
  }
}

/**
 * Load layout with default fallback:
 * 1. If file exists -> return it (reset if bundled default has a newer revision)
 * 2. Else if defaultLayout provided -> write to file, return it
 * 3. Else -> return null
 */
export function loadLayout(
  defaultLayout?: Record<string, unknown> | null,
): { layout: Record<string, unknown>; wasReset: boolean } | null {
  const fromFile = readLayoutFromFile();
  if (fromFile) {
    const fileRevision = (fromFile[LAYOUT_REVISION_KEY] as number) ?? 0;
    const defaultRevision = (defaultLayout?.[LAYOUT_REVISION_KEY] as number) ?? 0;
    if (defaultRevision > fileRevision && defaultLayout) {
      console.log(
        `[ConfigManager] Layout revision outdated (${fileRevision} < ${defaultRevision}), resetting to bundled default`,
      );
      writeLayoutToFile(defaultLayout);
      return { layout: defaultLayout, wasReset: true };
    }
    console.log('[ConfigManager] Layout loaded from file');
    return { layout: fromFile, wasReset: false };
  }

  if (defaultLayout) {
    console.log('[ConfigManager] Writing bundled default layout to file');
    writeLayoutToFile(defaultLayout);
    return { layout: defaultLayout, wasReset: false };
  }

  return null;
}

// ── Layout File Watcher ──────────────────────────────────────

export interface LayoutWatcher {
  markOwnWrite(): void;
  dispose(): void;
}

export function watchLayoutFile(
  onExternalChange: (layout: Record<string, unknown>) => void,
): LayoutWatcher {
  const filePath = getLayoutFilePath();
  let skipNextChange = false;
  let lastMtime = 0;
  let fsWatcher: fs.FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  try {
    if (fs.existsSync(filePath)) {
      lastMtime = fs.statSync(filePath).mtimeMs;
    }
  } catch {
    /* ignore */
  }

  function checkForChange(): void {
    if (disposed) return;
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs <= lastMtime) return;
      lastMtime = stat.mtimeMs;

      if (skipNextChange) {
        skipNextChange = false;
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const layout = JSON.parse(raw) as Record<string, unknown>;
      console.log('[ConfigManager] External layout change detected');
      onExternalChange(layout);
    } catch (err) {
      console.error('[ConfigManager] Error checking layout file:', err);
    }
  }

  function startFsWatch(): void {
    if (disposed || fsWatcher) return;
    try {
      if (!fs.existsSync(filePath)) return;
      fsWatcher = fs.watch(filePath, () => {
        checkForChange();
      });
      fsWatcher.on('error', () => {
        fsWatcher?.close();
        fsWatcher = null;
      });
    } catch {
      // File may not exist yet
    }
  }

  startFsWatch();

  pollTimer = setInterval(() => {
    if (disposed) return;
    if (!fsWatcher) {
      startFsWatch();
    }
    checkForChange();
  }, LAYOUT_FILE_POLL_INTERVAL_MS);

  return {
    markOwnWrite(): void {
      skipNextChange = true;
      try {
        if (fs.existsSync(filePath)) {
          lastMtime = fs.statSync(filePath).mtimeMs;
        }
      } catch {
        /* ignore */
      }
    },
    dispose(): void {
      disposed = true;
      fsWatcher?.close();
      fsWatcher = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
