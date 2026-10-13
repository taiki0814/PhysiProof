const UniformImageConverter = (() => {
  'use strict';
  const SOURCE_LIMIT=15*1024*1024, PNG_LIMIT=4*1024*1024;
  const SVG_NS='http://www.w3.org/2000/svg', XLINK_NS='http://www.w3.org/1999/xlink';
  const fail=message=>{throw new Error(message)};
  function readPng(dataUrl, kind) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      fail('素材には変換済みのPNG画像を使用してください。');
    }
    const base64 = dataUrl.slice(22);
    if (!base64.length || base64.length > Math.ceil(PNG_LIMIT / 3) * 4 ||
        base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      fail('PNG画像の形式またはサイズが正しくありません。');
    }
    let raw;
    try { raw = atob(base64); } catch (_) { fail('PNG画像を読み込めません。'); }
    if (raw.length > PNG_LIMIT || raw.length < 57) fail('PNG画像のサイズが正しくありません。');
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((byte, index) => bytes[index] === byte)) fail('PNG画像の署名が正しくありません。');
    const view = new DataView(bytes.buffer);
    const typeAt = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (view.getUint32(8) !== 13 || typeAt(12) !== 'IHDR') fail('PNG画像のヘッダーが正しくありません。');
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const limit = kind === 'emblem' ? 1024 : 2048;
    if (!width || !height || width > limit || height > limit) fail(`変換済み画像は縦横${limit}px以内にしてください。`);
    const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) {
      fail('PNG画像のヘッダーが正しくありません。');
    }
    let offset = 8;
    let hasData = false;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = typeAt(offset + 4);
      if (!/^[A-Za-z]{4}$/.test(type) || length > bytes.length - offset - 12 ||
          (offset > 8 && type === 'IHDR') || ['acTL', 'fcTL', 'fdAT'].includes(type)) {
        fail('PNG画像の内部データが正しくありません。静止画を読み込んでください。');
      }
      offset += 12 + length;
      if (type === 'IDAT' && length) hasData = true;
      if (type === 'IEND') {
        if (length !== 0 || offset !== bytes.length) fail('PNG画像の終端が正しくありません。');
        ended = true;
        break;
      }
    }
    if (!hasData || !ended) fail('PNG画像が途中で切れています。');
    return { width, height, bytes: bytes.length };
  }
  const SVG_ELEMENTS = new Set([
    'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'symbol', 'use',
    'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
    'feConvolveMatrix', 'feDiffuseLighting', 'feDistantLight', 'feDropShadow', 'feFlood',
    'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode',
    'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
    'feTile', 'feTurbulence', 'title', 'desc'
  ]);
  const SVG_ATTRIBUTES = new Set([
    'id', 'version', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'width', 'height',
    'viewBox', 'preserveAspectRatio', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'transform',
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
    'opacity', 'clip-path', 'clip-rule', 'mask', 'filter', 'display', 'visibility',
    'vector-effect', 'shape-rendering', 'color', 'color-interpolation', 'color-interpolation-filters',
    'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
    'fx', 'fy', 'fr', 'patternUnits', 'patternContentUnits', 'patternTransform',
    'clipPathUnits', 'maskUnits', 'maskContentUnits', 'filterUnits', 'primitiveUnits',
    'in', 'in2', 'result', 'mode', 'type', 'values', 'operator', 'k1', 'k2', 'k3', 'k4',
    'stdDeviation', 'flood-color', 'flood-opacity', 'slope', 'intercept', 'amplitude',
    'exponent', 'tableValues', 'order', 'kernelMatrix', 'divisor', 'bias', 'targetX',
    'targetY', 'edgeMode', 'kernelUnitLength', 'preserveAlpha', 'surfaceScale',
    'diffuseConstant', 'specularConstant', 'specularExponent', 'lighting-color', 'azimuth',
    'elevation', 'z', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'limitingConeAngle',
    'radius', 'baseFrequency', 'numOctaves', 'seed', 'stitchTiles'
  ]);
  const STYLE_ATTRIBUTES = new Set([
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
    'stroke-dashoffset', 'opacity', 'display', 'visibility', 'color',
    'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color',
    'clip-rule', 'vector-effect', 'shape-rendering', 'color-interpolation', 'color-interpolation-filters'
  ]);
  const LOCAL_ID = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;

  function safeStyle(element, text) {
    if (/[\\@]|\/\*|url\s*\(|expression\s*\(/i.test(text)) fail('SVGのstyle属性に外部参照や未対応の指定が含まれています。');
    for (const declaration of text.split(';').filter((item) => item.trim())) {
      const colon = declaration.indexOf(':');
      const key = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (colon < 1 || !STYLE_ATTRIBUTES.has(key) || !value || /[{}<>!]/.test(value)) fail('SVGのstyle属性に未対応の指定があります。図形の属性に展開して書き出してください。');
      element.setAttribute(key, value);
    }
    element.removeAttribute('style');
  }

  function sourceDimensions(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
        width > 12000 || height > 12000 || width * height > 48000000) {
      fail('画像は縦横12,000px以内、合計4,800万画素以内にしてください。');
    }
  }

  function rasterDimensions(bytes, png) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (png) {
      if (bytes.length < 33 || view.getUint32(8) !== 13 ||
          String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') fail('PNG画像のヘッダーが正しくありません。');
      sourceDimensions(view.getUint32(16), view.getUint32(20));
      return;
    }
    // Read the JPEG frame before decoding, so an oversized source cannot allocate
    // a huge bitmap before the dimension limit is applied.
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) fail('JPEG画像のヘッダーが正しくありません。');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218 || marker === undefined) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) break;
        sourceDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
        return;
      }
      offset += length;
    }
    fail('JPEG画像のサイズを読み取れません。通常のJPEGとして書き出してください。');
  }

  function svgLength(value) {
    const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(px|pt|pc|in|cm|mm)?\s*$/i.exec(value || '');
    if (!match) return null;
    return Number(match[1]) * ({ px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[match[2]?.toLowerCase()] || 1);
  }

  function sanitizeSvg(source) {
    source = source.replace(/^\uFEFF/, '').replace(/^\s*<\?xml\s[^?]*\?>/i, '');
    if (/<!DOCTYPE|<!ENTITY|<\?/i.test(source)) fail('SVGのDOCTYPE、エンティティ、処理命令には対応していません。');
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = document.documentElement;
    if (document.querySelector('parsererror') || root?.localName !== 'svg' || root.namespaceURI !== SVG_NS) fail('正しいSVGファイルを選択してください。');
    const nodes = [root, ...root.querySelectorAll('*')];
    if (nodes.length > 5000) fail('SVGの図形が多すぎます。簡略化するかPNGで書き出してください。');
    const ids = new Map();
    const references = [];
    for (const element of nodes) {
      if (element.namespaceURI !== SVG_NS || !SVG_ELEMENTS.has(element.localName)) {
        fail('SVGに未対応の要素があります。文字はアウトライン化し、画像の埋め込み・CSS・スクリプト・アニメーションを除いて書き出してください。');
      }
      if (element.hasAttribute('style')) safeStyle(element, element.getAttribute('style'));
      for (const attribute of [...element.attributes]) {
        const key = attribute.localName;
        const value = attribute.value.trim();
        if (attribute.name === 'xmlns' && value === SVG_NS) continue;
        if (attribute.name === 'xmlns:xlink' && value === XLINK_NS) continue;
        if (key === 'href' && (!attribute.namespaceURI || attribute.namespaceURI === XLINK_NS)) {
          if (!['use', 'linearGradient', 'radialGradient', 'pattern'].includes(element.localName) || value[0] !== '#' || !LOCAL_ID.test(value.slice(1))) fail('SVGの参照はファイル内の図形IDだけに対応しています。');
          references.push({ element, id: value.slice(1) });
          continue;
        }
        if (attribute.namespaceURI || !SVG_ATTRIBUTES.has(key) || /^on/i.test(key)) fail('SVGに未対応の属性があります。通常の図形として書き出してください。');
        if (/[\\@]|\/\*|[<>]|(?:javascript|data|https?|file):|expression\s*\(/i.test(value)) fail('SVGに外部参照または未対応の指定が含まれています。');
        if (/url\s*\(/i.test(value)) {
          const match = /^url\(\s*#([A-Za-z_][A-Za-z0-9_.:-]{0,127})\s*\)$/.exec(value);
          if (!match || !['fill', 'stroke', 'clip-path', 'mask', 'filter'].includes(key)) fail('SVGの塗りやマスクはファイル内のIDだけに対応しています。');
          references.push({ element, id: match[1] });
        }
        if (key === 'id') {
          if (!LOCAL_ID.test(value) || ids.has(value)) fail('SVGの図形IDが不正または重複しています。');
          ids.set(value, element);
        }
      }
    }
    for (const reference of references) {
      if (!ids.has(reference.id)) fail('SVGの参照先の図形が見つかりません。');
    }
    // Prevent recursive local references and exponentially expanding use trees.
    const links = new Map();
    for (const reference of references) {
      const list = links.get(reference.element) || [];
      list.push(ids.get(reference.id));
      links.set(reference.element, list);
    }
    let visits = 0;
    function walk(element, ancestry, depth) {
      if (depth > 64 || ++visits > 50000 || ancestry.has(element)) fail('SVGの参照や階層が複雑すぎます。図形を展開して書き出してください。');
      const next = new Set(ancestry);
      next.add(element);
      for (const child of [...element.children, ...(links.get(element) || [])]) walk(child, next, depth + 1);
    }
    walk(root, new Set(), 0);
    const viewBox = root.getAttribute('viewBox');
    let box = null;
    if (viewBox) {
      box = viewBox.trim().split(/[\s,]+/).map(Number);
      if (box.length !== 4 || box.some((number) => !Number.isFinite(number) || Math.abs(number) > 10000000)) fail('SVGのviewBoxが正しくありません。');
      sourceDimensions(box[2], box[3]);
    }
    let width = svgLength(root.getAttribute('width'));
    let height = svgLength(root.getAttribute('height'));
    if (width === null && box) width = box[2];
    if (height === null && box) height = box[3];
    sourceDimensions(width, height);
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height));
    return new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' });
  }

  async function loadImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => { image.src = ''; reject(new Error('画像の読み込みがタイムアウトしました。')); }, 20000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('画像を読み込めません。ファイルが破損していないか確認してください。')); };
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function canvas(width, height) {
    const result = document.createElement('canvas');
    result.width = width;
    result.height = height;
    const context = result.getContext('2d', { willReadFrequently: true });
    if (!context) fail('このブラウザでは画像を変換できません。');
    return { element: result, context };
  }

  async function convert(file, { kind, removeWhite = false } = {}) {
    if (!['pattern', 'emblem'].includes(kind)) fail('パターンまたはエンブレムを選択してください。');
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number' || file.size <= 0) fail('画像ファイルを選択してください。');
    if (file.size > SOURCE_LIMIT) fail('元画像は15MB以内にしてください。');
    if (typeof removeWhite !== 'boolean') fail('白背景の設定が正しくありません。');
    const extension = /\.([a-z0-9]+)$/i.exec(file.name || '')?.[1].toLowerCase();
    const mime = String(file.type || '').toLowerCase().split(';')[0];
    let blob;
    if (extension === 'svg' || mime === 'image/svg+xml') {
      blob = sanitizeSvg(await file.text());
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!png && !jpeg) fail('PNG・JPEG・SVG形式の画像を選択してください。');
      rasterDimensions(bytes, png);
      blob = new Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' });
    }
    const image = await loadImage(blob);
    sourceDimensions(image.naturalWidth, image.naturalHeight);
    const maximum = kind === 'emblem' ? 1024 : 2048;
    const ratio = Math.min(1, maximum / image.naturalWidth, maximum / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const surface = canvas(width, height);
    surface.context.imageSmoothingEnabled = true;
    surface.context.imageSmoothingQuality = 'high';
    surface.context.drawImage(image, 0, 0, width, height);
    let output = surface.element;
    if (kind === 'emblem') {
      const pixels = surface.context.getImageData(0, 0, width, height);
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          const rgba = pixels.data;
          if (removeWhite && rgba[index + 3]) {
            // Only neutral, near-white pixels fade. Preserve existing alpha.
            const low = Math.min(rgba[index], rgba[index + 1], rgba[index + 2]);
            const high = Math.max(rgba[index], rgba[index + 1], rgba[index + 2]);
            if (low > 235 && high - low < 12) {
              const keep = Math.max(0, Math.min(1, (250 - low) / 15));
              rgba[index + 3] = Math.round(rgba[index + 3] * keep);
            }
          }
          if (rgba[index + 3] > 0) {
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) fail('画像に表示できる部分がありません。白背景の除去をオフにするか別の画像を選択してください。');
      if (removeWhite) surface.context.putImageData(pixels, 0, 0);
      const cropped = canvas(right - left + 1, bottom - top + 1);
      cropped.context.drawImage(surface.element, left, top, cropped.element.width, cropped.element.height, 0, 0, cropped.element.width, cropped.element.height);
      output = cropped.element;
    }
    const dataUrl = output.toDataURL('image/png');
    readPng(dataUrl, kind);
    return {
      dataUrl, width: output.width, height: output.height,
      sourceName: String(file.name || 'image').split(/[\\/]/).pop().replace(/[<>\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 255),
      sourceBytes: file.size
    };
  }

  return Object.freeze({convert});
})();
export default UniformImageConverter;
