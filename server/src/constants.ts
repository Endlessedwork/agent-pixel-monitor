import * as os from 'os';
import * as path from 'path';

// ── Server ──────────────────────────────────────────────────
export const SERVER_PORT = 3456;

// ── Timing (ms) ──────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 1000;
export const PROJECT_SCAN_INTERVAL_MS = 1000;
export const TOOL_DONE_DELAY_MS = 300;
export const PERMISSION_TIMER_DELAY_MS = 7000;
export const TEXT_IDLE_DELAY_MS = 5000;
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;

// ── Activity Log ────────────────────────────────────────────
export const ACTIVITY_LOG_MAX_ENTRIES = 200;

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 2;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

// ── Layout Persistence ──────────────────────────────────────
export const LAYOUT_FILE_DIR = path.join(os.homedir(), '.pixel-agents-monitor');
export const LAYOUT_FILE_NAME = 'layout.json';
export const LAYOUT_REVISION_KEY = 'layoutRevision';

// ── Config ──────────────────────────────────────────────────
export const CONFIG_FILE = path.join(os.homedir(), '.pixel-agents-monitor', 'config.json');

// ── Session Directories ─────────────────────────────────────
export const CLAUDE_SESSIONS_BASE = path.join(os.homedir(), '.claude', 'projects');
export const OPENCLAW_SESSIONS_BASE = path.join(os.homedir(), '.openclaw');

// ── Assets Root (relative to project root) ──────────────────
export const CLIENT_ASSETS_DIR = path.join(
  path.dirname(path.dirname(__dirname)),
  'client',
  'public',
);
