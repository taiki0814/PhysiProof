import { useId } from 'react';
import type { UniformDesign } from '@my-app/shared';
import { UNIFORM_BASES, UNIFORM_PATTERNS } from '@my-app/shared';
import './UniformPreview.css';

export interface UniformPreviewProps {
  design: UniformDesign;
  view?: 'front' | 'back';
  compact?: boolean;
  label?: string;
  className?: string;
}

const FONT_STYLES = {
  block: { family: '"Arial Black", Impact, "Yu Gothic", sans-serif', weight: 900, spacing: 1.1 },
  rounded: { family: '"Arial Rounded MT Bold", "Trebuchet MS", "Yu Gothic", sans-serif', weight: 700, spacing: 0.6 },
  mono: { family: 'Consolas, "Courier New", "Yu Gothic", monospace', weight: 700, spacing: 0 },
} satisfies Record<UniformDesign['font_id'], { family: string; weight: number; spacing: number }>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shirtPath(base: UniformDesign['base_id'], back: boolean) {
  const neckline = back
    ? 'M94 24 Q120 42 146 24'
    : base === 'tank'
      ? 'M94 24 C94 45 104 59 120 59 C136 59 146 45 146 24'
      : 'M94 24 C96 43 105 51 120 51 C135 51 144 43 146 24';
  const hem = 'L185 243 Q185 252 176 253 Q120 262 64 253 Q55 252 55 243';

  if (base === 'tank') {
    return `${neckline} L170 30 Q166 78 185 104 ${hem} L55 104 Q74 78 70 30 Z`;
  }
  if (base === 'raglan') {
    return `${neckline} L168 30 Q181 35 191 46 L226 83 Q228 86 225 89
      L207 109 Q204 112 201 109 L183 96 ${hem} L57 96 L39 109 Q36 112 33 109
      L15 89 Q12 86 14 83 L49 46 Q59 35 72 30 Z`;
  }
  return `${neckline} L168 30 Q177 33 189 42 L225 77 Q228 80 225 84
    L208 103 Q205 106 201 103 L183 91 ${hem} L57 91 L39 103 Q35 106 32 103
    L15 84 Q12 80 15 77 L51 42 Q63 33 72 30 Z`;
}

function PatternArtwork({ design, gradientId, gridId }: {
  design: UniformDesign;
  gradientId: string;
  gridId: string;
}) {
  switch (design.pattern_id) {
    case 'plain':
      return null;
    case 'diagonal':
      return (
        <g fill={design.colors.pattern}>
          <path d="M16 171 L211 39 L235 75 L37 211 Z" />
          <path d="M37 219 L234 85 L234 91 L41 224 Z" opacity="0.6" />
        </g>
      );
    case 'chevron':
      return (
        <g fill={design.colors.pattern}>
          <path d="M14 69 L120 118 L226 69 L226 94 L120 144 L14 94 Z" />
          <path d="M29 113 L120 155 L211 113 L211 119 L120 162 L29 119 Z" opacity="0.55" />
        </g>
      );
    case 'split':
      return (
        <>
          <path d="M120 24 H228 V259 H120 Z" fill={design.colors.pattern} />
          <path d="M120 51 V255" stroke={design.colors.secondary} strokeWidth="2" opacity="0.7" />
        </>
      );
    case 'gradient':
      return <path d="M12 24 H228 V260 H12 Z" fill={`url(#${gradientId})`} />;
    case 'ink':
      return (
        <g fill={design.colors.pattern}>
          <path d="M19 136 C32 106 52 113 63 132 C76 121 89 140 78 155
            C103 167 86 185 65 181 C52 206 26 194 32 176 C9 173 6 154 19 136 Z" />
          <path d="M164 47 C183 38 189 63 176 75 C190 83 174 101 160 92
            C141 100 128 84 141 73 C132 57 152 44 164 47 Z" />
          <path d="M135 210 C150 182 168 198 167 214 C193 205 209 221 192 235
            C201 252 176 263 164 248 C143 260 122 243 135 228 C122 223 124 213 135 210 Z" />
          <circle cx="91" cy="205" r="5" />
          <circle cx="106" cy="218" r="2.5" />
          <circle cx="54" cy="105" r="4" />
          <circle cx="192" cy="125" r="6" />
          <circle cx="151" cy="116" r="3" />
          <path d="M75 182 L92 193 L82 197 Z M170 163 L183 146 L182 168 Z" />
        </g>
      );
    case 'grid':
      return <path d="M12 24 H228 V260 H12 Z" fill={`url(#${gridId})`} />;
    case 'lightning':
      return (
        <g fill={design.colors.pattern}>
          <path d="M158 25 L103 109 L136 103 L72 214 L157 126 L124 132 L187 25 Z" />
          <path d="M195 125 L163 177 L181 174 L142 244 L204 184 L184 185 L220 125 Z" opacity="0.5" />
        </g>
      );
  }
}

function LineArtwork({ design }: { design: UniformDesign }) {
  const tank = design.base_id === 'tank';
  let path: string;
  switch (design.line_id) {
    case 'none':
      return null;
    case 'shoulder':
      path = tank
        ? 'M79 33 L88 36 M152 36 L161 33'
        : design.base_id === 'raglan'
          ? 'M86 33 Q79 62 58 86 M154 33 Q161 62 182 86'
          : 'M78 33 Q54 40 31 66 M162 33 Q186 40 209 66';
      break;
    case 'side':
      path = 'M65 105 Q70 175 65 247 M175 105 Q170 175 175 247';
      break;
    case 'sleeve':
      path = tank
        ? 'M73 41 Q75 82 59 104 M167 41 Q165 82 181 104'
        : design.base_id === 'raglan'
          ? 'M20 82 L40 105 M220 82 L200 105'
          : 'M21 76 L40 99 M219 76 L200 99';
      break;
    case 'arc':
      path = 'M55 114 Q120 75 185 114';
      break;
    case 'slash':
      path = 'M76 211 L100 182 L88 182 L117 151 M126 138 L133 129';
      break;
  }
  return (
    <path
      d={path}
      fill="none"
      stroke={design.colors.line}
      strokeWidth={clamp(design.line_width, 2, 12)}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// Original marks use a small, shared coordinate system, with no external assets.
function EmblemArtwork({ kind }: { kind: UniformDesign['emblem_id'] }) {
  switch (kind) {
    case 'none':
      return null;
    case 'shield':
      return (
        <>
          <path d="M-10-10 L0-13 L10-10 V0 Q9 8 0 13 Q-9 8-10 0 Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M-5-5 L0-7 L5-5 V0 L0 6 L-5 0 Z" />
        </>
      );
    case 'flame':
      return <path d="M0-13 C2-5 11-3 10 5 C9 13-5 16-10 7 C-13 1-6-5-5-9
        C-4-3-1-2 0-13 Z M0 1 C-1 5-6 6-3 10 C0 13 5 9 3 6 Z" fillRule="evenodd" />;
    case 'bolt':
      return <path d="M2-13 L-10 2 H-2 L-5 13 L11-4 H3 L7-13 Z" />;
    case 'wing':
      return <path d="M-12 8 L-8-9 L12-12 L7-6 L-3-3 L9-4 L4 2 L-5 3 L4 4 L-1 9 L-7 7 L-9 12 Z" />;
    case 'star':
      return <path d="M0-13 L3.8-4.3 L13-3.8 L6 2.5 L8 12 L0 7 L-8 12 L-6 2.5 L-13-3.8 L-3.8-4.3 Z" />;
    case 'mountain':
      return (
        <>
          <path d="M-13 9 L-3-10 L3 0 L7-5 L13 9 Z M-3-5 L-7 2 L-3 0 L0 2 Z" fillRule="evenodd" />
          <path d="M-12 12 H12" stroke="currentColor" strokeWidth="1.5" />
        </>
      );
    case 'wave':
      return (
        <>
          <path d="M-13 5 C-6 5-6-12 4-10 C12-9 13-2 8 0 C10-5 5-7 3-3
            C1 1 5 5 12 5 C6 13-6 13-13 5 Z" />
          <path d="M-10 12 Q0 16 10 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      );
    case 'paw':
      return (
        <>
          <ellipse cx="-9" cy="-3" rx="3" ry="4" transform="rotate(-25 -9 -3)" />
          <ellipse cx="-3.5" cy="-8" rx="3" ry="4" />
          <ellipse cx="3.5" cy="-8" rx="3" ry="4" />
          <ellipse cx="9" cy="-3" rx="3" ry="4" transform="rotate(25 9 -3)" />
          <path d="M-8 7 C-8 3-4 0 0 0 C4 0 8 3 8 7 C8 13 3 10 0 10 C-3 10-8 13-8 7 Z" />
        </>
      );
  }
}

function emblemPlacement(design: UniformDesign, back: boolean) {
  // Bounds contain the entire mark, including its stroke, at maximum scale.
  let area = { x: 151, y: 82, left: 123, right: 179, top: 55, bottom: 110, unit: 0.82 };
  if (design.base_id === 'tank') {
    area = { x: 148, y: 91, left: 124, right: 168, top: 70, bottom: 111, unit: 0.82 };
  }
  if (design.emblem_position === 'chest_center') {
    area = { x: 120, y: design.base_id === 'tank' ? 89 : 81, left: 92, right: 148,
      top: design.base_id === 'tank' ? 68 : 55, bottom: 109, unit: 0.82 };
  } else if (design.emblem_position === 'back') {
    area = { x: 120, y: 221, left: 87, right: 153, top: 199, bottom: 245, unit: 0.82 };
  } else if (design.emblem_position === 'sleeve_left') {
    area = design.base_id === 'tank'
      ? { x: 158, y: 47, left: 151, right: 165, top: 34, bottom: 62, unit: 0.3 }
      : { x: 198, y: 77, left: 188, right: 209, top: 64, bottom: 90, unit: 0.45 };
  }
  const scale = clamp(design.emblem_size, 0.7, 1.5) * area.unit;
  const radius = 15 * scale;
  const x = clamp(area.x + clamp(design.emblem_offset_x, -8, 8), area.left + radius, area.right - radius);
  const y = clamp(area.y + clamp(design.emblem_offset_y, -8, 8), area.top + radius, area.bottom - radius);
  // Left is the wearer's left: screen right on the front, screen left on the back.
  return { x: back && design.emblem_position === 'sleeve_left' ? 240 - x : x, y, scale };
}

export default function UniformPreview({
  design,
  view = 'front',
  compact = false,
  label,
  className,
}: UniformPreviewProps) {
  const instanceId = useId();
  const id = (part: string) => `uniform-${instanceId}-${part}`;
  const back = view === 'back';
  const tank = design.base_id === 'tank';
  const raglan = design.base_id === 'raglan';
  const outline = shirtPath(design.base_id, back);
  const font = FONT_STYLES[design.font_id];
  const name = design.jersey_name.trim();
  const nameUnits = Array.from(name).reduce((width, char) => width + (/[^\u0020-\u007e]/.test(char) ? 1 : 0.7), 0);
  const nameSize = Math.min(back ? 15 : 14, 116 / Math.max(1, nameUnits));
  const numberSize = Math.min(back ? 76 : 68, 112 / Math.max(1, design.number.length * 0.7));
  const emblem = emblemPlacement(design, back);
  const showEmblem = design.emblem_id !== 'none' && (
    design.emblem_position === 'sleeve_left' || (back ? design.emblem_position === 'back' : design.emblem_position !== 'back')
  );
  const viewLabel = back ? '背面' : '正面';
  const baseLabel = UNIFORM_BASES.find(base => base.id === design.base_id)?.name;
  const patternLabel = UNIFORM_PATTERNS.find(pattern => pattern.id === design.pattern_id)?.name;
  const neckline = back ? 'M94 24 Q120 42 146 24'
    : tank ? 'M94 24 C94 45 104 59 120 59 C136 59 146 45 146 24'
      : 'M94 24 C96 43 105 51 120 51 C135 51 144 43 146 24';
  const sleeveSeams = raglan
    ? 'M94 24 Q86 61 57 96 M146 24 Q154 61 183 96'
    : 'M74 31 Q73 67 57 91 M166 31 Q167 67 183 91';

  return (
    <div className={['pp-uniform-preview', compact && 'pp-uniform-preview--compact', className].filter(Boolean).join(' ')}>
      <svg
        className="pp-uniform-preview__svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 240 280"
        width="240"
        height="280"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={id('title')}
        aria-describedby={id('description')}
        focusable="false"
      >
        <title id={id('title')}>{label ? `${label}・${viewLabel}` : `ユニフォーム・${viewLabel}`}</title>
        <desc id={id('description')}>
          {`${baseLabel}、${patternLabel}。${name ? `名前 ${name}。` : ''}${design.number ? `番号 ${design.number}。` : ''}`}
        </desc>
        <defs>
          <clipPath id={id('shirt')} clipPathUnits="userSpaceOnUse"><path d={outline} /></clipPath>
          <linearGradient id={id('pattern')} x1="0" y1="45" x2="0" y2="253" gradientUnits="userSpaceOnUse">
            <stop stopColor={design.colors.pattern} stopOpacity="0" />
            <stop offset="0.48" stopColor={design.colors.pattern} stopOpacity="0.48" />
            <stop offset="1" stopColor={design.colors.pattern} />
          </linearGradient>
          <linearGradient id={id('fabric')} x1="16" y1="0" x2="224" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#000000" stopOpacity="0.25" />
            <stop offset="0.23" stopColor="#000000" stopOpacity="0.08" />
            <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="0.64" stopColor="#ffffff" stopOpacity="0.025" />
            <stop offset="0.8" stopColor="#000000" stopOpacity="0.1" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.24" />
          </linearGradient>
          <linearGradient id={id('drape')} x1="0" y1="24" x2="0" y2="256" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.09" />
            <stop offset="0.27" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.86" stopColor="#000000" stopOpacity="0.025" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.14" />
          </linearGradient>
          <pattern id={id('grid')} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-8 120 140)">
            <path d="M0 22 V0 H22" fill="none" stroke={design.colors.pattern} strokeWidth="1.7" />
            <circle cx="0" cy="0" r="2.5" fill={design.colors.pattern} />
          </pattern>
          <pattern id={id('weave')} width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0 1 H4 M1 0 V4" stroke="#ffffff" strokeWidth="0.3" opacity="0.12" />
            <path d="M0 3 H4" stroke="#000000" strokeWidth="0.3" opacity="0.1" />
          </pattern>
        </defs>
        <g aria-hidden="true">
          <ellipse cx="120" cy="268" rx="72" ry="5" fill="#000000" opacity="0.08" />
          <ellipse cx="120" cy="268" rx="52" ry="3" fill="#000000" opacity="0.1" />
          <g clipPath={`url(#${id('shirt')})`}>
            <path d={outline} fill={design.colors.body} />
            <g fill={design.colors.secondary}>
              {tank ? (
                <path d="M55 104 Q73 137 69 252 L53 252 Z M185 104 Q167 137 171 252 L187 252 Z" />
              ) : raglan ? (
                <path d="M12 24 H94 Q86 61 57 96 L45 119 H12 Z M146 24 H228 V119 H195 L183 96 Q154 61 146 24 Z" />
              ) : (
                <path d="M12 24 H74 Q73 67 57 91 L43 114 H12 Z M166 24 H228 V114 H197 L183 91 Q167 67 166 24 Z" />
              )}
              <path d="M57 96 Q68 157 61 251 L55 251 Z M183 96 Q172 157 179 251 L185 251 Z" opacity="0.7" />
            </g>
            <PatternArtwork design={design} gradientId={id('pattern')} gridId={id('grid')} />
            <LineArtwork design={design} />
            <path d={outline} fill={`url(#${id('fabric')})`} />
            <path d={outline} fill={`url(#${id('drape')})`} />
            <path d={outline} fill={`url(#${id('weave')})`} />
            <path d="M61 110 Q76 145 69 178 L64 227 Q65 162 61 110 Z
              M179 111 Q162 162 173 221 L177 243 Q170 173 179 111 Z" fill="#000000" opacity="0.065" />
            <path d="M78 142 Q73 199 78 235 M160 168 Q164 209 159 241" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.06" />
            <g fill={design.colors.text} fontFamily={font.family} fontWeight={font.weight} textAnchor="middle">
              {name && (
                <text
                  x="120"
                  y={back ? 99 : 130}
                  fontSize={nameSize}
                  letterSpacing={font.spacing}
                  textLength={Math.min(116, nameUnits * nameSize + Math.max(0, Array.from(name).length - 1) * font.spacing)}
                  lengthAdjust="spacingAndGlyphs"
                >{name}</text>
              )}
              {design.number && (
                <text
                  x="120"
                  y={back ? 188 : 209}
                  fontSize={numberSize}
                  textLength={Math.min(112, design.number.length * numberSize * 0.7)}
                  lengthAdjust="spacingAndGlyphs"
                  stroke={design.colors.text}
                  strokeWidth={design.font_id === 'block' ? 0.6 : 0.25}
                  strokeLinejoin={design.font_id === 'rounded' ? 'round' : 'miter'}
                  paintOrder="stroke fill"
                >{design.number}</text>
              )}
            </g>
            {showEmblem && (
              <g
                data-emblem-position={design.emblem_position}
                transform={`translate(${emblem.x} ${emblem.y}) scale(${emblem.scale})`}
                color={design.colors.emblem}
                fill="currentColor"
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <EmblemArtwork kind={design.emblem_id} />
              </g>
            )}
            <g fill="none" stroke="#000000" strokeWidth="1.1" opacity="0.18">
              {!tank && <path d={sleeveSeams} />}
              <path d="M61 244 Q120 252 179 244" />
              {!tank && <path d={raglan ? 'M19 83 L39 106 M221 83 L201 106' : 'M20 77 L39 100 M220 77 L201 100'} />}
            </g>
            <path d="M62 248 Q120 256 178 248" fill="none" stroke="#ffffff" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.2" />
            {tank && (
              <path d="M70 30 Q74 78 55 104 M170 30 Q166 78 185 104" fill="none" stroke={design.colors.collar} strokeWidth="7" />
            )}
            <path d={neckline} fill="none" stroke={design.colors.collar} strokeWidth={tank ? 10 : 11} />
            <path d={neckline} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.22" transform="translate(0 4)" />
            <path d={neckline} fill="none" stroke="#000000" strokeWidth="1" opacity="0.2" transform="translate(0 5)" />
            {back && <path d="M110 42 H130" stroke={design.colors.secondary} strokeWidth="3" strokeLinecap="round" />}
          </g>
          <path d={outline} fill="none" stroke="#000000" strokeWidth="1.3" strokeLinejoin="round" opacity="0.3" />
        </g>
      </svg>
    </div>
  );
}
