import client, { API_BASE_URL } from './hc';

export const PUBLIC_MAP_CACHE_KEY = `physiproof_public_map_v1:${API_BASE_URL || 'local'}`;
const MAX_BYTES = 2_000_000;
const TTL = 5 * 60_000;
type Snapshot = { etag: string; saved: number; territories: Record<string, unknown>[] };
export function readPublicMapCache(storage: Pick<Storage, 'getItem' | 'removeItem'>, now = Date.now()): Snapshot | null {
  try {
    const raw = storage.getItem(PUBLIC_MAP_CACHE_KEY);
    if (!raw) return null;
    if (raw.length * 2 > MAX_BYTES) throw new Error('oversize');
    const parsed = JSON.parse(raw);
    if (!parsed.etag || !Number.isFinite(parsed.saved) || parsed.saved > now || now - parsed.saved > TTL || !Array.isArray(parsed.territories)) throw new Error('expired');
    return parsed;
  } catch { try { storage.removeItem(PUBLIC_MAP_CACHE_KEY); } catch {} return null; }
}
export function writePublicMapCache(storage: Pick<Storage, 'setItem' | 'removeItem'>, snapshot: Snapshot) {
  try {
    const raw = JSON.stringify(snapshot);
    if (raw.length * 2 > MAX_BYTES) storage.removeItem(PUBLIC_MAP_CACHE_KEY);
    else storage.setItem(PUBLIC_MAP_CACHE_KEY, raw);
  } catch { /* Storage is optional, never a prerequisite for live capture. */ }
}
export async function loadWorldTerritories(scope: 'all' | 'friends', signal?: AbortSignal) {
  const cache = scope === 'all' ? readPublicMapCache(localStorage) : null;
  const response = await client.api.territories.$get({ query: { scope } }, {
    headers: cache ? { 'If-None-Match': cache.etag } : {}, init: { signal, cache: 'no-store' },
  });
  // Do not offer an offline fallback. A device snapshot is usable only after
  // the authoritative server confirms it is still the current public revision.
  if (response.status === 304 && cache) return cache.territories;
  if (!response.ok) throw new Error(response.status === 401 ? '再ログインしてください。' : '領域を読み込めませんでした。');
  const data = await response.json() as { territories: Record<string, unknown>[] };
  if (scope === 'all' && response.headers.get('ETag')) writePublicMapCache(localStorage, {
    etag: response.headers.get('ETag')!, saved: Date.now(), territories: data.territories,
  });
  return data.territories;
}
