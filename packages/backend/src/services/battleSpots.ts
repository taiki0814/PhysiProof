import { BATTLE_SPOT_SPACING_M } from '@my-app/shared';

export type SpotPosition = { latitude: number; longitude: number };
const EARTH = 6371008.8;
export class SpotPlacementError extends Error {
  constructor(message: string, readonly status: 400 | 503 = 503) { super(message); }
}
type WalkingData = { elements?: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[]; unavailable?: boolean };
type EdgeCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };

async function walkingData(latitude: number, longitude: number, radius: number): Promise<WalkingData> {
  const cache = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
  const lat = Number(latitude.toFixed(3)), lng = Number(longitude.toFixed(3));
  // A 200m margin covers rounding of the center. The placement itself still uses
  // the original circle; cached map data never makes a new random spot layout.
  const cacheKey = new Request(`https://physiproof-cache.invalid/walking-paths/${lat}/${lng}/${radius}`);
  let cached: Response | undefined;
  try { cached = await cache?.match(cacheKey); } catch { /* cache outage must not break placement */ }
  if (cached) {
    const data = await cached.json() as WalkingData;
    if (data.unavailable) throw new SpotPlacementError('配置用の地図が一時的に利用できません。30秒以上待つか、スポットなしで申し込んでください。');
    return data;
  }
  const query = `[out:json][timeout:20];way(around:${radius + 200},${lat},${lng})[highway~"^(footway|pedestrian|path)$"][access!~"^(private|no|customers|permit)$"][foot!~"^(private|no)$"];out tags geom;`;
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PhysiProof/1.0 (+https://github.com/taiki0814/PhysiProof)' },
      body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error('Map service unavailable');
    const data = await response.json() as WalkingData;
    if (!Array.isArray(data?.elements)) throw new Error('Invalid walking map response');
    try { await cache?.put(cacheKey, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })); } catch { /* optional cache */ }
    return data;
  } catch {
    // Providers request a pause after 406/429. Share a short failure cooldown at
    // the edge instead of issuing repeated queries when players retry.
    try { await cache?.put(cacheKey, new Response('{"unavailable":true}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } })); } catch { /* optional cache */ }
    throw new SpotPlacementError('スポット配置用の地図を取得できません。30秒以上待って再試行するか、スポットなしで申し込んでください。');
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
