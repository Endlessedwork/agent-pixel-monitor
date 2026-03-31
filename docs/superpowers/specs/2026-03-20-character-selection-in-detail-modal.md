# Character Selection in Agent Detail Modal

## Problem

Currently, users must navigate to Settings → Agent Appearances to change an agent's gender. There is no way to directly select a specific character palette or adjust hue shift. When clicking on an agent character, the detail modal shows info, tools, and activity — but no way to customize appearance.

## Solution

Add a "Character" section inside `AgentDetailModal.tsx` that allows users to select a character palette and adjust hue shift, with a Save button to persist changes.

## UI Layout

The new section appears between the Info and Current Tools sections:

```
┌─────────────────────────────────┐
│ [preview] Agent Name          X │  ← Header (existing)
├─────────────────────────────────┤
│ INFO                            │  ← existing
│  Project / Path / Source / Status│
├─────────────────────────────────┤
│ CHARACTER                       │  ← NEW
│  Male                           │
│  [palette 0] [palette 4]       │
│  Female                         │
│  [palette 1] [palette 2] [palette 3] [palette 5] │
│                                 │
│  Hue Shift  ───●──────── 45°   │
│                                 │
│           [Save]                │
├─────────────────────────────────┤
│ CURRENT TOOLS                   │  ← existing
│ RECENT ACTIVITY                 │  ← existing
├─────────────────────────────────┤
│        [Close Agent] [Close]    │  ← existing
└─────────────────────────────────┘
```

### Character grid

- Each palette shown as an animated `CharacterPreview` (smaller scale than header preview)
- Divided into two labeled groups: **Male** (palettes 0, 4) and **Female** (palettes 1, 2, 3, 5)
- Selected palette has a highlight border
- Clicking a palette updates local state (live preview in header)

### Hue shift slider

- `<input type="range">` with min=0, max=315, step=45
- Value 0 means "no shift" (original palette colors); 45-315 shift the hue
- Displays current degree value next to slider
- Changes update header preview immediately (live)

### Save button

- Disabled when no changes from current values, or while saving
- Enabled when palette or hueShift differs from current character values

### Visibility

- Section only shown for OpenClaw agents (`character.openclawAgentId` exists)
- Claude Code agents do not show this section

## Data Flow

### On modal open

1. Read `character.palette` and `character.hueShift` from OfficeState as initial values
2. Initialize local state: `selectedPalette`, `selectedHueShift`

### On selection change

1. Update local state → header `CharacterPreview` re-renders with new palette/hueShift (live preview)
2. Save button becomes enabled

### On Save

1. Call `PUT /api/config/appearances/:agentKey` with `{ gender, palette, hueShift }`
   - `gender` is derived from selected palette: palettes 0,4 → `"male"`, palettes 1,2,3,5 → `"female"`
   - `agentKey` format: `"openclaw:<agentId>"`
2. Server persists to `~/.pixel-agents-monitor/config.json` (no WebSocket broadcast — appearance API is REST-only)
3. After successful save, update the character in `OfficeState` directly:
   - Set `character.palette` and `character.hueShift` on the Character object in `officeState.characters`
   - Sprite cache for the old palette/hueShift combo may still be in memory (this is fine — cache is keyed by palette+hueShift)
   - The canvas game loop will pick up the new values on the next render frame
4. Only the current client is updated. Other clients will see the change on their next page load or reconnect.

## Implementation Scope

### Files to modify

- **`client/src/components/AgentDetailModal.tsx`** — add Character section, local state, Save handler, mini CharacterPreview grid
- **`client/src/office/engine/officeState.ts`** — export `MALE_PALETTES` and `FEMALE_PALETTES` (currently module-private)

### No new files or components

- Reuse existing `CharacterPreview` component (already in AgentDetailModal.tsx) — construct minimal `Character` objects with just `palette` and `hueShift` for each grid preview
- Reuse existing REST API (`PUT /api/config/appearances/:agentKey`)
- No server changes needed

### Constants used

- `MALE_PALETTES = [0, 4]` and `FEMALE_PALETTES = [1, 2, 3, 5]` from `officeState.ts` (need to export)
- `PALETTE_COUNT = 6` from `client/src/constants.ts`

### Edge cases

- If `character` becomes undefined while modal is open (agent closes), the Character section is hidden (existing guard: `character &&`)
- If the agent has no `openclawAgentId`, the Character section is not rendered

## Out of Scope

- Adding new character sprites
- Gender selector in this modal (gender is inferred from palette choice)
- Changes to AgentAppearanceSettings or Settings modal
- Mobile MobileAgentDetail (separate follow-up if needed)
