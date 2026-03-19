import { useEffect, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX, SPEECH_BUBBLE_PERSIST_MS } from '../../constants.js';
import type { OfficeState } from '../engine/officeState.js';
import type { AgentBubble } from '../types.js';
import { CharacterState, TILE_SIZE } from '../types.js';

interface SpeechBubbleProps {
  officeState: OfficeState;
  agentBubbles: Readonly<Record<number, AgentBubble>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

/** Vertical offset from character anchor to place bubble (in sprite pixels) */
const BUBBLE_OFFSET_Y = 36;

export function SpeechBubble({
  officeState,
  agentBubbles,
  containerRef,
  zoom,
  panRef,
}: SpeechBubbleProps) {
  // Re-render on animation frame to follow character movement + expire bubbles
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setNow(Date.now());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const entries = Object.entries(agentBubbles);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([idStr, bubble]) => {
        const agentId = Number(idStr);

        // Skip expired bubbles
        if (bubble.expiresAt <= now) return null;

        const ch = officeState.characters.get(agentId);
        if (!ch) return null;
        // Don't show bubble on despawning characters
        if (ch.matrixEffect === 'despawn') return null;

        const sittingOffset = (ch.state === CharacterState.TYPE || ch.state === CharacterState.SIT) ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - BUBBLE_OFFSET_Y) * zoom) / dpr;

        // Fade out in the last 2 seconds of persist
        const remainMs = bubble.expiresAt - now;
        const fadeMs = 2000;
        const opacity = bubble.expiresAt === Infinity ? 1 : Math.min(1, remainMs / fadeMs);

        return (
          <div
            key={agentId}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 39,
              opacity,
              transition: 'opacity 0.3s ease',
            }}
          >
            {/* Bubble body */}
            <div
              style={{
                background: 'var(--pixel-bg)',
                border: '2px solid var(--pixel-border)',
                borderRadius: 0,
                padding: '2px 6px',
                boxShadow: 'var(--pixel-shadow)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                maxWidth: 140,
                position: 'relative',
              }}
            >
              <span style={{ fontSize: '12px', flexShrink: 0 }}>{bubble.icon}</span>
              <span
                style={{
                  fontSize: '16px',
                  color: 'var(--pixel-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {bubble.label}
              </span>
            </div>
            {/* Tail pointing down to character */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '5px solid var(--pixel-border)',
                margin: '0 auto',
              }}
            />
          </div>
        );
      })}
    </>
  );
}
