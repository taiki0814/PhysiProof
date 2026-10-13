/* Reusable, self-contained SVG garment artwork for the studio and its previews. */
const UniformStudioRenderer = (() => {
  'use strict';

  const VIEW_BOX = '0 0 600 640';
  const FONT_FAMILIES = {
    athletic: "'Arial Black', Impact, sans-serif",
    sans: "'Helvetica Neue', Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Courier New', monospace",
  };

  // The dimensions describe representative constructions, rather than a specific kit.
  // Each neckline is an opening in the silhouette; the collar is sewn around it.
  const PROFILES = {
    adidas: {
      outer: 'M248 77 C226 79 201 88 180 101 C151 120 117 147 90 170 Q85 174 89 182 L126 250 Q130 257 136 254 L181 228 C187 275 184 311 183 346 C181 411 181 478 177 548 Q177 553 183 554 Q300 569 417 554 Q423 553 423 548 C419 478 419 411 417 346 C416 311 413 275 419 228 L464 254 Q470 257 474 250 L511 182 Q515 174 510 170 C483 147 449 120 420 101 C399 88 374 79 352 77',
      body: 'M248 77 C226 79 202 88 182 102 C179 129 181 155 188 181 Q194 207 181 228 C187 275 184 311 183 346 C181 411 181 478 177 548 Q177 553 183 554 Q300 569 417 554 Q423 553 423 548 C419 478 419 411 417 346 C416 311 413 275 419 228 Q406 207 412 181 C419 155 421 129 418 102 C398 88 374 79 352 77',
      sleeveSeam: 'M182 102 C179 129 181 155 188 181 Q194 207 181 228',
      sideSeam: 'M181 228 C195 279 193 324 191 371 L187 540',
      hem: 'M183 544 Q300 559 417 544',
      cuff: 'M89 173 L128 252 L140 247 L101 163 Z',
      cuffSeam: 'M101 168 L138 248',
    },
    nike: {
      outer: 'M248 77 C224 80 203 85 182 98 C157 118 122 147 96 174 Q92 178 95 184 L130 251 Q134 258 141 254 L184 231 C192 271 194 314 192 350 C189 414 187 480 182 541 Q182 547 188 548 Q300 563 412 548 Q418 547 418 541 C413 480 411 414 408 350 C406 314 408 271 416 231 L459 254 Q466 258 470 251 L505 184 Q508 178 504 174 C478 147 443 118 418 98 C397 85 376 80 352 77',
      body: 'M248 77 L241 88 C222 124 205 169 184 231 C192 271 194 314 192 350 C189 414 187 480 182 541 Q182 547 188 548 Q300 563 412 548 Q418 547 418 541 C413 480 411 414 408 350 C406 314 408 271 416 231 C395 169 378 124 359 88 L352 77',
      sleeveSeam: 'M241 88 C222 124 205 169 184 231',
      sideSeam: 'M184 231 C203 279 205 330 203 377 L195 535',
      hem: 'M188 538 Q300 553 412 538',
      cuff: 'M95 178 L132 253 L144 249 L107 169 Z',
      cuffSeam: 'M107 172 L142 249',
    },
    puma: {
      outer: 'M248 77 C226 77 199 87 179 100 C151 119 117 148 87 175 Q83 180 88 187 L127 253 Q131 260 138 256 L182 230 C191 277 190 317 188 353 C184 419 184 487 179 547 Q178 554 185 555 Q300 570 415 555 Q422 554 421 547 C416 487 416 419 412 353 C410 317 409 277 418 230 L462 256 Q469 260 473 253 L512 187 Q517 180 513 175 C483 148 449 119 421 100 C401 87 374 77 352 77',
      body: 'M248 77 C226 77 202 87 182 103 C185 133 192 162 193 185 Q194 211 182 230 C191 277 190 317 188 353 C184 419 184 487 179 547 Q178 554 185 555 Q300 570 415 555 Q422 554 421 547 C416 487 416 419 412 353 C410 317 409 277 418 230 Q406 211 407 185 C408 162 415 133 418 103 C398 87 374 77 352 77',
      sleeveSeam: 'M182 103 C185 133 192 162 193 185 Q194 211 182 230',
      sideSeam: 'M182 230 C208 279 210 332 205 389 L198 541',
      hem: 'M185 545 Q300 560 415 545',
      cuff: 'M87 179 L129 255 L143 248 L100 168 Z',
      cuffSeam: 'M101 175 L140 247',
    },
  };

  function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[character]));
  }

  function color(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function mirror(markup) {
    return `${markup}<g transform="translate(600 0) scale(-1 1)">${markup}</g>`;
  }

  // The renderer is also used for exports. Only bounded PNG data URIs may enter
  // its generated markup, even if a caller bypasses the shared asset client.
  const pngMetadata = new Map();

  function inspectPng(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.length > 27962050 ||
        !dataUrl.startsWith('data:image/png;base64,')) return null;
    if (pngMetadata.has(dataUrl)) return pngMetadata.get(dataUrl);
    let result = null;
    try {
      const encoded = dataUrl.slice(22);
      if (encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
      const raw = atob(encoded);
      if (raw.length < 57 || raw.length > 20 * 1024 * 1024) return null;
      const byte = (index) => raw.charCodeAt(index);
      const uint32 = (index) => byte(index) * 16777216 + byte(index + 1) * 65536 + byte(index + 2) * 256 + byte(index + 3);
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => byte(index) === value) ||
          uint32(8) !== 13 || raw.slice(12, 16) !== 'IHDR') return null;
      const width = uint32(16);
      const height = uint32(20);
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width > 2048 || height > 2048 ||
          !depths[byte(25)]?.includes(byte(24)) || byte(26) !== 0 || byte(27) !== 0 || byte(28) > 1) return null;
      let offset = 8;
      let hasData = false;
      let complete = false;
      while (offset + 12 <= raw.length) {
        const length = uint32(offset);
        const type = raw.slice(offset + 4, offset + 8);
        if (!/^[A-Za-z]{4}$/.test(type) || length > raw.length - offset - 12 ||
            (offset > 8 && type === 'IHDR') || ['acTL', 'fcTL', 'fdAT'].includes(type)) return null;
        offset += length + 12;
        if (type === 'IDAT' && length) hasData = true;
        if (type === 'IEND') {
          if (length !== 0 || offset !== raw.length) return null;
          complete = true;
          break;
        }
      }
      if (hasData && complete) result = { width, height };
    } catch {
      return null;
    }
    if (pngMetadata.size >= 12) pngMetadata.delete(pngMetadata.keys().next().value);
    pngMetadata.set(dataUrl, result);
    return result;
  }

  function safeAsset(asset, kind) {
    if (!asset || asset.kind !== kind || asset.enabled === false) return null;
    const image = inspectPng(asset.dataUrl);
    if (!image || (kind === 'emblem' && (image.width > 1024 || image.height > 1024)) ||
        asset.width !== image.width || asset.height !== image.height) return null;
    return {
      ...image, dataUrl: asset.dataUrl,
      colorMode: asset.colorMode === 'tint' ? 'tint' : 'original',
      placement: ['body', 'all', 'repeat'].includes(asset.placement) ? asset.placement : 'body',
      scale: clamp(asset.scale, 20, 180, 100),
    };
  }

  function imageSize(asset, width, height) {
    const ratio = Math.min(width / asset.width, height / asset.height);
    return { width: asset.width * ratio, height: asset.height * ratio };
  }

  function assetImage(asset, id, role, x, y, width, height) {
    const filter = asset.colorMode === 'tint' ? ` filter="url(#${id}-${role}-ink)"` : '';
    return `<image href="${asset.dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"${filter}/>`;
  }

  function renderAssetDefinitions(id, state) {
    const tint = (asset, role, ink) => asset?.colorMode === 'tint'
      ? `<filter id="${id}-${role}-ink" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood flood-color="${ink}" result="ink"/><feComposite in="ink" in2="SourceAlpha" operator="in"/></filter>`
      : '';
    const asset = state.patternAsset;
    let repeat = '';
    if (asset?.placement === 'repeat') {
      const tile = 72 * asset.scale / 100;
      const size = imageSize(asset, tile, tile);
      repeat = `<pattern id="${id}-custom-pattern" x="300" y="77" width="${size.width}" height="${size.height}" patternUnits="userSpaceOnUse">${assetImage(asset, id, 'pattern', 0, 0, size.width, size.height)}</pattern>`;
    }
    return `${tint(asset, 'pattern', state.accent)}${tint(state.emblemAsset, 'emblem', state.line)}${repeat}`;
  }

  function renderDefinitions(id, outline, bodyOutline, state, thumbnail) {
    return `
      <defs>
        <clipPath id="${id}-garment"><path d="${outline}"/></clipPath>
        <clipPath id="${id}-body"><path d="${bodyOutline}"/></clipPath>
        ${renderAssetDefinitions(id, state)}
        <linearGradient id="${id}-body-light" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#0b131c" stop-opacity=".16"/>
          <stop offset=".15" stop-color="#fff" stop-opacity=".03"/>
          <stop offset=".29" stop-color="#fff" stop-opacity=".16"/>
          <stop offset=".43" stop-color="#fff" stop-opacity=".025"/>
          <stop offset=".64" stop-color="#0b131c" stop-opacity=".025"/>
          <stop offset=".77" stop-color="#fff" stop-opacity=".055"/>
          <stop offset="1" stop-color="#0b131c" stop-opacity=".19"/>
        </linearGradient>
        <linearGradient id="${id}-vertical-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".14"/>
          <stop offset=".23" stop-color="#fff" stop-opacity=".02"/>
          <stop offset=".75" stop-color="#06101a" stop-opacity="0"/>
          <stop offset="1" stop-color="#06101a" stop-opacity=".07"/>
        </linearGradient>
        <radialGradient id="${id}-chest-light" cx=".4" cy=".2" r=".78">
          <stop offset="0" stop-color="#fff" stop-opacity=".13"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="${id}-crease" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#0a1521" stop-opacity="0"/>
          <stop offset=".42" stop-color="#0a1521" stop-opacity=".11"/>
          <stop offset=".67" stop-color="#fff" stop-opacity=".1"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${id}-sleeve-fold" x1=".12" y1="0" x2=".78" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".55" stop-color="#fff" stop-opacity=".08"/>
          <stop offset=".78" stop-color="#06101a" stop-opacity=".045"/>
          <stop offset="1" stop-color="#06101a" stop-opacity=".2"/>
        </linearGradient>
        <linearGradient id="${id}-neck-depth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#060e16" stop-opacity=".69"/>
          <stop offset=".55" stop-color="#060e16" stop-opacity=".36"/>
          <stop offset="1" stop-color="#060e16" stop-opacity=".2"/>
        </linearGradient>
        <linearGradient id="${id}-collar-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".24"/>
          <stop offset=".35" stop-color="#fff" stop-opacity=".06"/>
          <stop offset="1" stop-color="#07121a" stop-opacity=".27"/>
        </linearGradient>
        <pattern id="${id}-knit" width="3.6" height="4.2" patternUnits="userSpaceOnUse">
          <path d="M.25 .3 1.7 2.1 3.15 .3 M.25 2.4 1.7 4.2 3.15 2.4" fill="none" stroke="#fff" stroke-width=".42" stroke-opacity=".24"/>
          <path d="M1.7 0v4.2" stroke="#081521" stroke-width=".35" stroke-opacity=".13"/>
        </pattern>
        <pattern id="${id}-mesh" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
          <ellipse cx="1.2" cy="1.1" rx=".48" ry=".7" fill="#081521" opacity=".3"/>
          <ellipse cx="3.45" cy="3.35" rx=".48" ry=".7" fill="#081521" opacity=".3"/>
          <path d="M.7 2.1h1 M3 4.3h1" stroke="#fff" stroke-width=".35" opacity=".32"/>
        </pattern>
        <pattern id="${id}-pique" width="4" height="5" patternUnits="userSpaceOnUse">
          <path d="M1 .5 2.2 1.6 1 2.7 -.2 1.6 Z M3 3 4.2 4.1 3 5.2 1.8 4.1 Z" fill="none" stroke="#081521" stroke-width=".48" opacity=".18"/>
          <path d="M1 .5 2.2 1.6 M3 3 4.2 4.1" fill="none" stroke="#fff" stroke-width=".5" opacity=".3"/>
        </pattern>
        <pattern id="${id}-vent" width="5" height="5" patternUnits="userSpaceOnUse">
          <ellipse cx="1.1" cy="1.25" rx=".65" ry=".9" fill="#0b1b28" opacity=".25"/>
          <ellipse cx="3.6" cy="3.75" rx=".65" ry=".9" fill="#0b1b28" opacity=".25"/>
          <path d="M.45 2.4h1.3 M2.95 4.9h1.3" stroke="#fff" stroke-width=".45" opacity=".26"/>
        </pattern>
        <pattern id="${id}-rib" width="3" height="3" patternUnits="userSpaceOnUse">
          <path d="M.5 0v3" stroke="#fff" stroke-width=".55" stroke-opacity=".22"/>
          <path d="M1.6 0v3" stroke="#000" stroke-width=".5" stroke-opacity=".15"/>
        </pattern>
        <filter id="${id}-floor-shadow" x="-.3" y="-2" width="1.6" height="5">
          <feGaussianBlur stdDeviation="${thumbnail ? 5 : 8}"/>
        </filter>
        <filter id="${id}-cast-shadow" x="-.15" y="-.1" width="1.3" height="1.3">
          <feGaussianBlur stdDeviation="${thumbnail ? 3 : 5}"/>
        </filter>
        <filter id="${id}-soft-crease" x="-.3" y="-.3" width="1.6" height="1.6">
          <feGaussianBlur stdDeviation="1.1"/>
        </filter>
      </defs>`;
  }

  function renderPattern(kind, accent, asset, id) {
    if (asset) {
      if (asset.placement === 'repeat') return `<rect x="70" y="60" width="460" height="520" fill="url(#${id}-custom-pattern)"/>`;
      const scale = asset.scale / 100;
      const size = imageSize(asset, (asset.placement === 'body' ? 244 : 432) * scale, 480 * scale);
      const image = assetImage(asset, id, 'pattern', 300 - size.width / 2, 317 - size.height / 2, size.width, size.height);
      return asset.placement === 'body' ? `<g clip-path="url(#${id}-body)">${image}</g>` : image;
    }
    if (kind === 'stripe') {
      return `<g fill="${accent}"><path d="M275 60h50v520h-50z"/><path d="M259 60h6v520h-6z M335 60h6v520h-6z"/></g>`;
    }
    if (kind === 'block') {
      return `<path d="M70 252h460v104H70z" fill="${accent}"/>`;
    }
    if (kind === 'shoulder') {
      return `<path d="M60 55h480v145 C453 199 391 181 300 183 C209 181 147 199 60 200 Z" fill="${accent}"/>`;
    }
    return '';
  }

  // Original neutral seam/detail treatment; no brand marks or signature tapes.
  function renderBrand(state, id, profile) {
    return mirror(`<path d="${profile.cuff}" fill="${state.line}" fill-opacity=".2"/>`);
  }
  function safeModelProfile(value) {
    const keys=['outer','body','sleeveSeam','sideSeam','hem','cuff','cuffSeam'];
    return value && keys.every(k=>typeof value[k]==='string' && value[k].length<=20000 && /^[MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]*$/.test(value[k]))
      && ['neckline','collar','cavity'].every(k=>value[k]===undefined || (typeof value[k]==='string' && value[k].length<=20000 && /^[MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]*$/.test(value[k]))) ? value : null;
  }

  function renderFolds(id) {
    // Broad low-contrast light describes the cloth; narrow creases are kept near seams.
    const sleeveFold = `<path d="M95 174 C127 165 156 177 182 229 L133 254Z" fill="url(#${id}-sleeve-fold)"/>`;
    const sideFold = `<path d="M180 225 C207 267 205 306 200 342 C192 405 201 474 191 549 L211 552 C208 476 211 409 211 347 C217 298 205 254 180 225Z" fill="url(#${id}-crease)"/>`;
    const lowerFold = `<path d="M224 383 C214 441 227 493 215 556 L237 558 C231 508 239 450 224 383Z" fill="url(#${id}-crease)" opacity=".48"/>`;
    return `${mirror(sleeveFold)}<g filter="url(#${id}-soft-crease)">${mirror(sideFold)}${mirror(lowerFold)}</g>
      <g filter="url(#${id}-soft-crease)">
        <path d="M191 233 C207 236 217 246 233 274 C215 252 205 249 193 247Z" fill="#081522" opacity=".045"/>
        <path d="M409 233 C392 238 382 255 370 279 C385 260 398 254 406 248Z" fill="#081522" opacity=".055"/>
      </g>
      <path d="M186 528 Q241 531 273 544 C236 538 211 541 185 540Z" fill="#fff" opacity=".13"/>
      <path d="M318 545 Q370 529 416 535 L416 542 Q365 539 318 549Z" fill="#06101a" opacity=".04"/>`;
  }

  function renderSeams(profile, id, maker) {
    const stitch = (path, opacity = '.2') => `<path d="${path}" fill="none" stroke="#16202b" stroke-opacity="${opacity}" stroke-width=".85"/>
      <path d="${path}" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width=".7" stroke-dasharray="1.2 2.2" transform="translate(1.3 0)"/>`;
    return `<g>${mirror(stitch(profile.sleeveSeam, maker === 'nike' ? '.12' : '.17'))}
      ${mirror(stitch(profile.sideSeam, '.13'))}
      ${mirror(stitch(profile.cuffSeam, '.2'))}
      ${stitch(profile.hem, '.18')}
      <path d="${profile.hem}" transform="translate(0 -3.3)" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".65" stroke-dasharray="1 2"/>
      <path d="M185 540v10 M415 540v10" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>
    </g>`;
  }

  function renderNeckCavity(id, base, back) {
    if (back) {
      return `<path d="M245 77 Q300 70 355 77 Q300 103 245 77Z" fill="${base}"/>
        <path d="M245 77 Q300 70 355 77 Q300 103 245 77Z" fill="url(#${id}-neck-depth)"/>`;
    }
    return `<path d="M242 76 Q300 60 358 76 C350 106 329 132 300 133 C271 132 250 106 242 76Z" fill="${base}"/>
      <path d="M242 76 Q300 60 358 76 C350 106 329 132 300 133 C271 132 250 106 242 76Z" fill="url(#${id}-neck-depth)"/>
      <path d="M244 78 Q300 96 356 78" fill="none" stroke="#030912" stroke-opacity=".19" stroke-width="5"/>
      <path d="M246 75 Q300 91 354 75" fill="none" stroke="${base}" stroke-opacity=".7" stroke-width="4"/>
      <path d="M246 74 Q300 90 354 74" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".85"/>
      <g transform="translate(290 85) rotate(2 10 9)">
        <path d="M0 0h20v18q-10 3-20 0Z" fill="#e6e5df" opacity=".93"/>
        <path d="M4 4h12M6 7h8" stroke="#727974" stroke-width=".8"/>
        <text x="10" y="14" fill="#5c665f" font-family="Arial, sans-serif" font-size="5" text-anchor="middle">M</text>
      </g>`;
  }

  function renderCollar(id, line, back, maker) {
    const frontRing = 'M237 78 L248 76 C254 103 272 124 300 127 C328 124 346 103 352 76 L363 78 C357 114 334 142 300 144 C266 142 243 114 237 78Z';
    const rearRing = 'M239 77 L249 76 Q300 94 351 76 L361 77 Q347 108 300 110 Q253 108 239 77Z';
    const ring = back ? rearRing : frontRing;
    const edge = back
      ? 'M249 77 Q300 95 351 77'
      : 'M248 77 C254 103 272 124 300 127 C328 124 346 103 352 77';
    const seam = back
      ? 'M241 79 Q255 105 300 107 Q345 105 359 79'
      : 'M240 79 C246 112 267 139 300 141 C333 139 354 112 360 79';
    return `<path d="${ring}" fill="${line}"/>
      <path d="${ring}" fill="url(#${id}-collar-light)"/>
      <path d="${ring}" fill="url(#${id}-rib)" opacity="${maker === 'nike' ? '.46' : '.72'}"/>
      <path d="${edge}" fill="none" stroke="#070e16" stroke-opacity=".3" stroke-width="1.2"/>
      <path d="${seam}" fill="none" stroke="#fff" stroke-opacity=".31" stroke-width=".85"/>
      <path d="${seam}" fill="none" stroke="#060b14" stroke-opacity=".28" stroke-width=".8" stroke-dasharray="1 2.1"/>`;
  }

  function renderCrest(state, id) {
    // A player's left chest is on the viewer's right in a front view.
    const x = state.position === 'center' ? 300 : state.position === 'right' ? 240 : 360;
    if (state.emblemAsset) {
      const maximum = 52 * state.emblemAsset.scale / 100;
      const size = imageSize(state.emblemAsset, maximum, maximum);
      return assetImage(state.emblemAsset, id, 'emblem', x - size.width / 2, 220 - size.height / 2, size.width, size.height);
    }
    if (state.emblem === 'none') return '';
    const rgb = state.line.slice(1).match(/.{2}/g).map((component) => parseInt(component, 16));
    const white = (rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722) > 170 ? '#203c36' : '#ffffff';
    const shape = {
      star: `<path d="M0-19 5.3-6.7 18.8-5.6 8.6 3.3 11.6 16.5 0 9.6-11.6 16.5-8.6 3.3-18.8-5.6-5.3-6.7Z"/>
        <path d="M0-13 3.7-4.6 12.8-3.8 5.9 2.2 7.9 11.2 0 6.5-7.9 11.2-5.9 2.2-12.8-3.8-3.7-4.6Z" fill="none" stroke="${white}" stroke-opacity=".64" stroke-width=".65"/>`,
      shield: `<path d="M0-22 18-15v17C18 14 7 21 0 24-7 21-18 14-18 2v-17Z"/>
        <path d="M0-17 13-12V2c0 9-8 15-13 18C-5 17-13 11-13 2v-14Z" fill="none" stroke="${white}" stroke-width=".85" stroke-opacity=".7"/>
        <path d="M0-10 2.6-4.1 9-3.6 4.1.8 5.5 7.2 0 3.9-5.5 7.2-4.1.8-9-3.6-2.6-4.1Z" fill="${white}" opacity=".85"/>`,
      monogram: `<circle r="20"/><circle r="16" fill="none" stroke="${white}" stroke-width=".7" stroke-opacity=".67"/>
        <text x="0" y="8.2" text-anchor="middle" fill="${white}" stroke="none" font-size="25" font-family="Georgia, serif" font-weight="700">Y</text>`,
      circle: `<circle r="20"/><circle r="16" fill="none" stroke="${white}" stroke-width=".8" stroke-opacity=".7"/>
        <path d="M0-11 2.8-3.7 10.4-3.4 4.5 1.6 6.4 9 0 4.7-6.4 9-4.5 1.6-10.4-3.4-2.8-3.7Z" fill="${white}" opacity=".88"/>`,
    }[state.emblem] || '';
    return `<g transform="translate(${x} 220)" fill="${state.line}" stroke="#101c26" stroke-opacity=".17" stroke-width=".65">${shape}</g>`;
  }

  let textMeasurementContext;

  function getTextMeasurementContext() {
    if (textMeasurementContext !== undefined) return textMeasurementContext;
    textMeasurementContext = null;
    try {
      if (typeof document !== 'undefined' && document.createElement) {
        textMeasurementContext = document.createElement('canvas').getContext('2d');
      } else if (typeof OffscreenCanvas !== 'undefined') {
        textMeasurementContext = new OffscreenCanvas(1, 1).getContext('2d');
      }
    } catch {
      // Exports and offline renderers can work without a browser or a canvas.
    }
    return textMeasurementContext;
  }

  function fallbackTextWidth(value, fontSize, fontFamily, fontWeight) {
    const monospace = fontFamily === FONT_FAMILIES.mono;
    const heavy = fontFamily === FONT_FAMILIES.athletic || fontWeight >= 800;
    return Array.from(value).reduce((width, character) => {
      // Marks and joiners have no independent advance. Other Unicode characters
      // receive a full-width allowance so Japanese names also fit offline.
      if (/[\p{Mark}\u200d\ufe0f]/u.test(character)) return width;
      let advance;
      if (/[^\u0000-\u00ff]/.test(character)) advance = 1.2;
      else if (monospace) advance = .67;
      else if (/\s/.test(character)) advance = .38;
      else if (/[W@]/.test(character)) advance = 1.2;
      else if (/[Mm]/.test(character)) advance = 1.12;
      else if (character === 'w') advance = 1.02;
      else if (/[A-Z]/.test(character)) advance = heavy ? .92 : .86;
      else if (/[0-9]/.test(character)) advance = heavy ? .85 : .78;
      else if (/[ilI.,'`!:;|]/.test(character)) advance = .43;
      else if (/[a-z]/.test(character)) advance = heavy ? .81 : .75;
      else advance = 1.05;
      return width + fontSize * advance;
    }, 0);
  }

  function fitText(value, fontSize, maximumWidth, fontFamily, fontWeight, letterSpacing, strokeWidth = 0) {
    let width;
    const context = getTextMeasurementContext();
    if (context) {
      try {
        context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        const metrics = context.measureText(value);
        const inkWidth = (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0);
        width = Math.max(metrics.width, inkWidth);
      } catch {
        width = undefined;
      }
    }
    if (!Number.isFinite(width) || (value && width <= 0)) {
      width = fallbackTextWidth(value, fontSize, fontFamily, fontWeight);
    }
    const characterCount = Array.from(value).filter((character) => !/[\p{Mark}\u200d\ufe0f]/u.test(character)).length;
    width += Math.max(0, characterCount - 1) * letterSpacing;
    // An explicit transform also works in SVG exporters that ignore textLength.
    // Keep the center and type size fixed; only condense the glyphs horizontally.
    // Reserve both outline edges for the number print before calculating its fit.
    const availableWidth = maximumWidth - strokeWidth;
    const scale = Math.floor(Math.min(1, availableWidth / Math.max(width, 1)) * 100000) / 100000;
    return scale < 1 ? ` transform="translate(300 0) scale(${scale} 1) translate(-300 0)"` : '';
  }

  function renderPersonalization(state, id) {
    if (state.view !== 'back') return renderCrest(state, id);
    const name = String(state.playerName || '').slice(0, 40);
    const number = String(state.playerNumber || '').slice(0, 6);
    const nameSize = clamp(state.nameSize, 12, 32, 18);
    const numberSize = clamp(state.numberSize, 60, 150, 116);
    const nameY = { high: 218, middle: 274, low: 327 }[state.namePosition] || 218;
    const numberY = { high: 309, middle: 378, low: 445 }[state.numberPosition] || 378;
    const nameFont = (Object.hasOwn(FONT_FAMILIES,state.nameFont || state.letterFont) ? FONT_FAMILIES[state.nameFont || state.letterFont] : FONT_FAMILIES.athletic);
    const numberFont = (Object.hasOwn(FONT_FAMILIES,state.numberFont || state.letterFont) ? FONT_FAMILIES[state.numberFont || state.letterFont] : FONT_FAMILIES.athletic);
    const nameTracking = name.length > 20 ? .6 : 1.7;
    return `<g fill="${color(state.textColor, state.line)}" text-anchor="middle">
      <text x="300" y="${nameY}" font-family="${nameFont}" font-size="${nameSize}" font-weight="700" letter-spacing="${nameTracking}"${fitText(name, nameSize, 218, nameFont, 700, nameTracking)}>${escapeXml(name)}</text>
      <text x="300" y="${numberY}" dominant-baseline="central" font-family="${numberFont}" font-size="${numberSize}" font-weight="900" letter-spacing="-3" stroke="${state.base}" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke fill"${fitText(number, numberSize, 226, numberFont, 900, -3, 2.5)}>${escapeXml(number)}</text>
    </g>`;
  }

  function render(input, { prefix = 'main', thumbnail = false } = {}) {
    const id = `uniform-${String(prefix).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const state = {
      ...input,
      maker: Object.hasOwn(PROFILES, input.maker) ? input.maker : 'adidas',
      view: input.view === 'back' ? 'back' : 'front',
      base: color(input.base, '#f1f0e8'),
      accent: color(input.accent, '#d9573b'),
      line: color(input.line, '#203c36'),
      fabric: ['knit', 'mesh', 'pique'].includes(input.fabric) ? input.fabric : 'knit',
      patternAsset: safeAsset(input[input.view === 'back' ? 'backPatternAsset' : 'frontPatternAsset'], 'pattern'),
      emblemAsset: safeAsset(input.emblemAsset, 'emblem'),
    };
    const profile = safeModelProfile(input.modelProfile) || PROFILES[state.maker];
    const back = state.view === 'back';
    const neckline = profile.neckline || (back
      ? ' Q300 96 248 77Z'
      : ' C346 103 328 124 300 127 C272 124 254 103 248 77Z');
    const outline = profile.outer + neckline;
    const bodyOutline = profile.body + neckline;
    const pattern = state[back ? 'backDesign' : 'frontDesign'];
    return `${renderDefinitions(id, outline, bodyOutline, state, thumbnail)}
      <g transform="translate(-24 21) scale(1.08 .94)">
      <ellipse cx="300" cy="579" rx="133" ry="10" fill="#192c24" opacity=".12" filter="url(#${id}-floor-shadow)"/>
      <path d="${outline}" transform="translate(2 8)" fill="#1a2821" opacity=".11" filter="url(#${id}-cast-shadow)"/>
      ${profile.cavity ? `<path d="${profile.cavity}" fill="#192c24"/>` : renderNeckCavity(id, state.base, back)}
      <path d="${outline}" fill="${state.base}"/>
      <g clip-path="url(#${id}-garment)">
        ${renderPattern(pattern, state.accent, state.patternAsset, id)}
        ${renderBrand(state, id, profile)}
        <path d="${outline}" fill="url(#${id}-${state.fabric})" opacity="${thumbnail ? '.3' : '.55'}"/>
        <path d="${outline}" fill="url(#${id}-body-light)"/>
        <path d="${outline}" fill="url(#${id}-vertical-light)"/>
        <path d="${outline}" fill="url(#${id}-chest-light)"/>
        ${renderFolds(id)}
        ${renderSeams(profile, id, state.maker)}
        ${renderPersonalization(state, id)}
      </g>
      <path d="${outline}" fill="none" stroke="#101e29" stroke-opacity=".19" stroke-width=".8"/>
      <path d="${outline}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".65" transform="translate(0 -.6)"/>
      ${profile.collar ? `<path d="${profile.collar}" fill="${state.line}"/>` : renderCollar(id, state.line, back, state.maker)}
      </g>`;
  }

  return Object.freeze({ viewBox: VIEW_BOX, render });
})();

export default UniformStudioRenderer;
