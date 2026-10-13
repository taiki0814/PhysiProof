/* Small, dependency-free vector drafting workspace for administrator assets. */
const UniformDrawingStudio = (() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const FORMAT = 'uniform-studio-drawing';
  const draftKey = () => 'physiproof-uniform-drawing-v1-'+(localStorage.getItem('physiproof_test_uid') || 'anonymous')+'-';
  const MAX_JSON = 2 * 1024 * 1024;
  const MAX_LAYERS = 100;
  const MAX_POINTS = 20000;
  const TOOL_NAMES = {
    select: '選択', rect: '長方形', ellipse: '円・楕円', shield: 'シールド', triangle: '三角形',
    star: '星', line: '線', pen: 'フリーペン',
  };
  const TEMPLATES = {
    'pattern-body': { kind: 'pattern', label: '身頃パターン', width: 244, height: 480, placement: 'body' },
    'pattern-all': { kind: 'pattern', label: '全面パターン', width: 432, height: 480, placement: 'all' },
    'pattern-repeat': { kind: 'pattern', label: '繰り返しパターン', width: 400, height: 400, placement: 'repeat' },
    'emblem-shield': { kind: 'emblem', label: 'エンブレム・盾ガイド', width: 400, height: 400, placement: 'body' },
    'emblem-circle': { kind: 'emblem', label: 'エンブレム・円ガイド', width: 400, height: 400, placement: 'body' },
    'emblem-blank': { kind: 'emblem', label: 'エンブレム・自由制作', width: 400, height: 400, placement: 'body' },
  };
  const GARMENT_OUTER = 'M248 77 C226 79 201 88 180 101 C151 120 117 147 90 170 Q85 174 89 182 L126 250 Q130 257 136 254 L181 228 C187 275 184 311 183 346 C181 411 181 478 177 548 Q177 553 183 554 Q300 569 417 554 Q423 553 423 548 C419 478 419 411 417 346 C416 311 413 275 419 228 L464 254 Q470 257 474 250 L511 182 Q515 174 510 170 C483 147 449 120 420 101 C399 88 374 79 352 77 C346 103 328 124 300 127 C272 124 254 103 248 77Z';
  const BODY_OUTER = 'M248 77 C226 79 202 88 182 102 C179 129 181 155 188 181 Q194 207 181 228 C187 275 184 311 183 346 C181 411 181 478 177 548 Q177 553 183 554 Q300 569 417 554 Q423 553 423 548 C419 478 419 411 417 346 C416 311 413 275 419 228 Q406 207 412 181 C419 155 421 129 418 102 C398 88 374 79 352 77 C346 103 328 124 300 127 C272 124 254 103 248 77Z';
  let serial = 0;
  let dialog;
  let refs;
  let state;
  let observer;
  let gesture = null;
  let propertyBefore = null;
  let resizeFrame = null;
  let disabledBefore = [];

  const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[character]));
  const bounded = (value, min, max) => Math.max(min, Math.min(max, value));
  const rounded = (value) => Math.round(value * 1000) / 1000;
  const selected = () => state.document.layers.find((layer) => layer.id === state.selection);
  const snapshot = () => JSON.stringify(state.document);
  const dirty = () => snapshot() !== state.saved;
  const element = (name) => dialog.querySelector(`[data-ud="${name}"]`);
  const announce = (message, error = false) => {
    refs.status.textContent = message;
    refs.status.dataset.error = String(error);
  };

  function freshDocument(template) {
    const definition = TEMPLATES[template];
    return {
      kind: definition.kind, template, name: definition.kind === 'pattern' ? '新しいパターン' : '新しいエンブレム',
      width: definition.width, height: definition.height, layers: [],
    };
  }

  function layerId() {
    return `layer-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++serial}`}`;
  }

  function documentPackage() {
    return { format: FORMAT, version: 1, document: state.document };
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function assertKeys(value, allowed) {
    if (!isPlainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error('編集データに未対応の項目が含まれています。');
    }
  }

  function checkedText(value, maximum, label) {
    if (typeof value !== 'string' || !value.trim() || Array.from(value).length > maximum ||
        /[<>\u0000-\u001f\u007f-\u009f]/.test(value)) {
      throw new Error(`${label}は${maximum}文字以内の通常の文字で入力してください。`);
    }
    return value.trim();
  }

  function checkedNumber(value, minimum, maximum, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`${label}が正しくありません。`);
    }
    return value;
  }

  function checkedColor(value) {
    if (value !== 'none' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) {
      throw new Error('図形の色が正しくありません。');
    }
    return value;
  }

  function validatePackage(value) {
    assertKeys(value, ['format', 'version', 'document']);
    if (value.format !== FORMAT || value.version !== 1) throw new Error('この制作スペースで保存した編集データJSONを選択してください。');
    const document = value.document;
    assertKeys(document, ['kind', 'template', 'name', 'width', 'height', 'layers']);
    if (!Object.hasOwn(TEMPLATES, document.template)) throw new Error('テンプレートが正しくありません。');
    const template = TEMPLATES[document.template];
    if (document.kind !== template.kind || document.width !== template.width || document.height !== template.height) {
      throw new Error('テンプレートとアートボードのサイズが一致しません。');
    }
    if (!Array.isArray(document.layers) || document.layers.length > MAX_LAYERS) throw new Error(`図形は最大${MAX_LAYERS}個までです。`);
    const ids = new Set();
    let pointCount = 0;
    const layers = document.layers.map((layer) => {
      assertKeys(layer, ['id', 'type', 'name', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'opacity', 'points']);
      if (typeof layer.id !== 'string' || !/^layer-[a-zA-Z0-9-]{1,80}$/.test(layer.id) || ids.has(layer.id)) throw new Error('レイヤーIDが不正または重複しています。');
      ids.add(layer.id);
      if (!Object.hasOwn(TOOL_NAMES, layer.type) || layer.type === 'select') throw new Error('未対応の図形が含まれています。');
      const result = {
        id: layer.id, type: layer.type, name: checkedText(layer.name, 50, 'レイヤー名'),
        x: checkedNumber(layer.x, -4000, 4000, '図形のX座標'),
        y: checkedNumber(layer.y, -4000, 4000, '図形のY座標'),
        width: checkedNumber(layer.width, 1, 4000, '図形の幅'),
        height: checkedNumber(layer.height, 1, 4000, '図形の高さ'),
        fill: checkedColor(layer.fill), stroke: checkedColor(layer.stroke),
        strokeWidth: checkedNumber(layer.strokeWidth, 0, 40, '線幅'),
        opacity: checkedNumber(layer.opacity, 0, 1, '不透明度'),
      };
      if (layer.type === 'pen' || layer.type === 'line') {
        if (!Array.isArray(layer.points) || layer.points.length < 2 || layer.points.length > 2048 ||
            (layer.type === 'line' && layer.points.length !== 2)) throw new Error('線の座標データが正しくありません。');
        pointCount += layer.points.length;
        if (pointCount > MAX_POINTS) throw new Error('図形の点が多すぎます。描線を減らしてください。');
        result.points = layer.points.map((point) => {
          if (!Array.isArray(point) || point.length !== 2) throw new Error('線の座標データが正しくありません。');
          return [checkedNumber(point[0], 0, 1, '線のX座標'), checkedNumber(point[1], 0, 1, '線のY座標')];
        });
        if (result.fill !== 'none') throw new Error('線とフリーペンの塗りは「なし」にしてください。');
      } else if (layer.points !== undefined) {
        throw new Error('図形に未対応の座標データが含まれています。');
      }
      return result;
    });
    return {
      kind: template.kind, template: document.template, name: checkedText(document.name, 60, '素材名'),
      width: template.width, height: template.height, layers,
    };
  }

  function parseDocument(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_JSON) throw new Error('編集データは2MB以内にしてください。');
    let value;
    try { value = JSON.parse(text); } catch (_) { throw new Error('JSONファイルを読み込めません。'); }
    return validatePackage(value);
  }

  function validateSource(value) {
    let text;
    try { text = JSON.stringify(value); } catch (_) { throw new Error('編集データを読み込めません。'); }
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_JSON) throw new Error('編集データは2MB以内にしてください。');
    return { format: FORMAT, version: 1, document: validatePackage(value) };
  }

  function commit(before) {
    if (!before || before === snapshot()) return;
    state.past.push(before);
    while (state.past.length > 40 || state.past.reduce((sum, item) => sum + item.length, 0) > 8 * 1024 * 1024) state.past.shift();
    state.future = [];
    updateControls();
  }

  function finishProperty() {
    if (propertyBefore !== null) {
      const before = propertyBefore;
      propertyBefore = null;
      commit(before);
    }
  }

  function changeDocument(action) {
    finishProperty();
    const before = snapshot();
    action();
    commit(before);
    render();
  }

  function restoreHistory(direction) {
    finishProperty();
    const from = direction === 'undo' ? state.past : state.future;
    const to = direction === 'undo' ? state.future : state.past;
    if (!from.length) return;
    to.push(snapshot());
    state.document = JSON.parse(from.pop());
    if (!selected()) state.selection = null;
    render();
    announce(direction === 'undo' ? 'ひとつ前の編集に戻しました。' : '編集をやり直しました。');
  }

  function shapeMarkup(layer) {
    const width = rounded(layer.width);
    const height = rounded(layer.height);
    let shape;
    if (layer.type === 'rect') shape = `<rect width="${width}" height="${height}"/>`;
    if (layer.type === 'ellipse') shape = `<ellipse cx="${rounded(width / 2)}" cy="${rounded(height / 2)}" rx="${rounded(width / 2)}" ry="${rounded(height / 2)}"/>`;
    if (layer.type === 'triangle') shape = `<polygon points="${rounded(width / 2)},0 ${width},${height} 0,${height}"/>`;
    if (layer.type === 'shield') {
      shape = `<path d="M${rounded(width / 2)} 0 L${width} ${rounded(height * .15)} V${rounded(height * .52)} C${width} ${rounded(height * .77)} ${rounded(width * .72)} ${rounded(height * .92)} ${rounded(width / 2)} ${height} C${rounded(width * .28)} ${rounded(height * .92)} 0 ${rounded(height * .77)} 0 ${rounded(height * .52)} V${rounded(height * .15)}Z"/>`;
    }
    if (layer.type === 'star') {
      const points = Array.from({ length: 10 }, (_, index) => {
        const angle = index * Math.PI / 5 - Math.PI / 2;
        const radius = index % 2 ? .22 : .5;
        return `${rounded(width * (.5 + Math.cos(angle) * radius))},${rounded(height * (.5 + Math.sin(angle) * radius))}`;
      });
      shape = `<polygon points="${points.join(' ')}"/>`;
    }
    if (layer.type === 'line' || layer.type === 'pen') {
      const points = layer.points.map((point, index) => `${index ? 'L' : 'M'}${rounded(point[0] * width)} ${rounded(point[1] * height)}`).join(' ');
      shape = `<path d="${points}"/>`;
    }
    return `<g transform="translate(${rounded(layer.x)} ${rounded(layer.y)})" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${layer.opacity}">${shape}</g>`;
  }

  function exportSvg(forMaterial = false) {
    const document = validatePackage(documentPackage());
    const density = forMaterial ? (document.kind === 'pattern' ? 4 : 2.56) : 1;
    return `<svg xmlns="${SVG_NS}" width="${Math.round(document.width * density)}" height="${Math.round(document.height * density)}" viewBox="0 0 ${document.width} ${document.height}"><title>${escapeXml(document.name)}</title>${document.layers.map(shapeMarkup).join('')}</svg>`;
  }

  function guideMarkup() {
    const document = state.document;
    let outline = '';
    if (document.template === 'pattern-body') outline = `<path d="${BODY_OUTER}" transform="translate(-178 -77)"/>`;
    if (document.template === 'pattern-all') outline = `<path d="${GARMENT_OUTER}" transform="translate(-84 -77)"/>`;
    if (document.template === 'emblem-circle') outline = '<circle cx="200" cy="200" r="150"/>';
    if (document.template === 'emblem-shield') outline = '<path d="M200 45 335 94V213C335 283 258 337 200 367 142 337 65 283 65 213V94Z"/>';
    return `<g fill="none" stroke="#64748b" stroke-width="1" stroke-opacity=".5" pointer-events="none">${outline}<path d="M${document.width / 2} 0V${document.height} M0 ${document.height / 2}H${document.width}" stroke-dasharray="5 5" stroke-opacity=".36"/></g>`;
  }

  function selectionMarkup() {
    const layer = selected();
    if (!layer || state.tool !== 'select') return '';
    const handle = 8 / Math.max(state.pixelsPerUnit, .25);
    const stroke = 1.3 / Math.max(state.pixelsPerUnit, .25);
    const corners = { nw: [layer.x, layer.y], ne: [layer.x + layer.width, layer.y], sw: [layer.x, layer.y + layer.height], se: [layer.x + layer.width, layer.y + layer.height] };
    return `<g fill="none" stroke="#2563eb" stroke-width="${stroke}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" pointer-events="none"/>${Object.entries(corners).map(([corner, point]) => `<rect data-ud-handle="${corner}" x="${point[0] - handle / 2}" y="${point[1] - handle / 2}" width="${handle}" height="${handle}" fill="#fff" pointer-events="all" style="cursor:${corner}-resize"/>`).join('')}</g>`;
  }

  function renderCanvas() {
    const document = state.document;
    refs.canvas.setAttribute('viewBox', `0 0 ${document.width} ${document.height}`);
    refs.canvas.setAttribute('aria-label', `${TEMPLATES[document.template].label}、${document.width} × ${document.height}の制作スペース`);
    refs.canvas.style.cursor = state.tool === 'select' ? 'default' : 'crosshair';
    const grid = state.grid ? `<defs><pattern id="${state.prefix}-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#94a3b8" stroke-width=".45" stroke-opacity=".35"/></pattern></defs><rect width="${document.width}" height="${document.height}" fill="url(#${state.prefix}-grid)" pointer-events="none"/>` : '';
    refs.canvas.innerHTML = `${grid}${document.layers.map((layer) => `<g data-ud-layer="${layer.id}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" fill="transparent" pointer-events="all"/>${shapeMarkup(layer)}</g>`).join('')}${guideMarkup()}${selectionMarkup()}`;
  }

  function syncSize() {
    if (!dialog?.open || !state) return;
    const availableWidth = Math.max(100, refs.stage.clientWidth - 56);
    const availableHeight = Math.max(180, refs.stage.clientHeight - 56);
    const fit = Math.min(availableWidth / state.document.width, availableHeight / state.document.height, 1.6);
    state.pixelsPerUnit = fit * state.zoom;
    refs.canvas.style.width = `${rounded(state.document.width * state.pixelsPerUnit)}px`;
    refs.canvas.style.height = `${rounded(state.document.height * state.pixelsPerUnit)}px`;
    refs.zoom.textContent = `${Math.round(state.zoom * 100)}%`;
    renderCanvas();
  }

  function renderLayers() {
    const layers = [...state.document.layers].reverse();
    refs.layers.innerHTML = layers.length ? layers.map((layer) => `<button type="button" class="ud-layer" data-ud-select-layer="${layer.id}" role="option" aria-selected="${layer.id === state.selection}"><span class="ud-layer-icon" aria-hidden="true">${{ rect: '▭', ellipse: '○', shield: '♢', triangle: '△', star: '☆', line: '╱', pen: '∿' }[layer.type]}</span><span class="ud-layer-name">${escapeXml(layer.name)}</span></button>`).join('') : '<p class="ud-empty">左のツールを選び、アートボードをドラッグして図形を描きます。</p>';
    refs.layerCount.textContent = `${layers.length} / ${MAX_LAYERS}`;
  }

  function syncProperties() {
    const layer = selected();
    const style = layer || state.style;
    const isLine = layer ? ['line', 'pen'].includes(layer.type) : ['line', 'pen'].includes(state.tool);
    refs.selectionName.textContent = layer ? layer.name : '新しい図形の設定';
    for (const key of ['x', 'y', 'width', 'height']) {
      const input = element(key);
      input.disabled = !layer;
      input.value = layer ? rounded(layer[key]) : '';
    }
    refs.fill.value = style.fill === 'none' ? state.lastFill : style.fill;
    refs.noFill.checked = isLine || style.fill === 'none';
    refs.noFill.disabled = isLine;
    refs.fill.disabled = isLine || refs.noFill.checked;
    refs.stroke.value = style.stroke === 'none' ? state.lastStroke : style.stroke;
    refs.noStroke.checked = style.stroke === 'none';
    refs.stroke.disabled = refs.noStroke.checked;
    refs.strokeWidth.value = style.strokeWidth;
    refs.opacity.value = Math.round(style.opacity * 100);
    refs.opacityValue.textContent = `${Math.round(style.opacity * 100)}%`;
    refs.layerName.value = layer?.name || '';
    refs.layerName.disabled = !layer;
  }

  function updateControls() {
    element('undo').disabled = state.past.length === 0;
    element('redo').disabled = state.future.length === 0;
    for (const action of ['duplicate', 'delete', 'forward', 'backward']) element(action).disabled = !selected();
    const index = state.document.layers.findIndex((layer) => layer.id === state.selection);
    element('forward').disabled = index < 0 || index >= state.document.layers.length - 1;
    element('backward').disabled = index <= 0;
    refs.draftState.textContent = dirty() ? '未保存の編集あり' : '編集データを保存済み';
    refs.grid.checked = state.grid;
    refs.snap.checked = state.snap;
    dialog.querySelectorAll('[data-ud-tool]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.udTool === state.tool)));
    refs.dimensions.textContent = `${state.document.width} × ${state.document.height}`;
    refs.template.value = state.document.template;
    refs.name.value = state.document.name;
    try { refs.resume.disabled = !localStorage.getItem(draftKey() + state.document.kind); }
    catch (_) { refs.resume.disabled = false; }
  }

  function render() {
    renderCanvas();
    renderLayers();
    syncProperties();
    updateControls();
  }

  function chooseTool(tool) {
    finishProperty();
    if (tool !== 'select') {
      const layer = selected();
      if (layer) state.style = { fill: layer.fill, stroke: layer.stroke, strokeWidth: layer.strokeWidth, opacity: layer.opacity };
      state.selection = null;
    }
    state.tool = tool;
    syncProperties();
    updateControls();
    renderCanvas();
    renderLayers();
    announce(tool === 'select' ? '図形をドラッグして移動、四隅のハンドルでサイズを変更できます。' : `${TOOL_NAMES[tool]}：アートボードをドラッグして描きます。${tool === 'pen' ? '' : 'Shiftを押すと縦横比を固定できます。'}`);
  }

  function canvasPoint(event) {
    const matrix = refs.canvas.getScreenCTM();
    if (!matrix) return null;
    const point = refs.canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const result = point.matrixTransform(matrix.inverse());
    return { x: bounded(result.x, -4000, 4000), y: bounded(result.y, -4000, 4000) };
  }

  function snap(value) { return state.snap ? Math.round(value / 10) * 10 : rounded(value); }

  function newLayer(type, point) {
    const line = type === 'line' || type === 'pen';
    const layer = {
      id: layerId(), type, name: `${TOOL_NAMES[type]} ${state.document.layers.length + 1}`,
      x: point.x, y: point.y, width: 1, height: 1,
      fill: line ? 'none' : state.style.fill,
      stroke: line && state.style.stroke === 'none' ? state.lastStroke : state.style.stroke,
      strokeWidth: line ? Math.max(1, state.style.strokeWidth || 2) : state.style.strokeWidth,
      opacity: state.style.opacity,
    };
    if (line) layer.points = [[0, 0], [0, 0]];
    return layer;
  }

  function beginPointer(event) {
    if (state.busy || event.button !== 0 || gesture) return;
    const point = canvasPoint(event);
    if (!point) return;
    finishProperty();
    event.preventDefault();
    refs.canvas.focus({ preventScroll: true });
    const before = snapshot();
    const handle = event.target.closest('[data-ud-handle]');
    if (state.tool === 'select') {
      const target = event.target.closest('[data-ud-layer]');
      if (!handle) state.selection = target?.dataset.udLayer || null;
      const layer = selected();
      if (!layer) { render(); return; }
      gesture = { type: handle ? 'resize' : 'move', handle: handle?.dataset.udHandle, start: point, before, original: { ...layer }, pointerId: event.pointerId };
    } else {
      if (state.document.layers.length >= MAX_LAYERS) { announce(`図形は最大${MAX_LAYERS}個までです。`, true); return; }
      const pointCount = state.document.layers.reduce((sum, layer) => sum + (layer.points?.length || 0), 0);
      if (pointCount >= MAX_POINTS - 2) { announce('図形の点が多すぎます。不要な描線を削除してください。', true); return; }
      const start = { x: snap(point.x), y: snap(point.y) };
      const layer = newLayer(state.tool, start);
      state.document.layers.push(layer);
      state.selection = layer.id;
      gesture = { type: 'draw', tool: state.tool, start, before, rawPoints: [start], pointBudget: Math.min(2048, MAX_POINTS - pointCount), pointerId: event.pointerId };
    }
    refs.canvas.setPointerCapture(event.pointerId);
    render();
  }

  function updateDrawing(layer, point, shift) {
    const start = gesture.start;
    if (gesture.tool === 'pen') {
      const last = gesture.rawPoints.at(-1);
      if (Math.hypot(point.x - last.x, point.y - last.y) > 1.2 && gesture.rawPoints.length < gesture.pointBudget) gesture.rawPoints.push(point);
      const points = gesture.rawPoints;
      layer.x = Math.min(...points.map((item) => item.x));
      layer.y = Math.min(...points.map((item) => item.y));
      layer.width = Math.max(1, Math.max(...points.map((item) => item.x)) - layer.x);
      layer.height = Math.max(1, Math.max(...points.map((item) => item.y)) - layer.y);
      layer.points = points.map((item) => [bounded((item.x - layer.x) / layer.width, 0, 1), bounded((item.y - layer.y) / layer.height, 0, 1)]);
      if (layer.points.length === 1) layer.points.push([...layer.points[0]]);
      return;
    }
    let dx = point.x - start.x;
    let dy = point.y - start.y;
    if (shift) {
      if (gesture.tool === 'line') {
        const length = Math.hypot(dx, dy);
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
        dx = Math.cos(angle) * length;
        dy = Math.sin(angle) * length;
      } else {
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * size;
        dy = Math.sign(dy || 1) * size;
      }
    }
    layer.x = Math.min(start.x, start.x + dx);
    layer.y = Math.min(start.y, start.y + dy);
    layer.width = bounded(Math.abs(dx), 1, 4000);
    layer.height = bounded(Math.abs(dy), 1, 4000);
    if (gesture.tool === 'line') {
      const startX = dx < 0 ? 1 : 0;
      const startY = dy < 0 ? 1 : 0;
      layer.points = [[startX, startY], [Math.abs(dx) < .001 ? startX : 1 - startX, Math.abs(dy) < .001 ? startY : 1 - startY]];
    }
  }

  function updateResize(layer, point, shift) {
    const original = gesture.original;
    const west = gesture.handle.includes('w');
    const north = gesture.handle.includes('n');
    const anchorX = west ? original.x + original.width : original.x;
    const anchorY = north ? original.y + original.height : original.y;
    let width = bounded(west ? anchorX - point.x : point.x - anchorX, 1, 4000);
    let height = bounded(north ? anchorY - point.y : point.y - anchorY, 1, 4000);
    if (shift) {
      const ratio = original.width / original.height;
      if (width / height > ratio) height = bounded(width / ratio, 1, 4000);
      else width = bounded(height * ratio, 1, 4000);
    }
    layer.x = bounded(west ? anchorX - width : anchorX, -4000, 4000);
    layer.y = bounded(north ? anchorY - height : anchorY, -4000, 4000);
    layer.width = width;
    layer.height = height;
  }

  function movePointer(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || state.busy) return;
    const position = canvasPoint(event);
    const layer = selected();
    if (!position || !layer) return;
    event.preventDefault();
    const point = { x: snap(position.x), y: snap(position.y) };
    if (gesture.type === 'move') {
      layer.x = bounded(snap(gesture.original.x + position.x - gesture.start.x), -4000, 4000);
      layer.y = bounded(snap(gesture.original.y + position.y - gesture.start.y), -4000, 4000);
    } else if (gesture.type === 'resize') updateResize(layer, point, event.shiftKey);
    else {
      // Keep new paths inside a bounded working area, including pointer capture
      // outside the canvas, so their geometry always fits the source format.
      const limitX = state.document.width + 400;
      const limitY = state.document.height + 400;
      updateDrawing(layer, { x: bounded(point.x, -400, limitX), y: bounded(point.y, -400, limitY) }, event.shiftKey);
    }
    renderCanvas();
    syncProperties();
  }

  function endPointer(event, cancel = false) {
    if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
    const current = gesture;
    gesture = null;
    if (refs.canvas.hasPointerCapture(current.pointerId)) refs.canvas.releasePointerCapture(current.pointerId);
    const layer = selected();
    const tooSmall = current.type === 'draw' && layer && layer.width < 3 && layer.height < 3;
    if (cancel || tooSmall) {
      state.document = JSON.parse(current.before);
      if (!selected()) state.selection = null;
    } else {
      commit(current.before);
      if (current.type === 'draw') state.tool = 'select';
    }
    render();
  }

  function editProperty(event) {
    if (state.busy) return;
    const key = event.target.dataset.ud;
    const layer = selected();
    if (propertyBefore === null) propertyBefore = snapshot();
    try {
      if (key === 'name') state.document.name = event.target.value;
      else if (key === 'layerName') { if (layer) layer.name = event.target.value; }
      else if (['x', 'y', 'width', 'height'].includes(key)) {
        if (layer && event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) {
          layer[key] = bounded(event.target.valueAsNumber, ['x', 'y'].includes(key) ? -4000 : 1, 4000);
        }
      } else {
        const target = layer || state.style;
        if (key === 'fill') { target.fill = event.target.value; state.lastFill = target.fill; }
        if (key === 'noFill') target.fill = refs.noFill.checked ? 'none' : state.lastFill;
        if (key === 'stroke') { target.stroke = event.target.value; state.lastStroke = target.stroke; }
        if (key === 'noStroke') {
          target.stroke = refs.noStroke.checked ? 'none' : state.lastStroke;
          if (!refs.noStroke.checked && target.strokeWidth === 0) target.strokeWidth = 2;
        }
        if (key === 'strokeWidth' && event.target.value !== '') target.strokeWidth = bounded(event.target.valueAsNumber || 0, 0, 40);
        if (key === 'opacity') target.opacity = bounded(event.target.valueAsNumber / 100, 0, 1);
        state.style = { fill: target.fill, stroke: target.stroke, strokeWidth: target.strokeWidth, opacity: target.opacity };
      }
      renderCanvas();
      if (key === 'layerName') renderLayers();
      if (key === 'opacity') refs.opacityValue.textContent = `${event.target.value}%`;
      if (['noFill', 'noStroke'].includes(key)) syncProperties();
      refs.draftState.textContent = dirty() ? '未保存の編集あり' : '編集データを保存済み';
      if (event.type === 'change') {
        if (key === 'name') state.document.name = checkedText(state.document.name, 60, '素材名');
        if (key === 'layerName' && layer) layer.name = checkedText(layer.name, 50, 'レイヤー名');
        finishProperty();
        render();
      }
    } catch (error) {
      if (propertyBefore !== null) state.document = JSON.parse(propertyBefore);
      propertyBefore = null;
      render();
      announce(error.message, true);
    }
  }

  function duplicateLayer() {
    const layer = selected();
    if (!layer) return;
    if (state.document.layers.length >= MAX_LAYERS) { announce(`図形は最大${MAX_LAYERS}個までです。`, true); return; }
    const total = state.document.layers.reduce((sum, item) => sum + (item.points?.length || 0), 0);
    if (total + (layer.points?.length || 0) > MAX_POINTS) { announce('図形の点が多すぎます。不要な描線を削除してください。', true); return; }
    changeDocument(() => {
      const duplicate = { ...JSON.parse(JSON.stringify(layer)), id: layerId(), name: `${Array.from(layer.name).slice(0, 46).join('')} コピー`, x: bounded(layer.x + 12, -4000, 4000), y: bounded(layer.y + 12, -4000, 4000) };
      state.document.layers.splice(state.document.layers.indexOf(layer) + 1, 0, duplicate);
      state.selection = duplicate.id;
    });
  }

  function deleteLayer() {
    if (!selected()) return;
    changeDocument(() => {
      state.document.layers = state.document.layers.filter((layer) => layer.id !== state.selection);
      state.selection = null;
    });
  }

  function reorderLayer(offset) {
    const index = state.document.layers.findIndex((layer) => layer.id === state.selection);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= state.document.layers.length) return;
    changeDocument(() => {
      const [layer] = state.document.layers.splice(index, 1);
      state.document.layers.splice(next, 0, layer);
    });
  }

  function replaceDocument(document, saved) {
    state.document = document;
    state.selection = null;
    state.past = [];
    state.future = [];
    state.tool = 'select';
    state.zoom = 1;
    state.saved = saved ? snapshot() : '';
    propertyBefore = null;
    render();
    syncSize();
  }

  function mayReplace(message) {
    finishProperty();
    return !dirty() || window.confirm(message);
  }

  function startTemplate() {
    const template = refs.template.value;
    if (!mayReplace('保存していない編集があります。破棄して新しい下書きを始めますか？')) {
      refs.template.value = state.document.template;
      return;
    }
    replaceDocument(freshDocument(template), true);
    announce(`${TEMPLATES[template].label}で新しい下書きを始めました。`);
  }

  function saveDraft() {
    finishProperty();
    try {
      const document = validatePackage(documentPackage());
      const text = JSON.stringify({ format: FORMAT, version: 1, document });
      if (text.length > MAX_JSON) throw new Error('編集データが大きすぎます。不要な描線を削除してください。');
      localStorage.setItem(draftKey() + document.kind, text);
      state.saved = snapshot();
      updateControls();
      announce('このブラウザに下書きを保存しました。別のPCへ渡す場合は「編集JSON」を保存してください。');
    } catch (error) {
      announce(error.name === 'QuotaExceededError' || error.name === 'SecurityError' ? 'ブラウザに保存できません。「編集JSON」でファイルに保存してください。' : error.message, true);
    }
  }

  function resumeDraft() {
    try {
      const text = localStorage.getItem(draftKey() + state.document.kind);
      if (!text) { announce('このブラウザに保存された下書きがありません。'); return; }
      const document = parseDocument(text);
      if (document.kind !== state.document.kind) throw new Error('下書きの種類が一致しません。');
      if (!mayReplace('保存していない編集を破棄して、保存した下書きを開きますか？')) return;
      replaceDocument(document, true);
      announce('このブラウザに保存した下書きを開きました。');
    } catch (error) { announce(error.message || '下書きを読み込めませんでした。', true); }
  }

  function safeFilename() {
    return state.document.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || 'uniform-asset';
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    dialog.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function downloadDocument() {
    finishProperty();
    try {
      const document = validatePackage(documentPackage());
      download(new Blob([JSON.stringify({ format: FORMAT, version: 1, document }, null, 2)], { type: 'application/json' }), `${safeFilename()}.drawing.json`);
      state.saved = snapshot();
      updateControls();
      announce('編集データの保存を開始しました。このJSONからレイヤーを再編集できます。');
    } catch (error) { announce(error.message, true); }
  }

  function downloadSvg() {
    finishProperty();
    try {
      download(new Blob([exportSvg()], { type: 'image/svg+xml' }), `${safeFilename()}.svg`);
      announce('透明背景のSVGの保存を開始しました。ガイド・グリッドは含まれません。');
    } catch (error) { announce(error.message, true); }
  }

  async function importDocument(file) {
    if (!file || state.busy) return;
    setBusy(true);
    announce('編集データを読み込んでいます…');
    try {
      if (file.size > MAX_JSON) throw new Error('編集データは2MB以内にしてください。');
      const document = parseDocument(await file.text());
      if (document.kind !== state.document.kind) throw new Error(`${state.document.kind === 'pattern' ? 'パターン' : 'エンブレム'}の編集データを選択してください。`);
      if (!mayReplace('保存していない編集を破棄して、選んだ編集データを開きますか？')) return;
      replaceDocument(document, true);
      announce('編集データを読み込みました。図形を選んで再編集できます。');
    } catch (error) { announce(error.message, true); }
    finally { refs.import.value = ''; setBusy(false); syncProperties(); updateControls(); }
  }

  function setBusy(value) {
    state.busy = value;
    if (value) {
      disabledBefore = [...dialog.querySelectorAll('button,input,select')].map((control) => [control, control.disabled]);
      for (const [control] of disabledBefore) control.disabled = true;
    } else {
      for (const [control, disabled] of disabledBefore) control.disabled = disabled;
      disabledBefore = [];
    }
    refs.use.textContent = value ? '素材を準備しています…' : 'この下書きを素材にする';
  }

  async function useDrawing() {
    finishProperty();
    try {
      const visible = state.document.layers.some((layer) => layer.opacity > 0 &&
        (layer.fill !== 'none' || (layer.stroke !== 'none' && layer.strokeWidth > 0)) &&
        layer.x < state.document.width && layer.y < state.document.height && layer.x + layer.width > 0 && layer.y + layer.height > 0);
      if (!visible) throw new Error('アートボードに表示される図形を追加してください。');
      const svg = exportSvg(true);
      const file = new File([svg], `${safeFilename()}.svg`, { type: 'image/svg+xml' });
      setBusy(true);
      announce('図形を素材として読み込んでいます。');
      const source = validateSource(documentPackage());
      await state.onUse({ file, kind: state.document.kind, name: source.document.name, placement: TEMPLATES[state.document.template].placement, source });
      // Keep an editable local copy when storage is available; using the drawing
      // itself must still succeed when the browser cannot persist a draft.
      try { localStorage.setItem(draftKey() + state.document.kind, JSON.stringify(documentPackage())); } catch (_) { /* The editor JSON remains available as a separate export. */ }
      state.saved = snapshot();
      setBusy(false);
      dialog.close();
    } catch (error) {
      if (state.busy) setBusy(false);
      announce(error.message || '素材として読み込めませんでした。', true);
    }
  }

  function closeDrawing() {
    if (state.busy) { announce('素材の読み込みが完了するまでお待ちください。'); return; }
    if (gesture) endPointer(null, true);
    if (mayReplace('保存していない編集があります。下書きを保存せずに閉じますか？')) dialog.close();
  }

  function handleKey(event) {
    if (!dialog.open || state.busy || event.defaultPrevented) return;
    const typing = event.target.closest('input,select,textarea,[contenteditable="true"]');
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); saveDraft(); return; }
    if (typing) return;
    if (gesture) {
      if (event.key === 'Escape') { event.preventDefault(); endPointer(null, true); }
      return;
    }
    if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); restoreHistory(event.shiftKey ? 'redo' : 'undo'); }
    else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); restoreHistory('redo'); }
    else if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateLayer(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteLayer(); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selected()) {
      event.preventDefault();
      const step = event.shiftKey || state.snap ? 10 : 1;
      changeDocument(() => {
        const layer = selected();
        if (event.key === 'ArrowLeft') layer.x = bounded(layer.x - step, -4000, 4000);
        if (event.key === 'ArrowRight') layer.x = bounded(layer.x + step, -4000, 4000);
        if (event.key === 'ArrowUp') layer.y = bounded(layer.y - step, -4000, 4000);
        if (event.key === 'ArrowDown') layer.y = bounded(layer.y + step, -4000, 4000);
      });
    } else if (!modifier && !event.altKey) {
      const tool = { v: 'select', r: 'rect', e: 'ellipse', t: 'triangle', s: 'star', l: 'line', p: 'pen' }[event.key.toLowerCase()];
      if (tool) { event.preventDefault(); chooseTool(tool); }
    }
  }

  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'ud-dialog';
    dialog.setAttribute('aria-labelledby', 'ud-workspace-title');
    dialog.innerHTML = `
      <div class="ud-shell">
        <header class="ud-header"><div><p class="ud-eyebrow">ASSET DRAWING STUDIO</p><h2 class="ud-title" id="ud-workspace-title">素材の制作スペース</h2><p class="ud-description">図形を組み合わせて、パターンやエンブレムの下書きを作成します。</p></div><button type="button" class="ud-close" data-ud="close" aria-label="制作スペースを閉じる" title="閉じる">×</button></header>
        <div class="ud-toolbar">
          <label class="ud-field ud-name-field"><span>素材名</span><input data-ud="name" class="ud-input" maxlength="60" placeholder="素材の名前" autocomplete="off"></label>
          <label class="ud-field"><span>新規テンプレート</span><select data-ud="template" class="ud-select"></select></label>
          <button type="button" class="ud-button" data-ud="new">新しく作る</button>
          <span class="ud-separator" aria-hidden="true"></span>
          <button type="button" class="ud-button" data-ud="saveDraft" title="このブラウザに保存（Ctrl / ⌘ + S）">下書き保存</button>
          <button type="button" class="ud-button" data-ud="resume">下書きを開く</button>
          <button type="button" class="ud-button" data-ud="importButton">編集JSONを開く</button>
          <input type="file" data-ud="import" accept=".json,application/json" hidden>
        </div>
        <div class="ud-workspace">
          <nav class="ud-tools" aria-label="作図ツール">${Object.entries(TOOL_NAMES).map(([tool, label]) => `<button type="button" class="ud-tool" data-ud-tool="${tool}" aria-pressed="false" title="${label}"><span class="ud-tool-icon" aria-hidden="true">${{ select: '↖', rect: '▭', ellipse: '○', shield: '♢', triangle: '△', star: '☆', line: '╱', pen: '∿' }[tool]}</span><span class="ud-tool-label">${label}</span></button>`).join('')}</nav>
          <section class="ud-canvas-column" aria-label="アートボード">
            <div class="ud-canvas-toolbar"><div class="ud-history-controls"><button type="button" class="ud-button" data-ud="undo" title="元に戻す（Ctrl / ⌘ + Z）" aria-label="元に戻す">↶</button><button type="button" class="ud-button" data-ud="redo" title="やり直し（Ctrl / ⌘ + Shift + Z）" aria-label="やり直し">↷</button></div><span class="ud-dimensions" data-ud="dimensions"></span><label class="ud-checkbox"><input type="checkbox" data-ud="grid">グリッド</label><label class="ud-checkbox"><input type="checkbox" data-ud="snap">スナップ</label><div class="ud-zoom-controls"><button type="button" class="ud-button" data-ud="zoomOut" aria-label="縮小">−</button><span class="ud-zoom-value" data-ud="zoom">100%</span><button type="button" class="ud-button" data-ud="zoomIn" aria-label="拡大">＋</button><button type="button" class="ud-button" data-ud="fit" title="画面に合わせる">全体</button></div></div>
            <div class="ud-canvas-stage" data-ud="stage"><svg xmlns="${SVG_NS}" class="ud-artboard" data-ud="canvas" tabindex="0" role="img" style="touch-action:none;flex-shrink:0"></svg></div>
            <p class="ud-canvas-note">ガイドとグリッドは書き出されません。背景は透明です。Shift：比率固定 ／ 矢印キー：移動 ／ Delete：削除</p>
          </section>
          <aside class="ud-properties" aria-label="図形の設定とレイヤー">
            <section class="ud-section"><h3 class="ud-section-title" data-ud="selectionName">新しい図形の設定</h3>
              <label class="ud-field"><span>レイヤー名</span><input data-ud="layerName" class="ud-input" maxlength="50" autocomplete="off"></label>
              <div class="ud-property-grid">${[['x', 'X', -4000], ['y', 'Y', -4000], ['width', '幅', 1], ['height', '高さ', 1]].map(([key, label, minimum]) => `<label class="ud-field"><span>${label}</span><input class="ud-input" data-ud="${key}" type="number" min="${minimum}" max="4000" step="1"></label>`).join('')}</div>
              <div class="ud-property-grid"><div class="ud-field"><label for="ud-fill-color">塗り</label><div class="ud-color-row"><input id="ud-fill-color" type="color" data-ud="fill" value="#d9573b"><label class="ud-checkbox"><input type="checkbox" data-ud="noFill">なし</label></div></div><div class="ud-field"><label for="ud-stroke-color">線</label><div class="ud-color-row"><input id="ud-stroke-color" type="color" data-ud="stroke" value="#203c36"><label class="ud-checkbox"><input type="checkbox" data-ud="noStroke">なし</label></div></div></div>
              <label class="ud-field"><span>線幅</span><input class="ud-input" data-ud="strokeWidth" type="number" min="0" max="40" step=".5" value="2"></label>
              <label class="ud-field"><span>不透明度 <output data-ud="opacityValue">100%</output></span><input data-ud="opacity" type="range" min="0" max="100" step="1" value="100"></label>
              <div class="ud-layer-actions"><button type="button" class="ud-button" data-ud="forward">ひとつ前へ</button><button type="button" class="ud-button" data-ud="backward">ひとつ後ろへ</button><button type="button" class="ud-button" data-ud="duplicate">複製</button><button type="button" class="ud-button ud-button-danger" data-ud="delete">削除</button></div>
            </section>
            <section class="ud-section ud-layers-section"><div class="ud-section-heading"><h3 class="ud-section-title">レイヤー</h3><span data-ud="layerCount" class="ud-layer-count">0 / 100</span></div><p class="ud-hint">上にある図形ほど手前に表示されます。</p><div class="ud-layer-list" data-ud="layers" role="listbox" aria-label="レイヤー"></div></section>
          </aside>
        </div>
        <footer class="ud-footer"><div class="ud-footer-message"><p class="ud-status" data-ud="status" role="status" aria-live="polite"></p><span class="ud-draft-state" data-ud="draftState"></span></div><div class="ud-footer-actions"><button type="button" class="ud-button" data-ud="downloadJson">編集JSONを保存</button><button type="button" class="ud-button" data-ud="downloadSvg">SVGを保存</button><button type="button" class="ud-button ud-button-primary" data-ud="use">この下書きを素材にする</button></div></footer>
      </div>`;
    document.body.append(dialog);
    refs = Object.fromEntries(['name', 'template', 'resume', 'import', 'canvas', 'stage', 'zoom', 'dimensions', 'layers', 'layerCount', 'selectionName', 'fill', 'stroke', 'noFill', 'noStroke', 'strokeWidth', 'opacity', 'opacityValue', 'layerName', 'grid', 'snap', 'status', 'draftState', 'use'].map((key) => [key, element(key)]));
    const actions = {
      close: closeDrawing, new: startTemplate, saveDraft, resume: resumeDraft,
      importButton: () => refs.import.click(), undo: () => restoreHistory('undo'), redo: () => restoreHistory('redo'),
      forward: () => reorderLayer(1), backward: () => reorderLayer(-1), duplicate: duplicateLayer, delete: deleteLayer,
      zoomOut: () => { state.zoom = bounded(state.zoom - .25, .25, 3); syncSize(); },
      zoomIn: () => { state.zoom = bounded(state.zoom + .25, .25, 3); syncSize(); },
      fit: () => { state.zoom = 1; syncSize(); },
      downloadJson: downloadDocument, downloadSvg, use: useDrawing,
    };
    dialog.addEventListener('click', (event) => {
      if (state.busy) return;
      const tool = event.target.closest('[data-ud-tool]');
      if (tool) { chooseTool(tool.dataset.udTool); return; }
      const layer = event.target.closest('[data-ud-select-layer]');
      if (layer) { finishProperty(); state.selection = layer.dataset.udSelectLayer; state.tool = 'select'; render(); return; }
      const button = event.target.closest('button[data-ud]');
      if (button && actions[button.dataset.ud]) actions[button.dataset.ud]();
    });
    const propertyKeys = new Set(['name', 'layerName', 'x', 'y', 'width', 'height', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWidth', 'opacity']);
    for (const type of ['input', 'change']) dialog.addEventListener(type, (event) => {
      if (propertyKeys.has(event.target.dataset.ud)) editProperty(event);
    });
    refs.grid.addEventListener('change', () => { state.grid = refs.grid.checked; renderCanvas(); });
    refs.snap.addEventListener('change', () => { state.snap = refs.snap.checked; });
    refs.import.addEventListener('change', () => { importDocument(refs.import.files[0]); });
    refs.canvas.addEventListener('pointerdown', beginPointer);
    refs.canvas.addEventListener('pointermove', movePointer);
    refs.canvas.addEventListener('pointerup', (event) => { movePointer(event); endPointer(event); });
    refs.canvas.addEventListener('pointercancel', (event) => endPointer(event, true));
    refs.canvas.addEventListener('lostpointercapture', (event) => endPointer(event, true));
    dialog.addEventListener('keydown', handleKey);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDrawing(); });
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(syncSize);
      });
      observer.observe(refs.stage);
    }
    window.addEventListener('beforeunload', (event) => {
      if (dialog.open && state && dirty()) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  function open({ kind, source, onUse } = {}) {
    if (!['pattern', 'emblem'].includes(kind) || typeof onUse !== 'function') throw new Error('素材の種類と素材を受け取る処理を指定してください。');
    const existing = source == null ? null : validateSource(source).document;
    if (existing && existing.kind !== kind) throw new Error('素材と制作データの種類が一致しません。');
    if (!dialog) createDialog();
    if (dialog.open) { refs.canvas.focus(); return; }
    const template = kind === 'pattern' ? 'pattern-body' : 'emblem-blank';
    state = {
      document: existing || freshDocument(template), onUse, selection: null, tool: 'select', past: [], future: [],
      zoom: 1, grid: true, snap: false, pixelsPerUnit: 1, busy: false,
      style: { fill: '#d9573b', stroke: 'none', strokeWidth: 2, opacity: 1 },
      lastFill: '#d9573b', lastStroke: '#203c36', saved: '', prefix: `ud-drawing-${++serial}`,
    };
    state.saved = snapshot();
    gesture = null;
    propertyBefore = null;
    refs.template.innerHTML = Object.entries(TEMPLATES).filter(([, definition]) => definition.kind === kind).map(([key, definition]) => `<option value="${key}">${definition.label}</option>`).join('');
    render();
    dialog.showModal();
    requestAnimationFrame(() => { syncSize(); refs.canvas.focus(); });
    announce(existing ? '登録素材の制作データを開きました。図形を選んで再編集し、素材に反映できます。' : 'テンプレートを選んで「新しく作る」、または左のツールから描き始めてください。下書きはこのブラウザに保存できます。');
  }

  return Object.freeze({ open, validateSource });
})();

export default UniformDrawingStudio;
