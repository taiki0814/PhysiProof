import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as LeafletMap } from 'leaflet';
import type { StyleSpecification } from 'maplibre-gl';
import { ADMIN_MAP_ATTRIBUTION, ADMIN_MAP_STYLE_URL, mountAdminBasemap, simplifyAdminMapStyle } from './adminBasemap';

const mocks = vi.hoisted(() => ({ createLayer: vi.fn(), worker: vi.fn() }));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: mocks.createLayer }));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: mocks.worker }));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/bundled-map-worker.js' }));

function style(): StyleSpecification {
  return { version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: [
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
    { id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
    { id: 'shops', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi' },
    { id: 'label_other', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-size': 12 } },
  ] };
}

describe('administrator key-free basemap', () => {
  let events: Map<string, () => void>;
  let mapEvents: Map<string, () => void>;
  let vector: { on: (event: string, fn: () => void) => void; off: (event: string) => void; loaded: () => boolean };
  let map: LeafletMap;
  let layer: { addTo: ReturnType<typeof vi.fn>; getMaplibreMap: () => typeof vector };
  let remove: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    events = new Map(); mapEvents = new Map(); status = vi.fn(); remove = vi.fn();
    vector = {
      on: vi.fn((event: string, fn: () => void) => { events.set(event, fn); }),
      off: vi.fn((event: string) => { events.delete(event); }), loaded: vi.fn(() => false),
    };
    layer = { addTo: vi.fn().mockReturnThis(), getMaplibreMap: vi.fn(() => vector) };
    mocks.createLayer.mockReset().mockReturnValue(layer); mocks.worker.mockReset();
    map = { hasLayer: () => true, removeLayer: remove,
      on: vi.fn((event: string, fn: () => void) => { mapEvents.set(event, fn); }), off: vi.fn((event: string) => { mapEvents.delete(event); }),
    } as unknown as LeafletMap;
    fetchMock = vi.fn().mockResolvedValue(Response.json(style()));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const attach = async () => { const dispose = mountAdminBasemap(map, status); await vi.dynamicImportSettled(); return dispose; };

  it('uses an HTTPS key-free style, omits credentials and retains attribution', async () => {
    const dispose = await attach();
    expect(ADMIN_MAP_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(fetchMock).toHaveBeenCalledWith(ADMIN_MAP_STYLE_URL, { credentials: 'omit', signal: expect.any(AbortSignal) });
    expect(ADMIN_MAP_ATTRIBUTION).toContain('OpenMapTiles');
    expect(ADMIN_MAP_ATTRIBUTION).toContain('openstreetmap.org/copyright');
    expect(mocks.worker).toHaveBeenCalledWith('/bundled-map-worker.js');
    expect(mocks.createLayer).toHaveBeenCalledWith(expect.objectContaining({ interactive: false, attributionControl: false }));
    events.get('load')!();
    expect(status.mock.calls.map(call => call[0])).toEqual(['loading', 'ready']);
    vi.advanceTimersByTime(16000);
    expect(status).toHaveBeenLastCalledWith('ready');
    dispose();
  });
  it('hides visual clutter without mutating the fetched style or removing roads/water', () => {
    const original = style(), cleaned = simplifyAdminMapStyle(original);
    expect(cleaned.layers).toHaveLength(original.layers.length);
    expect(cleaned.layers.slice(0, 2)).toEqual(original.layers.slice(0, 2));
    expect(cleaned.layers.slice(2).every(layer => layer.layout?.visibility === 'none')).toBe(true);
    expect(original.layers[2].layout).toBeUndefined();
    expect(cleaned.layers[4].layout).toEqual({ 'text-size': 12, visibility: 'none' });
  });
  it.each([401, 403, 429, 503])('reports style HTTP %i without creating a background', async code => {
    fetchMock.mockResolvedValue(new Response('', { status: code }));
    const dispose = await attach();
    expect(status).toHaveBeenLastCalledWith('error');
    expect(mocks.createLayer).not.toHaveBeenCalled(); dispose();
  });
  it('rejects an invalid style and handles constructor/WebGL failure', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ version: 8 }));
    const dispose = await attach();
    expect(status).toHaveBeenLastCalledWith('error'); dispose();
    fetchMock.mockResolvedValueOnce(Response.json(style())); mocks.createLayer.mockImplementationOnce(() => { throw new Error('WebGL unavailable'); });
    const disposeAgain = await attach();
    expect(status).toHaveBeenLastCalledWith('error'); disposeAgain();
  });
  it('times out without blocking overlays and accepts a late successful load', async () => {
    const dispose = await attach();
    vi.advanceTimersByTime(15000); expect(status).toHaveBeenLastCalledWith('error');
    events.get('load')!(); expect(status).toHaveBeenLastCalledWith('ready'); dispose();
  });
  it('reports repeated loading errors without discarding Leaflet territory layers', async () => {
    const dispose = await attach();
    events.get('error')!(); events.get('error')!(); expect(status).toHaveBeenLastCalledWith('loading');
    events.get('error')!(); expect(status).toHaveBeenLastCalledWith('error'); expect(remove).not.toHaveBeenCalled(); dispose();
  });
  it('removes only its own background and listeners on tab disposal, idempotently', async () => {
    const dispose = await attach(), callsBefore = status.mock.calls.length;
    mapEvents.get('unload')!(); dispose(); vi.advanceTimersByTime(16000);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(layer);
    expect(events.size).toBe(0); expect(mapEvents.size).toBe(0);
    expect(status).toHaveBeenCalledTimes(callsBefore);
  });
  it('cancels an in-flight style and ignores its late resolution after unmount', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const dispose = mountAdminBasemap(map, status);
    // Flush module imports without waiting for the intentionally unresolved style request.
    await vi.dynamicImportSettled();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    dispose(); expect(signal.aborted).toBe(true);
    finish(Response.json(style())); await vi.dynamicImportSettled();
    expect(mocks.createLayer).not.toHaveBeenCalled();
    expect(status.mock.calls.map(call => call[0])).toEqual(['loading']);
  });
  it('does not fetch or initialize after immediate cleanup before imports resolve', async () => {
    const dispose = mountAdminBasemap(map, status);
    dispose(); await vi.dynamicImportSettled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.createLayer).not.toHaveBeenCalled();
    expect(mapEvents.size).toBe(0);
  });
  it('can retry the background on the same Leaflet map without changing its viewport', async () => {
    const dispose = await attach(); dispose();
    fetchMock.mockResolvedValueOnce(Response.json(style()));
    const retry = await attach();
    expect(mocks.createLayer).toHaveBeenCalledTimes(2);
    expect(layer.addTo).toHaveBeenNthCalledWith(1, map);
    expect(layer.addTo).toHaveBeenNthCalledWith(2, map);
    expect(remove).toHaveBeenCalledTimes(1); retry();
  });
});
