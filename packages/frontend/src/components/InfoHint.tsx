import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AppIcon from './AppIcon';

interface InfoHintProps {
  label: string;
  text: string;
}

/** Compact, tap-to-open help for secondary feature explanations. */
const InfoHint: React.FC<InfoHintProps> = ({ label, text }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const positionPanel = useCallback(() => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 140;
    const below = anchor.bottom + 8;
    const top = below + panelHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, Math.min(anchor.top - panelHeight - 8, window.innerHeight - panelHeight - 12));

    setPanelPosition({ top, left, width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !rootRef.current?.contains(event.target)
        && !panelRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [isOpen, positionPanel]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, zIndex: isOpen ? 1100 : undefined }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}の説明を${isOpen ? '閉じる' : '表示'}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
          } else {
            positionPanel();
            setIsOpen(true);
          }
        }}
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: '1.75rem',
          height: '1.75rem',
          padding: 0,
          border: 'none',
          borderRadius: '50%',
          background: isOpen ? 'rgba(66,223,229,0.18)' : 'rgba(66,223,229,0.07)',
          color: '#42dfe5',
          fontSize: '1.15rem',
          lineHeight: 1,
          fontWeight: 900,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <AppIcon name="info" size={21} />
      </button>
      {isOpen && panelPosition && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="note"
          style={{
            position: 'fixed',
            top: panelPosition.top,
            left: panelPosition.left,
            width: panelPosition.width,
            maxHeight: 'calc(100dvh - 24px)',
            boxSizing: 'border-box',
            overflowY: 'auto',
            padding: '0.75rem 0.85rem',
            border: '1px solid rgba(66,223,229,0.35)',
            borderRadius: '12px',
            background: 'rgba(12,16,23,0.98)',
            color: '#d8e0e8',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            fontSize: '0.76rem',
            lineHeight: 1.6,
            textAlign: 'left',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            zIndex: 10000,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', marginBottom: '0.25rem' }}>
            <strong style={{ color: '#42dfe5', fontSize: '0.72rem' }}>{label}</strong>
            <button
              type="button"
              aria-label="説明を閉じる"
              onClick={() => setIsOpen(false)}
              style={{ border: 0, padding: '0 0.1rem', background: 'transparent', color: '#8994a2', fontSize: '1rem', cursor: 'pointer' }}
            >
              <AppIcon name="close" size={16} />
            </button>
          </div>
          <div>{text}</div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default InfoHint;
