# Mobile Responsive Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile-responsive view-only mode with portrait-first layout, swipe-up activity sheet, and bottom sheet agent detail.

**Architecture:** CSS-only responsive approach. Detect mobile via `matchMedia(max-width: 768px)`, hide desktop overlays, render mobile-specific components (bottom sheets). Canvas engine shared, touch events added for pan + tap.

**Tech Stack:** React 19, TypeScript, CSS media queries, Touch Events API

**Spec:** `docs/superpowers/specs/2026-03-19-mobile-responsive-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/hooks/useMobileDetect.ts` | Create | Mobile breakpoint detection hook |
| `client/src/components/MobileBottomSheet.tsx` | Create | Reusable swipe-up sheet with snap points |
| `client/src/components/ActivityEntryList.tsx` | Create | Shared activity entry rendering (extracted from ActivitySidebar) |
| `client/src/components/MobileActivitySheet.tsx` | Create | Activity log bottom sheet for mobile |
| `client/src/components/MobileAgentDetail.tsx` | Create | Agent detail bottom sheet for mobile |
| `client/src/components/ActivitySidebar.tsx` | Modify | Refactor to use ActivityEntryList |
| `client/src/office/components/OfficeCanvas.tsx` | Modify | Add touch event handlers, isMobile/isSheetOpen props |
| `client/src/components/ZoomControls.tsx` | Modify | Accept isMobile prop, 44px buttons |
| `client/src/App.tsx` | Modify | Mobile detection, conditional rendering, mobile state |
| `client/index.html` | Modify | viewport-fit=cover, theme-color |
| `client/src/index.css` | Modify | Media query for .desktop-only |

---

### Task 1: HTML Meta Tags & CSS Foundation

**Files:**
- Modify: `client/index.html:5`
- Modify: `client/src/index.css` (append at end)

- [ ] **Step 1: Update viewport meta tag**

In `client/index.html`, replace line 5:
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```
with:
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#1e1e2e" />
```

- [ ] **Step 2: Add mobile media query to index.css**

Append to `client/src/index.css`:
```css
/* ── Mobile Responsive ── */
@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
}
```

- [ ] **Step 3: Verify dev server loads without errors**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add client/index.html client/src/index.css
git commit -m "feat(mobile): add viewport-fit=cover and desktop-only media query"
```

---

### Task 2: `useMobileDetect` Hook

**Files:**
- Create: `client/src/hooks/useMobileDetect.ts`

- [ ] **Step 1: Create the hook**

```typescript
// client/src/hooks/useMobileDetect.ts
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

export function useMobileDetect(): { isMobile: boolean } {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_BREAKPOINT).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return { isMobile };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to useMobileDetect

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useMobileDetect.ts
git commit -m "feat(mobile): add useMobileDetect hook"
```

---

### Task 3: `MobileBottomSheet` Component

**Files:**
- Create: `client/src/components/MobileBottomSheet.tsx`

- [ ] **Step 1: Create the component**

```typescript
// client/src/components/MobileBottomSheet.tsx
import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  snapPoints: number[]; // e.g., [0.4, 0.8] = 40% and 80% of viewport height
  children: ReactNode;
}

export function MobileBottomSheet({ isOpen, onClose, snapPoints, children }: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const currentTranslate = useRef(0);
  const [snapIndex, setSnapIndex] = useState(0);

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const sheetHeight = isOpen ? vh * snapPoints[snapIndex] : 0;
  const translateY = isOpen ? vh - sheetHeight : vh;

  useEffect(() => {
    if (isOpen) {
      setSnapIndex(0);
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    currentTranslate.current = translateY;
    e.stopPropagation();
  }, [translateY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    e.stopPropagation();

    if (deltaY > 80) {
      // Swipe down — close or snap to lower point
      if (snapIndex === 0) {
        onClose();
      } else {
        setSnapIndex(Math.max(0, snapIndex - 1));
      }
    } else if (deltaY < -80) {
      // Swipe up — snap to higher point
      if (snapIndex < snapPoints.length - 1) {
        setSnapIndex(snapIndex + 1);
      }
    }
  }, [snapIndex, snapPoints.length, onClose]);

  const handleContentTouch = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 60,
        }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${sheetHeight}px`,
          background: 'var(--pixel-bg, #1e1e2e)',
          borderTop: '2px solid var(--pixel-accent, #5a8cff)',
          borderRadius: '12px 12px 0 0',
          zIndex: 61,
          transition: 'height 0.25s ease-out',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Handle */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            padding: '8px',
            cursor: 'grab',
            touchAction: 'none',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 36,
            height: 4,
            background: '#555',
            borderRadius: 2,
          }} />
        </div>
        {/* Content */}
        <div
          onTouchStart={handleContentTouch}
          onTouchMove={handleContentTouch}
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MobileBottomSheet.tsx
git commit -m "feat(mobile): add MobileBottomSheet component"
```

---

### Task 4: Extract `ActivityEntryList` from `ActivitySidebar`

**Files:**
- Create: `client/src/components/ActivityEntryList.tsx`
- Modify: `client/src/components/ActivitySidebar.tsx`

- [ ] **Step 1: Create ActivityEntryList component**

Extract the per-entry rendering logic from `ActivitySidebar.tsx`. This component renders a flat list of activity entries (no grouping — grouping stays in `ActivitySidebar`).

```typescript
// client/src/components/ActivityEntryList.tsx
import type { ActivityEntry } from '../office/types.js';
import { formatActivity } from '../office/formatActivity.js';
import { useState, useEffect } from 'react';

// ── Formatting ──

export function formatRelativeTime(timestamp: number, now: number): string {
  const sec = Math.floor((now - timestamp) / 1000);
  if (sec < 5) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

// ── StatusDot ──

const dotBase: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
  marginTop: 5,
};

export function StatusDot({ entry }: { entry: ActivityEntry }) {
  const color = entry.done
    ? 'var(--pixel-status-done, #89d185)'
    : entry.permissionWait
      ? 'var(--pixel-status-permission, #cca700)'
      : 'var(--pixel-status-active, #3794ff)';
  const pulse = !entry.done;
  return (
    <span
      className={pulse ? 'pixel-agents-pulse' : undefined}
      style={{ ...dotBase, background: color }}
    />
  );
}

// ── Entry Row Styles ──

const rowBase: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '3px 0',
  fontSize: 11,
  lineHeight: '16px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

const permissionRowStyle: React.CSSProperties = {
  ...rowBase,
  background: 'rgba(204,167,0,0.08)',
};

const activeRowStyle: React.CSSProperties = {
  ...rowBase,
  background: 'rgba(55,148,255,0.06)',
};

const doneRowStyle: React.CSSProperties = rowBase;

// ── Component ──

interface ActivityEntryListProps {
  entries: readonly ActivityEntry[];
  maxHeight?: string;
}

export function ActivityEntryList({ entries, maxHeight }: ActivityEntryListProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      {entries.map((entry, i) => {
        const { icon, label } = formatActivity(entry.status);
        const style = entry.permissionWait
          ? permissionRowStyle
          : entry.done
            ? doneRowStyle
            : activeRowStyle;
        return (
          <div key={`${entry.agentId}-${entry.timestamp}-${i}`} style={style}>
            <StatusDot entry={entry} />
            <span style={{ flexShrink: 0 }}>{icon}</span>
            <span style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--pixel-text, rgba(255,255,255,0.8))',
            }}>
              {label}
            </span>
            <span style={{
              flexShrink: 0,
              color: 'var(--pixel-text-dim, rgba(255,255,255,0.35))',
              fontSize: 10,
            }}>
              {formatRelativeTime(entry.timestamp, now)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

**Important:** `ActivityEntry` has no `label` field — use `formatActivity(entry.status)` from `../office/formatActivity.js` to get `{ icon, label }`. The `pixel-agents-pulse` CSS class (not `status-dot-pulse`) is defined in `App.tsx`'s inline `<style>` block.

- [ ] **Step 2: Refactor ActivitySidebar to use ActivityEntryList**

In `client/src/components/ActivitySidebar.tsx`:
- Remove the duplicated `formatRelativeTime`, `StatusDot`, tool icon logic, and per-entry row rendering
- Import and use `ActivityEntryList` for rendering entries within each agent group
- Keep the grouping logic (`grouped` memo) and per-agent header rendering in `ActivitySidebar`

The agent-group headers and overall sidebar structure stay in `ActivitySidebar`. Only the entry-level rows move to `ActivityEntryList`.

- [ ] **Step 3: Verify desktop rendering is unchanged**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

Run dev server and visually verify ActivitySidebar looks identical to before.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ActivityEntryList.tsx client/src/components/ActivitySidebar.tsx
git commit -m "refactor: extract ActivityEntryList from ActivitySidebar"
```

---

### Task 5: `MobileActivitySheet` Component

**Files:**
- Create: `client/src/components/MobileActivitySheet.tsx`

- [ ] **Step 1: Create the component**

```typescript
// client/src/components/MobileActivitySheet.tsx
import type { ActivityEntry } from '../office/types.js';
import { MobileBottomSheet } from './MobileBottomSheet.js';
import { ActivityEntryList } from './ActivityEntryList.js';

interface MobileActivitySheetProps {
  activities: readonly ActivityEntry[];
  isOpen: boolean;
  onClose: () => void;
  agentCount: number;
}

export function MobileActivitySheet({
  activities,
  isOpen,
  onClose,
  agentCount,
}: MobileActivitySheetProps) {
  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[0.5, 0.85]}>
      <div style={{ padding: '0 12px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{
            color: 'var(--pixel-accent, #5a8cff)',
            fontWeight: 'bold',
            fontSize: 13,
          }}>
            Activity Log
          </span>
          <span style={{
            color: 'var(--pixel-text-dim)',
            fontSize: 11,
          }}>
            {activities.length} entries · {agentCount} agents
          </span>
        </div>
        <ActivityEntryList entries={activities} />
      </div>
    </MobileBottomSheet>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MobileActivitySheet.tsx
git commit -m "feat(mobile): add MobileActivitySheet component"
```

---

### Task 6: `MobileAgentDetail` Component

**Files:**
- Create: `client/src/components/MobileAgentDetail.tsx`

- [ ] **Step 1: Create the component**

Props mirror `AgentDetailModal` (lines 10-19). Renders a simplified view in a bottom sheet.

```typescript
// client/src/components/MobileAgentDetail.tsx
import type { OfficeState, ToolActivity } from '../office/types.js';
import type { MonitoredProjectInfo } from '../hooks/useExtensionMessages.js';
import { formatActivity } from '../office/formatActivity.js';
import { MobileBottomSheet } from './MobileBottomSheet.js';

interface MobileAgentDetailProps {
  agentId: number | null;
  officeState: OfficeState;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  monitoredProjects: readonly MonitoredProjectInfo[];
  onClose: () => void;
}

export function MobileAgentDetail({
  agentId,
  officeState,
  agentTools,
  agentStatuses,
  monitoredProjects,
  onClose,
}: MobileAgentDetailProps) {
  if (agentId === null) return null;

  // Character is a Map — use .get()
  const character = officeState.characters.get(agentId);
  if (!character) return null;

  const name = character.agentName || character.folderName || `Agent #${agentId}`;
  const tools = agentTools[agentId] ?? [];
  const activeTools = tools.filter(t => !t.done);
  const status = agentStatuses[agentId] ?? 'idle';

  // Find project via character.projectId (not projectPath/projectName — those don't exist)
  const project = monitoredProjects.find(p => p.id === character.projectId);

  return (
    <MobileBottomSheet isOpen={true} onClose={onClose} snapPoints={[0.45]}>
      <div style={{ padding: '0 12px' }}>
        {/* Agent header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}>
            🧑‍💻
          </div>
          <div>
            <div style={{
              color: 'var(--pixel-accent, #5a8cff)',
              fontWeight: 'bold',
              fontSize: 14,
            }}>
              {name}
            </div>
            <div style={{
              fontSize: 11,
              color: character.isActive
                ? 'var(--pixel-status-active, #3794ff)'
                : 'var(--pixel-text-dim)',
            }}>
              ● {character.isActive ? 'Active' : 'Idle'}
            </div>
          </div>
        </div>

        {/* Info cards */}
        {project && (
          <>
            <InfoCard label="Project" value={project.name} />
            <InfoCard label="Path" value={project.path} />
            <InfoCard label="Source" value={project.source} />
          </>
        )}

        {/* Active tools — use formatActivity(tool.status) since ToolActivity has no label field */}
        {activeTools.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              fontSize: 10,
              color: 'var(--pixel-text-dim)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              Active Tools
            </div>
            {activeTools.map((tool, i) => {
              const { icon, label } = formatActivity(tool.status);
              return (
                <div key={i} style={{
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4,
                  fontSize: 11,
                  color: 'var(--pixel-text)',
                  marginBottom: 3,
                }}>
                  {icon} {label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 4,
      marginBottom: 4,
    }}>
      <div style={{ fontSize: 9, color: 'var(--pixel-text-dim)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{
        fontSize: 11,
        color: 'var(--pixel-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MobileAgentDetail.tsx
git commit -m "feat(mobile): add MobileAgentDetail component"
```

---

### Task 7: Touch Events on `OfficeCanvas`

**Files:**
- Modify: `client/src/office/components/OfficeCanvas.tsx:27-42` (props interface)
- Modify: `client/src/office/components/OfficeCanvas.tsx` (add touch handlers near mouse handlers)

- [ ] **Step 1: Extend OfficeCanvasProps**

Add to the interface at lines 27-42:
```typescript
  isMobile?: boolean;
  isSheetOpen?: boolean;
  onAgentTap?: (agentId: number) => void;
```

- [ ] **Step 2: Add touch event refs and handlers**

Add refs after existing refs (around line 72):
```typescript
const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
const isTouchPanningRef = useRef(false);
```

Add touch handlers after existing mouse handlers (after `handleWheel`, around line 790).

**Important:** `OfficeCanvas` destructures all props — there is no `props` variable. Use the destructured names directly (e.g., `isSheetOpen` not `props.isSheetOpen`). Also, `officeState.characters` is a `Map<number, Character>`, not a plain object — iterate with `officeState.characters.entries()` or `for...of`, not `Object.entries()`.

```typescript
// ── Touch Events (Mobile) ──

const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
  if (isSheetOpen || !isMobile) return;
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  isTouchPanningRef.current = false;
}, [isSheetOpen, isMobile]);

const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
  if (isSheetOpen || !isMobile) return;
  if (!touchStartRef.current || e.touches.length !== 1) return;

  const touch = e.touches[0];
  const dx = touch.clientX - touchStartRef.current.x;
  const dy = touch.clientY - touchStartRef.current.y;

  if (!isTouchPanningRef.current && Math.abs(dx) + Math.abs(dy) > 5) {
    isTouchPanningRef.current = true;
  }

  if (isTouchPanningRef.current) {
    const dpr = window.devicePixelRatio || 1;
    panRef.current.x += dx * dpr;
    panRef.current.y += dy * dpr;
    touchStartRef.current = { ...touchStartRef.current, x: touch.clientX, y: touch.clientY };
  }
}, [isSheetOpen, isMobile, panRef]);

const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
  if (isSheetOpen || !isMobile) return;
  if (!touchStartRef.current) return;
  if (e.touches.length !== 0 || e.changedTouches.length !== 1) return;

  const touch = e.changedTouches[0];
  const dx = Math.abs(touch.clientX - touchStartRef.current.x);
  const dy = Math.abs(touch.clientY - touchStartRef.current.y);
  const duration = Date.now() - touchStartRef.current.time;

  // Tap detection: small movement + short duration
  if (dx < 5 && dy < 5 && duration < 300) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const deviceX = (touch.clientX - rect.left) * dpr;
    const deviceY = (touch.clientY - rect.top) * dpr;

    // Hit test characters — officeState.characters is a Map, use .entries()
    const offset = offsetRef.current;
    const worldX = (deviceX - offset.x) / zoom;
    const worldY = (deviceY - offset.y) / zoom;
    for (const [id, ch] of officeState.characters.entries()) {
      const cx = ch.x;
      const cy = ch.y;
      const hw = 8;  // half-width of character sprite
      const hh = 16; // half-height
      if (worldX >= cx - hw && worldX <= cx + hw && worldY >= cy - hh && worldY <= cy) {
        onAgentTap?.(id);
        break;
      }
    }
  }

  touchStartRef.current = null;
  isTouchPanningRef.current = false;
}, [isSheetOpen, isMobile, zoom, officeState.characters, onAgentTap]);
```

- [ ] **Step 3: Attach handlers to canvas element**

Find the `<canvas>` JSX element (around line 800+) and add:
```typescript
onTouchStart={handleTouchStart}
onTouchMove={handleTouchMove}
onTouchEnd={handleTouchEnd}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/office/components/OfficeCanvas.tsx
git commit -m "feat(mobile): add touch pan and tap handlers to OfficeCanvas"
```

---

### Task 8: `ZoomControls` Mobile Sizing

**Files:**
- Modify: `client/src/components/ZoomControls.tsx:11-15` (props interface)
- Modify: `client/src/components/ZoomControls.tsx` (button sizes)

- [ ] **Step 1: Add isMobile prop**

Extend `ZoomControlsProps`:
```typescript
interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onCenter: () => void;
  isMobile?: boolean;
}
```

- [ ] **Step 2: Make button size responsive**

**Important:** `ZoomControls` destructures its props — use `isMobile` directly, not `props.isMobile`.

Find the `btnBase` style (around line 18-19) and update:
```typescript
const size = isMobile ? 44 : 40;
const btnBase: React.CSSProperties = {
  width: size,
  height: size,
  // ... rest unchanged
};
```

Also add safe-area padding to the container if on mobile:
```typescript
paddingLeft: isMobile ? 'max(8px, env(safe-area-inset-left))' : undefined,
```

- [ ] **Step 3: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ZoomControls.tsx
git commit -m "feat(mobile): enlarge ZoomControls buttons on mobile"
```

---

### Task 9: `App.tsx` Integration — Wire Everything Together

**Files:**
- Modify: `client/src/App.tsx`

This is the largest task — it connects all mobile components.

- [ ] **Step 1: Add imports**

Add at top of `App.tsx`:
```typescript
import { useMobileDetect } from './hooks/useMobileDetect.js';
import { MobileActivitySheet } from './components/MobileActivitySheet.js';
import { MobileAgentDetail } from './components/MobileAgentDetail.js';
```

- [ ] **Step 2: Add mobile state**

After existing state declarations (around line 175), add:
```typescript
const { isMobile } = useMobileDetect();
const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
const [mobileAgentId, setMobileAgentId] = useState<number | null>(null);

const isSheetOpen = mobileActivityOpen || mobileAgentId !== null;

const handleMobileActivityOpen = useCallback(() => {
  setMobileAgentId(null);
  setMobileActivityOpen(true);
}, []);

const handleMobileAgentTap = useCallback((agentId: number) => {
  setMobileActivityOpen(false);
  setMobileAgentId(agentId);
}, []);
```

- [ ] **Step 3: Cap handleCenterView fitZoom on mobile**

In `handleCenterView` (around line 228-249), change `const fitZoom = ...` to `let fitZoom = ...`, then add after it:
```typescript
if (isMobile) fitZoom = Math.min(fitZoom, 4);
```

- [ ] **Step 4: Pass mobile props to OfficeCanvas**

Find the `<OfficeCanvas>` JSX (around line 332-347) and add props:
```typescript
isMobile={isMobile}
isSheetOpen={isSheetOpen}
onAgentTap={isMobile ? handleMobileAgentTap : undefined}
```

- [ ] **Step 5: Pass isMobile to ZoomControls**

Find `<ZoomControls>` (around line 349) and add:
```typescript
isMobile={isMobile}
```

- [ ] **Step 6: Add `desktop-only` className to desktop-only components**

Wrap or add `className="desktop-only"` to these components' parent containers:
- `ActivitySidebar` (around line 470)
- `BottomToolbar` (around line 460)
- `EditorToolbar` and `EditActionBar` (edit mode components)

For components rendered conditionally already, add `!isMobile` guard while **preserving all existing conditions** (e.g., `!isDebugMode && !editor.isEditMode`):
```typescript
{!isMobile && detailAgentId !== null && /* keep existing conditions */ (
  <AgentDetailModal ... />
)}
```

- [ ] **Step 7: Add mobile components**

After the desktop components section, add:
```typescript
{/* Mobile components */}
{isMobile && (
  <>
    {/* Activity sheet handle (always visible as collapsed bar) */}
    <div
      onClick={handleMobileActivityOpen}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--pixel-bg, #1e1e2e)',
        borderTop: '2px solid var(--pixel-accent, #5a8cff)',
        padding: '6px',
        textAlign: 'center',
        zIndex: 55,
        cursor: 'pointer',
        paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ width: 36, height: 3, background: '#555', borderRadius: 2, margin: '0 auto 4px' }} />
      <div style={{ fontSize: 10, color: 'var(--pixel-accent, #5a8cff)' }}>
        Activity Log — {activityLog.length} entries ↑
      </div>
    </div>

    <MobileActivitySheet
      activities={activityLog}
      isOpen={mobileActivityOpen}
      onClose={() => setMobileActivityOpen(false)}
      agentCount={officeState.characters.size}
    />

    <MobileAgentDetail
      agentId={mobileAgentId}
      officeState={officeState}
      agentTools={agentTools}
      agentStatuses={agentStatuses}
      monitoredProjects={monitoredProjects}
      onClose={() => setMobileAgentId(null)}
    />
  </>
)}
```

- [ ] **Step 8: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(mobile): integrate mobile components in App.tsx"
```

---

### Task 10: Visual Testing & Polish

**Files:**
- Possibly adjust any component from Tasks 1-9

- [ ] **Step 1: Run dev server**

Run: `npm run dev`
Open in browser, use DevTools mobile emulation (iPhone 14, 390×844)

- [ ] **Step 2: Verify desktop is unchanged**

Switch DevTools back to desktop resolution. Verify:
- ActivitySidebar visible on right
- BottomToolbar visible
- AgentDetailModal opens on click
- No mobile components visible

- [ ] **Step 3: Verify mobile layout**

Switch to mobile emulation:
- Canvas fills viewport
- ZoomControls visible (44px buttons)
- Activity handle bar at bottom
- No ActivitySidebar, BottomToolbar, or EditorToolbar visible

- [ ] **Step 4: Test activity sheet**

Tap the activity handle bar → sheet slides up to 50%
Swipe up → sheet expands to 85%
Swipe down → sheet closes
Backdrop visible when open

- [ ] **Step 5: Test agent detail**

Tap an agent character on canvas → bottom sheet opens with agent info
Tap backdrop → sheet closes

- [ ] **Step 6: Test canvas pan**

Drag finger on canvas → canvas pans smoothly
Zoom +/- buttons → zoom works

- [ ] **Step 7: Fix any visual issues found**

Common fixes: z-index conflicts, font sizes, padding adjustments, touch target sizes

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(mobile): visual polish and fixes"
```
