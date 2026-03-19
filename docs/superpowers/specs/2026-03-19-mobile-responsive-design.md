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

## Architecture

### Detection

- CSS media query: `@media (max-width: 768px)` for layout changes
- React hook `useMobileDetect()` returning `isMobile: boolean` based on `window.matchMedia('(max-width: 768px)')`
- Used in `App.tsx` to conditionally render mobile vs desktop components

### Mobile Layout Structure

```
App.tsx (mobile mode)
├── OfficeCanvas (full viewport height minus handle bar)
│   └── canvas element (fills container)
├── ZoomControls (top-left, enlarged 44x44px buttons)
├── MobileStatusBar (top-right, agent count badge)
├── MobileBottomSheet (activity log, swipe-up)
│   ├── Handle bar (collapsed: shows "Activity Log — N entries ↑")
│   └── Expanded: scrollable activity list
└── MobileBottomSheet (agent detail, on tap)
    ├── Handle bar
    └── Agent info: name, status, current tool, project, subagents
```

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

Used for both activity log and agent detail — two separate instances, only one open at a time.

#### `MobileActivitySheet` component (new)

```typescript
// client/src/components/MobileActivitySheet.tsx
interface MobileActivitySheetProps {
  activities: ActivityEntry[];
  isOpen: boolean;
  onClose: () => void;
}
```

Wraps `MobileBottomSheet` with activity log content:
- Collapsed: handle bar showing entry count
- Expanded: scrollable list of activity entries (reuses existing `ActivitySidebar` rendering logic)
- Snap points: [0.5, 0.85]

#### `MobileAgentDetail` component (new)

```typescript
// client/src/components/MobileAgentDetail.tsx
interface MobileAgentDetailProps {
  agent: AgentInfo | null;
  onClose: () => void;
}
```

Wraps `MobileBottomSheet` with agent detail content:
- Triggered by tapping an agent on canvas
- Shows: agent name/avatar, status, current tool, project, subagent count
- Snap points: [0.45]
- Closes on tap outside or swipe down

### Touch Events on Canvas

Add to `OfficeCanvas.tsx`:

- **`touchstart`**: Record start position and timestamp
- **`touchmove`**: If delta > 5px threshold → drag pan (update `panX`/`panY`)
- **`touchend`**: If delta < 5px and duration < 300ms → treat as tap → hit-test characters → open agent detail sheet

No pinch-zoom — zoom buttons handle zoom changes.

Coordinate conversion: `touch.clientX/clientY` → canvas coords using same `getBoundingClientRect()` + DPR logic as mouse events.

### CSS Changes

#### `index.css` additions

```css
@media (max-width: 768px) {
  /* Hide desktop-only components */
  .desktop-only { display: none !important; }

  /* Safe area for notched devices */
  body { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
}
```

#### `index.html` changes

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#1e1e2e" />
```

### Component Visibility by Mode

| Component | Desktop | Mobile |
|-----------|---------|--------|
| OfficeCanvas | ✓ | ✓ |
| ZoomControls | ✓ (40px) | ✓ (44px) |
| ActivitySidebar | ✓ | ✗ (replaced by MobileActivitySheet) |
| BottomToolbar | ✓ | ✗ |
| EditorToolbar | ✓ | ✗ |
| EditActionBar | ✓ | ✗ |
| AgentDetailModal | ✓ | ✗ (replaced by MobileAgentDetail) |
| MobileActivitySheet | ✗ | ✓ |
| MobileAgentDetail | ✗ | ✓ |
| MobileStatusBar | ✗ | ✓ |

### App.tsx Integration

```typescript
const { isMobile } = useMobileDetect();
const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
const [mobileAgentDetail, setMobileAgentDetail] = useState<AgentInfo | null>(null);

// Pass isMobile to OfficeCanvas for touch event handling
// Conditionally render mobile vs desktop overlays
```

## Files to Create

1. `client/src/hooks/useMobileDetect.ts` — mobile detection hook
2. `client/src/components/MobileBottomSheet.tsx` — reusable swipe-up sheet
3. `client/src/components/MobileActivitySheet.tsx` — activity log for mobile
4. `client/src/components/MobileAgentDetail.tsx` — agent detail for mobile

## Files to Modify

1. `client/index.html` — viewport-fit=cover, theme-color meta tag
2. `client/src/index.css` — media queries, desktop-only class, safe area padding
3. `client/src/App.tsx` — mobile detection, conditional rendering, mobile state
4. `client/src/office/components/OfficeCanvas.tsx` — touch event handlers (pan + tap)
5. `client/src/components/ZoomControls.tsx` — larger buttons on mobile (44x44px)

## Out of Scope

- Layout editor on mobile
- Landscape mode optimization
- Pinch-to-zoom gestures
- PWA / service worker
- Offline support
- Push notifications
