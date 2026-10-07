import React, { useEffect, useId, useRef, useState } from 'react';

interface InfoHintProps {
  label: string;
  text: string;
}

/** Compact, tap-to-open help for secondary feature explanations. */
const InfoHint: React.FC<InfoHintProps> = ({ label, text }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
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

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, zIndex: isOpen ? 1100 : undefined }}>
      <button
        type="button"
        aria-label={`${label}の説明を${isOpen ? '閉じる' : '表示'}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: '1.45rem',
          height: '1.45rem',
          padding: 0,
          border: '1px solid rgba(66,223,229,0.6)',
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
        <span aria-hidden="true" style={{ transform: 'translateY(-1px)' }}>¡</span>
      </button>
      {isOpen && (
        <div
          id={panelId}
          role="note"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.55rem)',
            right: 0,
            width: 'max-content',
            maxWidth: 'min(300px, calc(100vw - 2rem))',
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
              ×
            </button>
          </div>
          <div>{text}</div>
        </div>
      )}
    </div>
  );
};

export default InfoHint;
