// ── Agent State (no vscode.Terminal dependency) ──────────────

export interface AgentState {
  readonly id: number;
  readonly projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  readonly activeToolIds: Set<string>;
  readonly activeToolStatuses: Map<string, string>;
  readonly activeToolNames: Map<string, string>;
  readonly activeSubagentToolIds: Map<string, Set<string>>;
  readonly activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  readonly folderName?: string;
  readonly source: 'claude-code' | 'openclaw';
}

// ── Monitored Project ────────────────────────────────────────

export interface MonitoredProject {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly source: 'claude-code' | 'openclaw';
  readonly sessionDir: string;
}

// ── Config ───────────────────────────────────────────────────

export interface AppConfig {
  readonly projects: readonly MonitoredProject[];
  readonly layoutFile: string;
  readonly soundEnabled: boolean;
}

// ── WebSocket Messages (server → client) ─────────────────────

export type ServerMessage =
  | { readonly type: 'agentCreated'; readonly id: number; readonly folderName?: string; readonly source: string; readonly projectId?: string }
  | { readonly type: 'agentClosed'; readonly id: number }
  | {
      readonly type: 'existingAgents';
      readonly agents: readonly number[];
      readonly agentMeta: Readonly<Record<number, { readonly folderName?: string; readonly source: string; readonly projectId?: string }>>;
    }
  | { readonly type: 'agentStatus'; readonly id: number; readonly status: 'active' | 'waiting' }
  | { readonly type: 'agentToolStart'; readonly id: number; readonly toolId: string; readonly status: string }
  | { readonly type: 'agentToolDone'; readonly id: number; readonly toolId: string }
  | { readonly type: 'agentToolsClear'; readonly id: number }
  | { readonly type: 'agentToolPermission'; readonly id: number }
  | { readonly type: 'agentToolPermissionClear'; readonly id: number }
  | {
      readonly type: 'subagentToolStart';
      readonly id: number;
      readonly parentToolId: string;
      readonly toolId: string;
      readonly status: string;
    }
  | { readonly type: 'subagentToolDone'; readonly id: number; readonly parentToolId: string; readonly toolId: string }
  | { readonly type: 'subagentClear'; readonly id: number; readonly parentToolId: string }
  | { readonly type: 'subagentToolPermission'; readonly id: number; readonly parentToolId: string }
  | { readonly type: 'configUpdated'; readonly config: AppConfig }
  | { readonly type: 'layoutLoaded'; readonly layout: Record<string, unknown>; readonly wasReset: boolean }
  | { readonly type: 'characterSpritesLoaded'; readonly characters: unknown }
  | { readonly type: 'floorTilesLoaded'; readonly sprites: unknown }
  | { readonly type: 'wallTilesLoaded'; readonly sets: unknown }
  | { readonly type: 'furnitureAssetsLoaded'; readonly catalog: unknown; readonly sprites: unknown }
  | { readonly type: 'settingsLoaded'; readonly soundEnabled: boolean };

// ── WebSocket Messages (client → server) ─────────────────────

export type ClientMessage =
  | { readonly type: 'saveLayout'; readonly layout: Record<string, unknown> }
  | { readonly type: 'saveAgentSeats'; readonly seats: Record<string, unknown> }
  | { readonly type: 'setSoundEnabled'; readonly enabled: boolean }
  | { readonly type: 'webviewReady' };

// ── Asset Types (re-exported for server use) ─────────────────

export interface FurnitureAsset {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly category: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly footprintW: number;
  readonly footprintH: number;
  readonly isDesk: boolean;
  readonly canPlaceOnWalls: boolean;
  readonly groupId?: string;
  readonly canPlaceOnSurfaces?: boolean;
  readonly backgroundTiles?: number;
  readonly orientation?: string;
  readonly state?: string;
  readonly mirrorSide?: boolean;
  readonly rotationScheme?: string;
  readonly animationGroup?: string;
  readonly frame?: number;
}

export interface LoadedAssets {
  readonly catalog: readonly FurnitureAsset[];
  readonly sprites: ReadonlyMap<string, readonly (readonly string[])[]>;
}

export interface LoadedWallTiles {
  readonly sets: string[][][][];
}

export interface LoadedFloorTiles {
  readonly sprites: string[][][];
}

export interface CharacterDirectionSprites {
  readonly down: readonly (readonly (readonly string[])[])[];
  readonly up: readonly (readonly (readonly string[])[])[];
  readonly right: readonly (readonly (readonly string[])[])[];
}

export interface LoadedCharacterSprites {
  readonly characters: readonly CharacterDirectionSprites[];
}

// ── Callback type for sending messages ───────────────────────

export type MessageSender = (msg: ServerMessage) => void;
