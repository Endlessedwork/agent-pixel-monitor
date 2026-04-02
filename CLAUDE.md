# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pixel Agents Monitor — a real-time monitoring dashboard that displays Claude Code and OpenClaw agent sessions as pixel-art characters in a customizable office environment. Agents appear as animated characters, showing their active tools, statuses, and project activities.

## Tech Stack

- **Client**: React 19 + TypeScript + Vite, canvas-based 2D pixel art engine (no DOM for game objects)
- **Server**: Bun runtime + Hono framework, native Bun WebSocket
- **Monorepo**: npm workspaces (`client/` and `server/`)

## Commands

```bash
# Development (runs both client and server)
npm run dev

# Individual services
npm run dev:client    # Vite dev server on port 5173
npm run dev:server    # Bun --watch on port 3456

# Build & production
npm run build         # Builds client to client/dist/
npm run start         # Starts server (serves client/dist/ in production)
```

No test framework is configured. No linter is configured.

### Utility Scripts

- `scripts/analyze-palette.ts` — analyze character palette colors
- `scripts/recolor-sprites.ts` — recolor sprite sheets

## Architecture

### Data Flow

1. Server watches project directories (`~/.claude/projects/`, `~/.openclaw/agents/*/sessions/`) for JSONL session files
2. `agentManager` polls JSONL files (1s interval) and parses tool calls via `transcriptParser`
3. For OpenClaw projects, **virtual agents** are created for all known agents on startup (idle/wandering), then **upgraded** to active when a session JSONL file appears
4. Agent lifecycle events broadcast to all clients via WebSocket (`wsManager`)
5. Client receives events in `useExtensionMessages` hook → updates `OfficeState` → renders via canvas game loop
6. Layout edits flow: `EditorState` → `OfficeState` → save to server → persisted at `~/.pixel-agents-monitor/layout.json`

### Agent Lifecycle (Virtual → Active → Virtual)

OpenClaw agents exist as **virtual agents** (`isVirtual: true`, `jsonlFile: null`) when no active session is running. They appear as idle characters that wander and randomly sit on **lounge seats** (sofas, benches — non-desk chairs). When a new JSONL session file is detected, `upgradeVirtualAgent()` transitions them to active (typing at desk). When the session ends, `revertToVirtual()` returns them to idle state. This is controlled by `showInactiveAgents` config flag (default: true).

Claude Code agents only appear when they have an active session — no virtual agent concept.

### Agent Identity (IDENTITY.md)

Server reads `~/.openclaw/workspace/IDENTITY.md` (main agent) or `~/.openclaw/workspace-<agentId>/IDENTITY.md` for other agents. Parses **Name:** and **Gender:** fields (supports Thai: ผู้หญิง = female, ผู้ชาย = male). Identity info is sent with `agentCreated` messages.

### Lounge Seat System

Separate from work seats (desk-adjacent). Virtual/inactive agents randomly sit on lounge seats (sofas, benches) with idle animation. Active agents only use work seats. Character state machine: TYPE ↔ IDLE ↔ WALK ↔ WORK_SIT / LOUNGE_SIT.

### Activity Log

Server maintains `agentState.activityLog` (max 200 entries) persisted across restarts. Sent to new clients via `existingActivities` WebSocket message. Client displays in `ActivitySidebar.tsx`.

### Agent Appearance System

- 6 character sprites (palette 0-5): male = [0, 4], female = [1, 2, 3, 5]
- Each OpenClaw agent can have a configured gender (`male`/`female`/`any`) which filters palette selection
- Appearances persist in `~/.pixel-agents-monitor/config.json` under `agentAppearances` keyed as `"openclaw:<agentId>"`
- OpenClaw agent identity is derived from JSONL path: `~/.openclaw/agents/<AGENT_ID>/sessions/<uuid>.jsonl`
- Agent display names come from `~/.openclaw/openclaw.json` → `agents.list[].name`

### Dual Type Systems

WebSocket message types are defined separately in `client/src/office/types.ts` and `server/src/types.ts`. These must be kept in sync manually — there is no shared types package. When adding/modifying WebSocket messages, update both files.

Constants are also split: `client/src/constants.ts` (animation, grid, rendering) and `server/src/constants.ts` (polling intervals, file paths, display truncation). These are independent — no shared constants.

### i18n

Bilingual Thai/English support via `client/src/i18n.tsx`. Language stored in `localStorage` under `miniapp_language`. Uses React context (`LanguageProvider` / `useLanguage` hook) with a translations dictionary.

### Client Architecture

- **`App.tsx`**: Root component — manages editor state, office state, WebSocket connection, modals
- **`ActivitiesPage.tsx`**: Standalone page for activity log display
- **`components/`**: Shared React UI components (modals, sidebar, settings)
- **`notificationSound.ts`**: Audio notification playback
- **`office/engine/`**: Imperative game engine outside React
  - `officeState.ts` — main game state (characters, furniture, seats, tile maps)
  - `gameLoop.ts` — requestAnimationFrame loop
  - `renderer.ts` — full canvas 2D rendering pipeline with z-sorting
  - `characters.ts` — animation states (idle, walking, typing, lounge sitting); character state machine: TYPE ↔ IDLE ↔ WALK ↔ SIT
- **`office/layout/`**: Layout system — furniture catalog, serialization, A* pathfinding (`tileMap.ts`)
- **`office/editor/`**: Editor tools (tile paint, furniture placement, undo/redo stack)
- **`office/sprites/`**: Sprite caching with zoom/colorization variants
- **`hooks/`**: React hooks bridging WebSocket data to game engine
- **`wsClient.ts`**: Singleton WebSocket with auto-reconnect and message buffering; uses `wss://` for HTTPS origins

### Server Architecture

- **`index.ts`**: Bun.serve with Hono routes + WebSocket upgrade handler; serves `client/dist/` in production via `serveStatic` with `rewriteRequestPath`
- **`agentManager.ts`**: Discovers JSONL files, polls for changes, manages agent lifecycle (including virtual agents for OpenClaw), subagent spawning
- **`transcriptParser.ts`**: Parses JSONL transcripts to extract tool calls and agent status; supports both Claude Code (`tool_use`/`tool_result`) and OpenClaw (`toolCall`/`toolResult`) JSONL formats
- **`wsManager.ts`**: WebSocket connection manager — broadcasts messages to all connected clients
- **`fileWatcher.ts`**: File system watching utilities for JSONL session files
- **`timerManager.ts`**: Centralized timer management for polling intervals
- **`constants.ts`**: Centralized timing/limit constants (poll intervals, activity log max, delays)
- **`configManager.ts`**: Persists config/layout/appearances to `~/.pixel-agents-monitor/`
- **`assetLoader.ts` / `assetLoaderSprites.ts`**: Server-side PNG parsing for sprites
- **`pngUtils.ts`**: Low-level PNG manipulation utilities

### WebSocket Protocol

Typed message unions in both `client/src/office/types.ts` and `server/src/types.ts`. Key messages:
- Agent lifecycle: `agentCreated` (with `isActive`, `identityGender`, `openclawAgentId`, `agentName`), `agentClosed`, `existingAgents`, `agentActivated`, `agentDeactivated`
- Tool tracking: `agentToolStart`, `agentToolDone`, `agentToolPermission`
- Subagent tracking: `subagentToolStart`, `subagentToolDone`, `subagentClear`
- Activity: `existingActivities` (sent on connection)
- Layout/config: `layoutLoaded`, `configUpdated`, `saveLayout`
- Settings: `setSoundEnabled`, `setShowInactiveAgents`, `settingsLoaded`

### REST API

- `GET/POST/DELETE /api/config/projects` — manage monitored projects
- `GET/PUT /api/config/appearances/:agentKey` — agent appearance (gender, palette)
- `GET /api/openclaw/agents` — list all OpenClaw agents (scans directories + reads `openclaw.json`)
- `GET /api/assets/*` — character sprites, furniture, walls, floors

## Key Conventions

- Bun-specific APIs (Bun.serve, native WebSocket) — not Node.js compatible
- Console logging uses `[ServiceName]` prefix format
- Section separators use `// ──` block comments
- Barrel files (`index.ts`) re-export from subdirectories
- Config stored at `~/.pixel-agents-monitor/` (layout.json, config.json)
- Client assets (PNGs, fonts) in `client/public/`
- Vite proxies `/api` and `/ws` to server in dev mode
- Deployed via Cloudflare Tunnel at `pixel.knetwork.app` (server on port 3456)
