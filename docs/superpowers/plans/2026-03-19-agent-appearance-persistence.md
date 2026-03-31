# Agent Appearance Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each agent to have a persistent, gender-aware character appearance that survives page refreshes, with optional per-agent configuration.

**Architecture:** Server reads OpenClaw agent metadata from filesystem, sends agent identity (id + name) to client alongside agentCreated messages. Client uses gender-filtered palette selection and persists assigned appearances to server config. Settings UI allows configuring gender per agent.

**Tech Stack:** TypeScript, React, Bun/Hono, existing WebSocket protocol

---

## Character Gender Metadata

```
male:   palette 0 (suit guy), palette 4 (brown hair guy)
female: palette 1 (hat girl), palette 2 (afro girl), palette 3 (white hair girl), palette 5 (red shirt girl)
```

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `server/src/types.ts` | Add `agentName`, `openclawAgentId` to AgentState; add `agentAppearances` to AppConfig; add appearance fields to ServerMessage |
| Modify | `server/src/agentManager.ts` | Extract OpenClaw agent id from JSONL path; read agent name from `openclaw.json`; include agent identity in messages |
| Modify | `server/src/configManager.ts` | Load/save `agentAppearances` in config |
| Modify | `server/src/index.ts` | Add REST endpoints for agent appearances; pass OpenClaw agent list endpoint |
| Modify | `client/src/office/engine/officeState.ts` | Accept appearance config in `addAgent`; gender-filtered `pickDiversePalette`; persist appearance |
| Modify | `client/src/office/types.ts` | Add `openclawAgentId`, `agentName` to Character type |
| Modify | `client/src/hooks/useExtensionMessages.ts` | Handle new agent identity fields; apply saved appearances |
| Create | `client/src/components/AgentAppearanceSettings.tsx` | UI for configuring gender per agent |
| Modify | `client/src/components/SettingsModal.tsx` | Add link/section for agent appearance settings |

---

### Task 1: Server — Add Agent Identity to Types and Messages

**Files:**
- Modify: `server/src/types.ts`

- [ ] **Step 1: Add agent identity fields to AgentState**

```typescript
// Add to AgentState interface:
readonly openclawAgentId?: string;  // e.g. "main", "coder", "kwangnoi"
readonly agentName?: string;        // display name e.g. "Charlotte", "Code Expert"
```

- [ ] **Step 2: Add AgentAppearance type and extend AppConfig**

```typescript
export interface AgentAppearance {
  readonly gender: 'male' | 'female' | 'any';
  readonly palette?: number;
  readonly hueShift?: number;
}

export interface AppConfig {
  readonly projects: readonly MonitoredProject[];
  readonly layoutFile: string;
  readonly soundEnabled: boolean;
  readonly agentAppearances?: Readonly<Record<string, AgentAppearance>>;
  // key format: "openclaw:<agentId>" e.g. "openclaw:main"
}
```

- [ ] **Step 3: Add identity fields to agentCreated and existingAgents messages**

Add `openclawAgentId?: string` and `agentName?: string` to both `agentCreated` and `existingAgents` meta in the ServerMessage union.

- [ ] **Step 4: Commit**

```bash
git add server/src/types.ts
git commit -m "feat: add agent identity and appearance types"
```

---

### Task 2: Server — Extract OpenClaw Agent Identity from Path

**Files:**
- Modify: `server/src/agentManager.ts`

- [ ] **Step 1: Add helper to extract OpenClaw agent id from JSONL path**

The JSONL path pattern is `~/.openclaw/agents/<AGENT_ID>/sessions/<uuid>.jsonl`. Extract `<AGENT_ID>` from the path.

```typescript
function extractOpenclawAgentId(jsonlFile: string): string | undefined {
  // Match: /agents/<id>/sessions/<file>.jsonl
  const match = jsonlFile.match(/\/agents\/([^/]+)\/sessions\//);
  return match ? match[1] : undefined;
}
```

- [ ] **Step 2: Add helper to read agent name from openclaw.json**

```typescript
function readOpenclawAgentName(openclawDir: string, agentId: string): string | undefined {
  try {
    const configPath = path.join(openclawDir, 'openclaw.json');
    if (!fs.existsSync(configPath)) return undefined;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const agents = config?.agents?.list;
    if (!Array.isArray(agents)) return undefined;
    const agent = agents.find((a: { id?: string }) => a.id === agentId);
    return agent?.name || undefined;
  } catch { return undefined; }
}
```

- [ ] **Step 3: Use helpers in createAgent function**

In `createAgent()`, after creating the AgentState, set `openclawAgentId` and `agentName` when source is `'openclaw'`. Include these fields in the `agentCreated` message broadcast.

```typescript
// In createAgent, after setting source:
const openclawAgentId = source === 'openclaw' ? extractOpenclawAgentId(jsonlFile) : undefined;
const agentName = openclawAgentId ? readOpenclawAgentName(
  path.dirname(path.dirname(path.dirname(path.dirname(jsonlFile)))), // ~/.openclaw/
  openclawAgentId
) : undefined;

// Add to agent state object
// Add to agentCreated message: openclawAgentId, agentName
```

- [ ] **Step 4: Update sendExistingAgents to include identity**

Add `openclawAgentId` and `agentName` to the `agentMeta` object in `sendExistingAgents()`.

- [ ] **Step 5: Commit**

```bash
git add server/src/agentManager.ts
git commit -m "feat: extract OpenClaw agent identity from JSONL path"
```

---

### Task 3: Server — Agent Appearance Config Persistence

**Files:**
- Modify: `server/src/configManager.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Ensure agentAppearances is loaded/saved in config**

In `loadConfig()`, include `agentAppearances` from the JSON file (default to `{}`). In `saveConfig()`, persist it.

- [ ] **Step 2: Add helper to update a single agent appearance**

```typescript
export function updateAgentAppearance(
  config: AppConfig,
  agentKey: string,  // e.g. "openclaw:main"
  appearance: AgentAppearance,
): AppConfig
```

- [ ] **Step 3: Add REST endpoints in index.ts**

```typescript
// GET /api/config/appearances
// Returns: Record<string, AgentAppearance>

// PUT /api/config/appearances/:agentKey
// Body: { gender: 'male' | 'female' | 'any', palette?: number, hueShift?: number }
// Returns: { success: boolean }

// GET /api/openclaw/agents
// Scans ~/.openclaw/agents/ directories + reads openclaw.json
// Returns: { agents: Array<{ id: string, name: string }> }
```

- [ ] **Step 4: Commit**

```bash
git add server/src/configManager.ts server/src/index.ts
git commit -m "feat: agent appearance config persistence and API endpoints"
```

---

### Task 4: Client — Gender-Aware Palette Selection

**Files:**
- Modify: `client/src/office/engine/officeState.ts`
- Modify: `client/src/office/types.ts`

- [ ] **Step 1: Add identity fields to Character type**

In `client/src/office/types.ts`, add to the Character interface:

```typescript
openclawAgentId?: string;
agentName?: string;
```

- [ ] **Step 2: Add gender constants and filtered palette picker**

In `officeState.ts`:

```typescript
const MALE_PALETTES = [0, 4];
const FEMALE_PALETTES = [1, 2, 3, 5];

// Add gender parameter to pickDiversePalette
private pickDiversePalette(gender: 'male' | 'female' | 'any' = 'any'): { palette: number; hueShift: number } {
  const allowed = gender === 'male' ? MALE_PALETTES
    : gender === 'female' ? FEMALE_PALETTES
    : Array.from({ length: PALETTE_COUNT }, (_, i) => i);

  // Count usage among allowed palettes only
  const counts = new Map<number, number>();
  for (const p of allowed) counts.set(p, 0);
  for (const ch of this.characters.values()) {
    if (ch.isSubagent) continue;
    if (counts.has(ch.palette)) counts.set(ch.palette, counts.get(ch.palette)! + 1);
  }

  const minCount = Math.min(...counts.values());
  const available = allowed.filter(p => counts.get(p) === minCount);
  const palette = available[Math.floor(Math.random() * available.length)];

  let hueShift = 0;
  if (minCount > 0) {
    hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG);
  }
  return { palette, hueShift };
}
```

- [ ] **Step 3: Update addAgent to accept and use appearance config**

Add parameters for `openclawAgentId`, `agentName`, and `gender`. If a saved appearance (palette + hueShift) is provided, use it directly. Otherwise pick via gender-filtered `pickDiversePalette`.

Store `openclawAgentId` and `agentName` on the created Character.

- [ ] **Step 4: Commit**

```bash
git add client/src/office/engine/officeState.ts client/src/office/types.ts
git commit -m "feat: gender-aware palette selection for agents"
```

---

### Task 5: Client — Persist Appearances via API

**Files:**
- Modify: `client/src/hooks/useExtensionMessages.ts`

- [ ] **Step 1: Load saved appearances on startup**

Fetch `GET /api/config/appearances` when WebSocket connects. Store in a ref/state.

- [ ] **Step 2: Apply saved appearance when creating agent**

In `agentCreated` and `existingAgents` handlers:
- Read `openclawAgentId` from the message
- Look up saved appearance by key `openclaw:<agentId>`
- If found: pass `palette`, `hueShift`, `gender` to `os.addAgent()`
- If not found: let `addAgent` pick randomly (respecting gender if configured)

- [ ] **Step 3: Save new appearance after agent is created**

After `os.addAgent()` creates a character, if the agent is OpenClaw and has no saved appearance, save the assigned palette/hueShift via `PUT /api/config/appearances/openclaw:<agentId>`.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useExtensionMessages.ts
git commit -m "feat: persist and restore agent appearances"
```

---

### Task 6: Client — Agent Appearance Settings UI

**Files:**
- Create: `client/src/components/AgentAppearanceSettings.tsx`
- Modify: `client/src/components/SettingsModal.tsx`

- [ ] **Step 1: Create AgentAppearanceSettings component**

A panel/modal that:
1. Fetches OpenClaw agent list from `GET /api/openclaw/agents`
2. Fetches current appearances from `GET /api/config/appearances`
3. Displays each agent with:
   - Agent name (or id if no name)
   - Character preview (small pixel sprite of current palette)
   - Gender dropdown: Male / Female / Any
4. On gender change → `PUT /api/config/appearances/openclaw:<agentId>` with new gender
   - If gender changes, clear saved palette so it gets re-picked next time

Style: match existing modal styling (dark pixel-art theme with `var(--pixel-*)` CSS variables).

- [ ] **Step 2: Add "Agent Appearances" option to SettingsModal**

Add a menu item in `SettingsModal.tsx` that opens the `AgentAppearanceSettings` panel.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AgentAppearanceSettings.tsx client/src/components/SettingsModal.tsx
git commit -m "feat: agent appearance settings UI"
```

---

### Task 7: Integration Testing and Cleanup

- [ ] **Step 1: Build and test end-to-end**

```bash
npm run build
```

Verify:
- OpenClaw agents show with correct names in dashboard
- Gender setting persists across refresh
- Changing gender re-assigns palette on next agent creation
- Claude Code agents still work normally (random, no persistence)
- Sub-agents inherit parent appearance

- [ ] **Step 2: Remove any debug logs added during development**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete agent appearance persistence system"
```
