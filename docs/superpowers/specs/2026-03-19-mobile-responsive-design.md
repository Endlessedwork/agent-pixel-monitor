# Mobile Responsive Display — Design Spec

## Overview

Add mobile-responsive view-only mode to Pixel Agents Monitor. Users on mobile devices (≤768px width) see a portrait-first layout with canvas full-screen, swipe-up activity sheet, and bottom sheet for agent details. No editor functionality on mobile.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Usage mode | View-only | No layout editor needed on mobile |
| Orientation | Portrait-first | One-handed viewing, canvas top, UI bottom |
| Activity log | Swipe-up sheet | Canvas gets full screen, pull up to see log |
| Agent detail | Bottom sheet | Tap agent → half-screen sheet, canvas still visible |
| Pan/zoom | Zoom buttons + drag pan | Avoids conflict with tap events, familiar UX |
| Approach | CSS-only responsive | Minimal changes, shared codebase with desktop |
| Landscape on mobile | Falls back to desktop layout | Acceptable since most phone landscape widths exceed 768px breakpoint |

## Architecture

### Detection

- CSS media query: `@media (max-width: 768px)` for layout changes
- React hook `useMobileDetect()` returning `isMobile: boolean` based on `window.matchMedia('(max-width: 768px)')`
- Used in `App.tsx` to conditionally render mobile vs desktop components
- On orientation change (portrait→landscape exceeding 768px), the app naturally switches to desktop layout — this is accepted behavior for v1

### Mobile Layout Structure

```
App.tsx (mobile mode)
├── OfficeCanvas (full viewport height minus handle bar)
│   └── canvas element (fills container)
├── ZoomControls (top-left, 44x44px, receives isMobile prop)
├── MobileBottomSheet (activity log, swipe-up)
│   ├── Handle bar (collapsed: shows "Activity Log — N entries ↑" + agent count)
│   └── Expanded: scrollable ActivityEntryList
└── MobileBottomSheet (agent detail, on tap)
    ├── Handle bar
    └── Agent info: name, status, current tool, project, subagents
```

Note: `MobileStatusBar` removed — agent count is shown in the activity sheet handle bar instead to reduce component count.

### Components

#### `useMobileDetect` hook (new)

```typescript
// client/src/hooks/useMobileDetect.ts
function useMobileDetect(): { isMobile: boolean }
```

Listens to `window.matchMedia('(max-width: 768px)')` change events. Returns reactive boolean.

#### `MobileBottomSheet` component (new)

```typescript
// client/src/components/MobileBottomSheet.tsx
interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  snapPoints: number[];  // e.g., [0.4, 0.8] = 40% and 80% of viewport
  children: React.ReactNode;
}
```

Reusable swipe-up sheet component:
- Touch drag on handle to expand/collapse
- Snap points define rest positions (percentage of viewport height)
- Backdrop dim on canvas when expanded
- CSS `transform: translateY()` with `transition` for smooth animation
- `touchstart`/`touchmove`/`touchend` on handle element for drag gesture
- Handle element must have `touch-action: none` CSS to prevent iOS Safari from interpreting drag as page scroll
- Sheet's scrollable content area must call `e.stopPropagation()` on touch events to prevent canvas pan from firing

Used for both activity log and agent detail — two separate instances, only one open at a time. Mutual exclusion is enforced in `App.tsx` (see App.tsx Integration section).

#### `ActivityEntryList` component (new — extracted from ActivitySidebar)

```typescript
// client/src/components/ActivityEntryList.tsx
interface ActivityEntryListProps {
  activities: ActivityEntry[];
  maxHeight?: string;
}
```

Extract the activity entry rendering logic (grouped entries, `formatRelativeTime`, `StatusDot`, `now` interval) from `ActivitySidebar.tsx` into a pure presentational component. Both `ActivitySidebar` (desktop) and `MobileActivitySheet` (mobile) will use this shared component. This avoids duplicating ~150 lines of rendering code.

#### `MobileActivitySheet` component (new)

```typescript
// client/src/components/MobileActivitySheet.tsx
interface MobileActivitySheetProps {
  activities: ActivityEntry[];
  isOpen: boolean;
  onClose: () => void;
  agentCount: number;  // shown in collapsed handle
}
```

Wraps `MobileBottomSheet` with activity log content:
- Collapsed: handle bar showing "Activity Log — N entries ↑ · M agents"
- Expanded: scrollable `ActivityEntryList`
- Snap points: [0.5, 0.85]
- Safe area: handle bar has `padding-bottom: env(safe-area-inset-bottom)` when collapsed

#### `MobileAgentDetail` component (new)

```typescript
// client/src/components/MobileAgentDetail.tsx
interface MobileAgentDetailProps {
  agentId: number | null;
  characters: Record<number, Character>;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  monitoredProjects: MonitoredProject[];
  onClose: () => void;
}
```

Props mirror `AgentDetailModal`'s existing interface — receives `agentId` and pulls detail data from the same structures passed by `App.tsx`.

Wraps `MobileBottomSheet` with agent detail content:
- Triggered by tapping an agent on canvas
- Shows: agent name/avatar, status, current tool, project, subagent count
- Snap points: [0.45]
- Closes on tap outside or swipe down

### Touch Events on Canvas

Add to `OfficeCanvas.tsx`:

- Receives new prop: `isMobile: boolean` and `isSheetOpen: boolean`
- When `isSheetOpen` is true, **all touch handlers are disabled** — prevents canvas pan from firing while user interacts with bottom sheet
- **`touchstart`**: Record `e.changedTouches[0]` position and timestamp. Store touch identifier.
- **`touchmove`**: If delta > 5px threshold → drag pan (update `panX`/`panY` via the existing `panRef` from props)
- **`touchend`**: Only trigger tap if `e.touches.length === 0 && e.changedTouches.length === 1` (prevents multi-touch false taps). If delta < 5px and duration < 300ms → treat as tap → hit-test characters → call `onAgentTap(agentId)` callback

No pinch-zoom — zoom buttons handle zoom changes.

Coordinate conversion: `touch.clientX/clientY` → canvas coords using same `getBoundingClientRect()` + DPR logic as existing mouse events.

**`panRef` ownership**: On mobile, `panRef` is still owned by `App.tsx` and passed to `OfficeCanvas` as a prop (same as desktop). Touch pan handlers write to the same ref. No new ref needed.

### CSS Changes

#### `index.css` additions

```css
@media (max-width: 768px) {
  /* Hide desktop-only components */
  .desktop-only { display: none !important; }
}
```

Note: Safe area insets are applied per-component (bottom sheet handle bar, zoom controls) rather than on `body`, to avoid breaking the existing `overflow: hidden` on `html, body, #root`.

#### `index.html` changes

Replace the existing viewport meta tag entirely:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#1e1e2e" />
```

### Component Visibility by Mode

| Component | Desktop | Mobile |
|-----------|---------|--------|
| OfficeCanvas | ✓ | ✓ |
| ZoomControls | ✓ (40px) | ✓ (44px, via `isMobile` prop) |
| ActivitySidebar | ✓ | ✗ (replaced by MobileActivitySheet) |
| BottomToolbar | ✓ | ✗ |
| EditorToolbar | ✓ | ✗ |
| EditActionBar | ✓ | ✗ |
| AgentDetailModal | ✓ | ✗ (replaced by MobileAgentDetail) |
| SpeechBubble | ✓ | ✓ (kept as-is, may be partially hidden by sheet — accepted for v1) |
| ToolOverlay | ✓ | ✓ (kept as-is, may be partially hidden by sheet — accepted for v1) |
| AgentLabels | ✓ | ✓ (kept as-is) |
| MobileActivitySheet | ✗ | ✓ |
| MobileAgentDetail | ✗ | ✓ |

### App.tsx Integration

```typescript
const { isMobile } = useMobileDetect();

// Mobile state — only one sheet open at a time
const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
const [mobileAgentId, setMobileAgentId] = useState<number | null>(null);

// Mutual exclusion: opening one closes the other
const handleMobileActivityOpen = () => {
  setMobileAgentId(null);
  setMobileActivityOpen(true);
};
const handleMobileAgentTap = (agentId: number) => {
  setMobileActivityOpen(false);
  setMobileAgentId(agentId);
};

const isSheetOpen = mobileActivityOpen || mobileAgentId !== null;

// Pass to OfficeCanvas:
// isMobile, isSheetOpen, onAgentTap={isMobile ? handleMobileAgentTap : undefined}

// Reuse existing detailAgentId for desktop, mobileAgentId for mobile
```

### `handleCenterView` on Mobile

The existing `handleCenterView` calculates `fitZoom` using `canvas.clientWidth * dpr`. On high-DPR mobile devices (DPR 3), this may produce unexpectedly high zoom values. Cap mobile fitZoom: `Math.min(fitZoom, 4)` when `isMobile` is true, to ensure the office map is visible without excessive zoom.

## Files to Create

1. `client/src/hooks/useMobileDetect.ts` — mobile detection hook
2. `client/src/components/MobileBottomSheet.tsx` — reusable swipe-up sheet
3. `client/src/components/ActivityEntryList.tsx` — extracted from ActivitySidebar, shared rendering
4. `client/src/components/MobileActivitySheet.tsx` — activity log for mobile
5. `client/src/components/MobileAgentDetail.tsx` — agent detail for mobile

## Files to Modify

1. `client/index.html` — replace viewport meta tag (viewport-fit=cover), add theme-color
2. `client/src/index.css` — media query for `.desktop-only` class
3. `client/src/App.tsx` — mobile detection, conditional rendering, mobile state, mutual exclusion logic, isSheetOpen prop, handleCenterView mobile cap
4. `client/src/office/components/OfficeCanvas.tsx` — touch event handlers (pan + tap), `isMobile` and `isSheetOpen` props
5. `client/src/components/ZoomControls.tsx` — accept `isMobile` prop, 44x44px buttons when mobile
6. `client/src/components/ActivitySidebar.tsx` — refactor to use `ActivityEntryList`

## Out of Scope

- Layout editor on mobile
- Landscape mode optimization (falls back to desktop layout naturally)
- Pinch-to-zoom gestures
- PWA / service worker
- Offline support
- Push notifications

## Known Limitations (v1)

- `SpeechBubble` and `ToolOverlay` may be partially hidden behind bottom sheet when expanded — accepted
- `AgentLabels` renders as-is on mobile — may overlap with sheet content in some positions
- Orientation change (portrait→landscape) switches to desktop layout abruptly — no transition animation
- `handleCenterView` fitZoom is capped at 4 on mobile which may not be perfect for all screen sizes
