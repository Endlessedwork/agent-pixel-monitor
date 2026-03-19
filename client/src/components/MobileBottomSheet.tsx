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
