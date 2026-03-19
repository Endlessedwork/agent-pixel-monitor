# Character Selection in Agent Detail Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add character palette selection and hue shift adjustment directly in the AgentDetailModal for OpenClaw agents.

**Architecture:** Add a "Character" section to the existing AgentDetailModal component. Reuse the CharacterPreview component for palette grid previews. Local state for live preview, Save button persists via existing REST API then updates OfficeState directly.

**Tech Stack:** React 19 + TypeScript, canvas-based CharacterPreview, existing Hono REST API

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/office/engine/officeState.ts` | Modify (line 37-38) | Export `MALE_PALETTES` and `FEMALE_PALETTES` |
| `client/src/components/AgentDetailModal.tsx` | Modify | Add Character section with palette grid, hue shift slider, Save button |

No new files needed.

---

### Task 1: Export palette constants

**Files:**
- Modify: `client/src/office/engine/officeState.ts:37-38`

- [ ] **Step 1: Export the constants**

Change:
```typescript
const MALE_PALETTES = [0, 4];
const FEMALE_PALETTES = [1, 2, 3, 5];
```
To:
```typescript
export const MALE_PALETTES = [0, 4];
export const FEMALE_PALETTES = [1, 2, 3, 5];
```

- [ ] **Step 2: Verify no build errors**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/office/engine/officeState.ts
git commit -m "refactor: export MALE_PALETTES and FEMALE_PALETTES"
```

---

### Task 2: Add Character section UI to AgentDetailModal

**Files:**
- Modify: `client/src/components/AgentDetailModal.tsx`

- [ ] **Step 1: Add imports and constants**

Add to imports at top of file:
```typescript
import { MALE_PALETTES, FEMALE_PALETTES } from '../office/engine/officeState.js';
```

Add constant for mini preview scale (smaller than header's `PREVIEW_SCALE = 4`):
```typescript
const MINI_PREVIEW_SCALE = 3;
```

- [ ] **Step 2: Add MiniCharacterPreview component**

Add a `MiniCharacterPreview` component similar to `CharacterPreview` but using `MINI_PREVIEW_SCALE` and accepting `palette` + `hueShift` directly instead of a full `Character` object:

```typescript
function MiniCharacterPreview({ palette, hueShift }: { readonly palette: number; readonly hueShift: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const sprites = useMemo(
    () => getCharacterSprites(palette, hueShift),
    [palette, hueShift],
  );

  const drawFrame = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const walkCycle = [0, 1, 2, 1];
      const spriteData: SpriteData = sprites.walk[Direction.DOWN][walkCycle[frame % 4]];
      if (!spriteData || spriteData.length === 0) return;
      const rows = spriteData.length;
      const cols = spriteData[0].length;
      canvas.width = cols * MINI_PREVIEW_SCALE;
      canvas.height = rows * MINI_PREVIEW_SCALE;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const color = spriteData[r][c];
          if (color === '') continue;
          ctx.fillStyle = color;
          ctx.fillRect(c * MINI_PREVIEW_SCALE, r * MINI_PREVIEW_SCALE, MINI_PREVIEW_SCALE, MINI_PREVIEW_SCALE);
        }
      }
    },
    [sprites],
  );

  useEffect(() => {
    drawFrame(0);
    const interval = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % 4;
      drawFrame(frameRef.current);
    }, PREVIEW_FRAME_MS);
    return () => clearInterval(interval);
  }, [drawFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}
```

- [ ] **Step 3: Add local state for selection**

Inside `AgentDetailModal` component, add state after existing state:
```typescript
const [selectedPalette, setSelectedPalette] = useState<number>(character?.palette ?? 0);
const [selectedHueShift, setSelectedHueShift] = useState<number>(character?.hueShift ?? 0);
const [saving, setSaving] = useState(false);

const hasChanges = character != null && (
  selectedPalette !== character.palette || selectedHueShift !== character.hueShift
);
```

- [ ] **Step 4: Modify header CharacterPreview for live preview**

Replace the header's `CharacterPreview` to use selected values when the character section is visible (OpenClaw agent):

```typescript
{character && (
  <CharacterPreview
    character={
      character.openclawAgentId
        ? { ...character, palette: selectedPalette, hueShift: selectedHueShift }
        : character
    }
  />
)}
```

- [ ] **Step 5: Add Character section JSX**

Insert after the Info section `</div>` and before the Current Tools section. Only render for OpenClaw agents:

```typescript
{/* Character Selection */}
{character?.openclawAgentId && (
  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
    <div style={sectionHeaderStyle}>Character</div>

    {/* Male palettes */}
    <div style={{ padding: '4px 16px 2px', fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
      Male
    </div>
    <div style={{ display: 'flex', gap: 8, padding: '4px 16px' }}>
      {MALE_PALETTES.map((p) => (
        <div
          key={p}
          onClick={() => setSelectedPalette(p)}
          style={{
            cursor: 'pointer',
            border: selectedPalette === p
              ? '2px solid var(--pixel-accent)'
              : '2px solid transparent',
            padding: 2,
            background: selectedPalette === p ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}
        >
          <MiniCharacterPreview palette={p} hueShift={selectedPalette === p ? selectedHueShift : 0} />
        </div>
      ))}
    </div>

    {/* Female palettes */}
    <div style={{ padding: '4px 16px 2px', fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
      Female
    </div>
    <div style={{ display: 'flex', gap: 8, padding: '4px 16px' }}>
      {FEMALE_PALETTES.map((p) => (
        <div
          key={p}
          onClick={() => setSelectedPalette(p)}
          style={{
            cursor: 'pointer',
            border: selectedPalette === p
              ? '2px solid var(--pixel-accent)'
              : '2px solid transparent',
            padding: 2,
            background: selectedPalette === p ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}
        >
          <MiniCharacterPreview palette={p} hueShift={selectedPalette === p ? selectedHueShift : 0} />
        </div>
      ))}
    </div>

    {/* Hue Shift slider */}
    <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', flexShrink: 0 }}>Hue Shift</span>
      <input
        type="range"
        min={0}
        max={315}
        step={45}
        value={selectedHueShift}
        onChange={(e) => setSelectedHueShift(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: '11px', color: 'var(--pixel-text)', minWidth: 30, textAlign: 'right' }}>
        {selectedHueShift}°
      </span>
    </div>

    {/* Save button */}
    <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'flex-end' }}>
      <button
        disabled={!hasChanges || saving}
        onClick={async () => {
          if (!character?.openclawAgentId) return;
          setSaving(true);
          const gender = MALE_PALETTES.includes(selectedPalette) ? 'male' : 'female';
          const agentKey = `openclaw:${character.openclawAgentId}`;
          try {
            await fetch(`/api/config/appearances/${agentKey}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gender, palette: selectedPalette, hueShift: selectedHueShift }),
            });
            // Update OfficeState directly
            character.palette = selectedPalette;
            character.hueShift = selectedHueShift;
          } finally {
            setSaving(false);
          }
        }}
        style={{
          ...btnStyle,
          opacity: (!hasChanges || saving) ? 0.4 : 1,
          cursor: (!hasChanges || saving) ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Manual test**

Run: `npm run dev`

1. Open browser at `http://localhost:5173`
2. Click on an OpenClaw agent character → AgentDetailModal opens
3. Verify "Character" section appears between Info and Current Tools
4. Verify Male (2 characters) and Female (4 characters) groups display with animated previews
5. Click different palette → header preview updates immediately
6. Move hue shift slider → header preview updates, selected palette preview updates
7. Save button enables when changes made, disables after save
8. After save, character on map updates to new palette/hueShift
9. Click on a Claude Code agent → verify Character section does NOT appear

- [ ] **Step 8: Commit**

```bash
git add client/src/components/AgentDetailModal.tsx
git commit -m "feat: add character selection to AgentDetailModal"
```
