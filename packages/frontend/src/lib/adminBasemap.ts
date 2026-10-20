import type { Map as LeafletMap, MaplibreGL } from 'leaflet';
import type { Map as VectorMap, StyleSpecification } from 'maplibre-gl';

// The normal running map already uses this key-free provider. Keep overlays in Leaflet.
export const ADMIN_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const ADMIN_MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
export type AdminBasemapStatus = 'loading' | 'ready' | 'error';

export function simplifyAdminMapStyle(style: StyleSpecification): StyleSpecification {
  if (style.version !== 8 || !Array.isArray(style.layers)) throw new Error('Unsupported map style');
  return {
    ...style,
    layers: style.layers.map(layer => {
      const hide = ['building', 'label_other', 'highway-name-minor', 'highway-name-path'].includes(layer.id)
        || ('source-layer' in layer && layer['source-layer'] === 'poi');
      return hide ? { ...layer, layout: { ...layer.layout, visibility: 'none' as const } } : layer;
    }),
  };
}

/** Own only the background layer: retries never remove territories or reset the view. */
export function mountAdminBasemap(map: LeafletMap, onStatus: (status: AdminBasemapStatus) => void): () => void {
  let disposed = false;
  let loaded = false;
  let errors = 0;
  let layer: MaplibreGL | undefined;
  let vectorMap: VectorMap | undefined;
  const abort = new AbortController();
  const ready = () => {
    if (disposed) return;
    loaded = true;
    clearTimeout(timeout);
    onStatus('ready');
  };
  const failed = () => {
    if (!disposed) onStatus('error');
  };
  const loadError = () => { if (!loaded && ++errors >= 3) failed(); };
  const timeout = setTimeout(() => { if (!loaded) failed(); }, 15000);
  onStatus('loading');

  void Promise.all([
    import('@maplibre/maplibre-gl-leaflet'),
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl.css'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
  ]).then(async ([{ maplibreGL }, maplibre, _css, worker]) => {
    if (disposed) return;
    maplibre.setWorkerUrl(worker.default);
    // External map style, not an application API. Never send account credentials.
    const response = await fetch(ADMIN_MAP_STYLE_URL, { signal: abort.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Map style unavailable');
    const style = simplifyAdminMapStyle(await response.json());
    if (disposed) return;
    layer = maplibreGL({ style, interactive: false, attributionControl: false }).addTo(map);
    vectorMap = layer.getMaplibreMap();
    vectorMap.on('load', ready);
    vectorMap.on('error', loadError);
    if (vectorMap.loaded()) ready();
  }).catch(failed);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    clearTimeout(timeout);
    vectorMap?.off('load', ready);
    vectorMap?.off('error', loadError);
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    map.off('unload', dispose);
  };
  map.on('unload', dispose);
  return dispose;
}
