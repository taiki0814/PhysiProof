import { BATTLE_SPOT_SPACING_M } from '@my-app/shared';

export type SpotPosition = { latitude: number; longitude: number };
const EARTH = 6371008.8;
export class SpotPlacementError extends Error {
  constructor(message: string, readonly status: 400 | 503 = 503) { super(message); }
}
type WalkingData = { elements: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] };
type EdgeCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };

// Two sequential attempts only. The main public instance is frequently overloaded;
// never fan requests out or bypass a provider's explicit 406/429 cooldown.
const MAP_PROVIDERS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const FRESH_MAP_SECONDS = 3600;
const LAST_SUCCESS_SECONDS = 86400;
const MAP_REQUEST_TIMEOUT_MS = 15000;
const inFlightMaps = new Map<string, Promise<WalkingData>>();

function parseWalkingData(value: unknown): WalkingData {
  if (!value || typeof value !== 'object' || !('elements' in value) || !Array.isArray(value.elements)
    || ('remark' in value && value.remark)) throw new Error('Incomplete walking map response');
  for (const way of value.elements) {
    if (!way || typeof way !== 'object'
      || (way.tags !== undefined && (!way.tags || typeof way.tags !== 'object' || Object.values(way.tags).some(v => typeof v !== 'string')))
      || (way.geometry !== undefined && (!Array.isArray(way.geometry) || way.geometry.some((p: { lat?: unknown; lon?: unknown } | null) => (
        !p || typeof p.lat !== 'number' || typeof p.lon !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)
        || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180
      ))))) throw new Error('Invalid walking map geometry');
  }
  return value as WalkingData;
}

async function cacheRead(cache: EdgeCache | undefined, key: Request): Promise<unknown> {
  try { return await (await cache?.match(key))?.json(); } catch { return undefined; }
}

async function cacheWrite(cache: EdgeCache | undefined, key: Request, data: unknown, seconds: number) {
  try {
    await cache?.put(key, new Response(JSON.stringify(data), { headers: {
      'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${seconds}`,
    } }));
  } catch { /* optional cache failures must not prevent a valid invitation */ }
}

async function lastSuccessfulMap(cache: EdgeCache | undefined, key: Request): Promise<WalkingData | undefined> {
  const entry = await cacheRead(cache, key) as { saved_at?: unknown; data?: unknown } | undefined;
  if (!entry || typeof entry.saved_at !== 'number' || entry.saved_at > Date.now()
    || Date.now() - entry.saved_at > LAST_SUCCESS_SECONDS * 1000) return undefined;
  try { return parseWalkingData(entry.data); } catch { return undefined; }
}

async function fetchWalkingData(cache: EdgeCache | undefined, key: Request, lastSuccessKey: Request, query: string): Promise<WalkingData> {
  let cooldownSeconds = 30;
  for (const provider of MAP_PROVIDERS) {
    try {
      const response = await fetch(provider, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PhysiProof/1.0 (+https://github.com/taiki0814/PhysiProof)' },
        body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(MAP_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Log no coordinates, user IDs, response bodies or credentials.
        console.warn('Battle walking map provider failed', new URL(provider).hostname, response.status);
        try { await response.body?.cancel(); } catch { /* still honor rate limits if body disposal fails */ }
        if (response.status === 406 || response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter)
            : retryAfter ? Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000) : 30;
          cooldownSeconds = Number.isFinite(seconds) ? Math.max(30, seconds) : 30;
          break;
        }
        continue;
      }
      const data = parseWalkingData(await response.json());
      await cacheWrite(cache, key, data, FRESH_MAP_SECONDS);
      await cacheWrite(cache, lastSuccessKey, { saved_at: Date.now(), data }, LAST_SUCCESS_SECONDS);
      return data;
    } catch (error) {
      console.warn('Battle walking map lookup failed', new URL(provider).hostname, error instanceof Error ? error.name : 'UnknownError');
    }
  }
  // Cache the cooldown separately from the last success so an outage cannot
  // overwrite useful walking geometry. TTL and saved_at both bound its age.
  await cacheWrite(cache, key, { unavailable: true }, cooldownSeconds);
  const previous = await lastSuccessfulMap(cache, lastSuccessKey);
  if (previous) return previous;
  throw new SpotPlacementError('スポット配置用の地図を取得できません。30秒以上待って再試行するか、スポットなしで申し込んでください。');
}

async function walkingData(latitude: number, longitude: number, radius: number): Promise<WalkingData> {
  const cache = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
  const lat = Number(latitude.toFixed(3)), lng = Number(longitude.toFixed(3));
  // A 200m margin covers rounding of the center. The placement itself still uses
  // the original circle; cached map data never makes a new random spot layout.
  // Versioned keys exclude old broad/possibly partial responses.
  const cacheKey = new Request(`https://physiproof-cache.invalid/walking-paths/v2/${lat}/${lng}/${radius}`);
  const lastSuccessKey = new Request(`${cacheKey.url}/last-success`);
  const cached = await cacheRead(cache, cacheKey);
  if (cached) {
    if (typeof cached === 'object' && 'unavailable' in cached && cached.unavailable) {
      const previous = await lastSuccessfulMap(cache, lastSuccessKey);
      if (previous) return previous;
      throw new SpotPlacementError('配置用の地図が混雑しています。30秒以上待って再試行するか、スポットなしで申し込んでください。');
    }
    try { return parseWalkingData(cached); } catch { /* corrupt cache: perform a bounded fresh lookup */ }
  }
  // Apply the same explicit-public-access rule before output, rather than
  // downloading thousands of paths we would discard. Lower resource reservations
  // also make it easier for a busy Overpass instance to admit this small query.
  const query = `[out:json][timeout:10][maxsize:33554432];way(around:${radius + 200},${lat},${lng})[highway~"^(footway|pedestrian|path)$"][access!~"^(private|no|customers|permit)$"]->.walking;(way.walking[foot~"^(yes|designated|permissive)$"];way.walking[access~"^(yes|permissive)$"][!foot];way.walking[access~"^(yes|permissive)$"][foot=""];);out tags geom;`;
  const existing = inFlightMaps.get(cacheKey.url);
  if (existing) return existing;
  const pending = fetchWalkingData(cache, cacheKey, lastSuccessKey, query);
  inFlightMaps.set(cacheKey.url, pending);
  try {
    return await pending;
  } finally {
    inFlightMaps.delete(cacheKey.url);
  }
}
export function metresBetween(a: SpotPosition, b: SpotPosition) {
  const rad = Math.PI / 180;
  const dy = (a.latitude - b.latitude) * rad;
  const dx = (a.longitude - b.longitude) * rad * Math.cos((a.latitude + b.latitude) * rad / 2);
  return Math.hypot(dx, dy) * EARTH;
}

/** Randomly shifted/rotated hex lattice, snapped to mapped public walking ways.
 * Never substitute arbitrary coordinates when the map service is unavailable. */
export function chooseSpots(center: SpotPosition, radius: number, paths: SpotPosition[], random = Math.random): SpotPosition[] {
  const angle = random() * Math.PI * 2, shiftX = (random() - .5) * BATTLE_SPOT_SPACING_M;
  const shiftY = (random() - .5) * BATTLE_SPOT_SPACING_M;
  const positions: SpotPosition[] = [];
  const n = Math.ceil(radius / BATTLE_SPOT_SPACING_M) + 2;
  for (let row = -n; row <= n; row++) for (let col = -n; col <= n; col++) {
    const x = (col + (row % 2) / 2) * BATTLE_SPOT_SPACING_M + shiftX;
    const y = row * BATTLE_SPOT_SPACING_M * Math.sqrt(3) / 2 + shiftY;
    const rx = x * Math.cos(angle) - y * Math.sin(angle), ry = x * Math.sin(angle) + y * Math.cos(angle);
    if (Math.hypot(rx, ry) > radius) continue;
    const target = { latitude: center.latitude + ry / EARTH * 180 / Math.PI,
      longitude: center.longitude + rx / (EARTH * Math.cos(center.latitude * Math.PI / 180)) * 180 / Math.PI };
    let nearest: SpotPosition | undefined, nearestDistance = 120;
    for (const point of paths) {
      const distance = metresBetween(point, target);
      if (distance < nearestDistance) { nearest = point; nearestDistance = distance; }
    }
    if (nearest && metresBetween(center, nearest) <= radius && positions.every(p => metresBetween(p, nearest!) >= 500)) positions.push(nearest);
  }
  return positions.slice(0, 64);
}

export async function generateBattleSpots(latitude: number, longitude: number, radius: number): Promise<SpotPosition[]> {
  const data = await walkingData(latitude, longitude, radius);
  const paths: SpotPosition[] = [];
  for (const way of data.elements ?? []) {
    const tags = way.tags ?? {};
    // Explicit permission is required; unknown/private access never becomes a spot.
    if (!['yes', 'designated', 'permissive'].includes(tags.foot ?? '') && !['yes', 'permissive'].includes(tags.access ?? '')) continue;
    if (tags.foot && !['yes', 'designated', 'permissive'].includes(tags.foot)) continue;
    if (['private', 'no', 'customers', 'permit'].includes(tags.access ?? '') || ['private', 'no'].includes(tags.foot ?? '')) continue;
    const geometry = way.geometry ?? [];
    for (let i = 1; i < geometry.length; i++) {
      const a = { latitude: geometry[i - 1].lat, longitude: geometry[i - 1].lon };
      const b = { latitude: geometry[i].lat, longitude: geometry[i].lon };
      if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) continue;
      const steps = Math.min(100, Math.max(1, Math.ceil(metresBetween(a, b) / 40)));
      for (let j = 0; j <= steps; j++) paths.push({ latitude: a.latitude + (b.latitude - a.latitude) * j / steps, longitude: a.longitude + (b.longitude - a.longitude) * j / steps });
    }
    if (paths.length > 100000) break;
  }
  const spots = chooseSpots({ latitude, longitude }, radius, paths);
  if (!spots.length) throw new SpotPlacementError('この範囲では公開された歩行路の候補を確認できません。中心位置を変更するか、スポットなしで申し込んでください。', 400);
  return spots;
}
