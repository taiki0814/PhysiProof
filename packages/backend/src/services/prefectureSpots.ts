import type { D1Database } from '@cloudflare/workers-types';
import { BATTLE_LOCATION_MAX_AGE_MS, BATTLE_SPOT_SPACING_M, MAX_PREFECTURE_BATTLE_SPOTS } from '@my-app/shared';
import { prefectureBoundaries } from '../data/prefectureBoundaries';
import { metresBetween, SpotPlacementError } from './battleSpots';
import type { SpotPosition } from './battleSpots';

type Point = [number, number];
export type Prefecture = { code: string; name: string; bounds: number[]; polygons: string[][] };
type Ring = { points: Point[]; edges: Map<number, [Point, Point][]> };
type Polygon = { rings: Ring[]; bounds: number[] };
const decoded = new Map<string, Polygon[]>();
const FRESH_MS = 86400_000, MAX_AGE_MS = 7 * FRESH_MS;
const MAX_CANDIDATES = 20000;
const PROVIDERS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];

function decodeRing(encoded: string): Point[] {
  const points: Point[] = [];
  let x = 0, y = 0, offset = 0;
  const next = () => {
    let value = 0, shift = 0, digit: number;
    do { digit = encoded.charCodeAt(offset++) - 63; value += (digit & 31) * 2 ** shift; shift += 5; } while (digit >= 32);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  while (offset < encoded.length) { x += next(); y += next(); points.push([x / 100000, y / 100000]); }
  return points;
}
function inBounds(x: number, y: number, b: number[]) { return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }
function indexedRing(points: Point[]): Ring {
  // Only edges crossing this latitude can affect a horizontal ray. Indexing
  // 500m bands avoids scanning a whole coastline for every walking-path node.
  const edges = new Map<number, [Point, Point][]>();
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (a[1] === b[1]) continue;
    for (let band = Math.floor(Math.min(a[1], b[1]) * 200); band <= Math.floor(Math.max(a[1], b[1]) * 200); band++) {
      const existing = edges.get(band);
      if (existing) existing.push([a, b]); else edges.set(band, [[a, b]]);
    }
  }
  return { points, edges };
}
function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (const [a, b] of ring.edges.get(Math.floor(y * 200)) ?? []) {
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function withinPrefecture(region: Prefecture, latitude: number, longitude: number) {
  if (!inBounds(longitude, latitude, region.bounds)) return false;
  let polygons = decoded.get(region.code);
  if (!polygons) {
    polygons = region.polygons.map(encodedRings => {
      const rings = encodedRings.map(r => indexedRing(decodeRing(r))), b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of rings[0].points) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
      return { rings, bounds: b };
    });
    // Bound per-isolate decoded coastline/edge memory across nationwide users.
    if (decoded.size >= 4) decoded.delete(decoded.keys().next().value!);
    decoded.set(region.code, polygons);
  }
  return polygons.some(p => inBounds(longitude, latitude, p.bounds) && inRing(longitude, latitude, p.rings[0])
    && !p.rings.slice(1).some(r => inRing(longitude, latitude, r)));
}
export function locatePrefecture(latitude: number, longitude: number, locatedAt: string, now = Date.now()): Prefecture {
  const age = now - Date.parse(locatedAt);
  if (!Number.isFinite(age) || age < -30_000 || age > BATTLE_LOCATION_MAX_AGE_MS) {
    throw new SpotPlacementError('現在地の確認から5分以上経過しました。リーダーの現在地をもう一度確認してください。', 400);
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new SpotPlacementError('現在地を確認してください。', 400);
  const regions = prefectureBoundaries.filter(r => withinPrefecture(r, latitude, longitude));
  if (regions.length !== 1) throw new SpotPlacementError('現在地の都道府県を判定できません。日本国内でGPSを再取得してください。県境では少し移動して再確認してください。', 400);
  return regions[0];
}

function gridKey(p: SpotPosition, size: number, offsetX = 0, offsetY = 0) {
  // A fixed Japan-wide metric projection avoids huge grids across Tokyo's islands.
  return `${Math.floor((p.longitude * 111320 * Math.cos(36 * Math.PI / 180) + offsetX) / size)},${Math.floor((p.latitude * 111320 + offsetY) / size)}`;
}
/** Keep every occupied geographic bin rather than truncating the first N ways. */
export function compactCandidates(points: SpotPosition[]): SpotPosition[] {
  let size = 100;
  while (true) {
    const cells = new Map<string, SpotPosition>();
    for (const p of points) if (!cells.has(gridKey(p, size))) cells.set(gridKey(p, size), p);
    if (cells.size <= MAX_CANDIDATES) return [...cells.values()];
    size *= 1.5;
  }
}
export function choosePrefectureSpots(paths: SpotPosition[], random = Math.random): SpotPosition[] {
  let spacing = BATTLE_SPOT_SPACING_M;
  const dx = random(), dy = random();
  let cells: Map<string, SpotPosition[]>;
  do {
    cells = new Map<string, SpotPosition[]>();
    for (const p of paths) {
      const key = gridKey(p, spacing, dx * spacing, dy * spacing), existing = cells.get(key);
      if (existing) existing.push(p); else cells.set(key, [p]);
    }
    if (cells.size > MAX_PREFECTURE_BATTLE_SPOTS) spacing *= 1.25;
  } while (cells.size > MAX_PREFECTURE_BATTLE_SPOTS);
  const groups = [...cells.values()];
  for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
  const spots: SpotPosition[] = [];
  for (const group of groups) {
    const start = Math.floor(random() * group.length);
    for (let i = 0; i < group.length; i++) {
      const p = group[(start + i) % group.length];
      if (spots.every(s => metresBetween(s, p) >= 500)) { spots.push(p); break; }
    }
  }
  return spots;
}
type Catalog = { candidates_json: string | null; fetched_at_ms: number; lease_until_ms: number; retry_after_ms: number };
function storedCandidates(row: Catalog | null, now: number, maxAge: number): SpotPosition[] | undefined {
  if (!row?.candidates_json || row.fetched_at_ms > now || now - row.fetched_at_ms > maxAge) return;
  try {
    const points: unknown = JSON.parse(row.candidates_json);
    if (!Array.isArray(points) || !points.length || points.length > MAX_CANDIDATES) return;
    if (points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) return;
    return points.map(p => ({ latitude: p[0], longitude: p[1] }));
  } catch { return; }
}

/** An area-scoped node query returns actual nodes on explicitly-public walking
 * ways, clipped to the prefecture by OSM. No sea snapping or invented locations. */
export function prefectureWalkingQuery(code: string) {
  if (!/^JP-(0[1-9]|[1-3][0-9]|4[0-7])$/.test(code)) throw new Error('Invalid prefecture code');
  const highway = '[highway~"^(footway|pedestrian|path)$"]';
  return `[out:json][timeout:40][maxsize:268435456];area["ISO3166-2"="${code}"][admin_level=4]->.pref;(way(area.pref)${highway}[foot~"^(yes|designated|permissive)$"][access!~"^(private|no|customers|permit)$"];way(area.pref)${highway}[access~"^(yes|permissive)$"][!foot];way(area.pref)${highway}[access~"^(yes|permissive)$"][foot=""];)->.walking;.pref out tags;node(w.walking)(area.pref);out skel;`;
}
export function parsePrefectureCandidates(value: unknown, region: Prefecture): SpotPosition[] {
  const data = value as { remark?: unknown; elements?: { type?: string; lat?: number; lon?: number; tags?: Record<string, string> }[] } | null;
  if (!data || data.remark || !Array.isArray(data.elements) || data.elements.length > 200000
    || !data.elements.some(e => e?.type === 'area' && e.tags?.['ISO3166-2'] === region.code)) throw new Error('Incomplete prefecture map');
  const points: SpotPosition[] = [];
  for (const node of data.elements) {
    if (!node || typeof node !== 'object') throw new Error('Invalid map node');
    if (node.type !== 'node') continue;
    if (typeof node.lat !== 'number' || typeof node.lon !== 'number' || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)
      || Math.abs(node.lat) > 90 || Math.abs(node.lon) > 180) throw new Error('Invalid map coordinates');
    if (withinPrefecture(region, node.lat, node.lon)) points.push({ latitude: node.lat, longitude: node.lon });
  }
  return compactCandidates(points);
}
export async function preparePrefectureCandidates(db: D1Database, region: Prefecture): Promise<SpotPosition[]> {
  const now = Date.now();
  const row = await db.prepare('SELECT candidates_json,fetched_at_ms,lease_until_ms,retry_after_ms FROM battle_prefecture_candidates WHERE prefecture_code=?').bind(region.code).first<Catalog>();
  const fresh = storedCandidates(row, now, FRESH_MS);
  if (fresh) return fresh;
  const previous = storedCandidates(row, now, MAX_AGE_MS);
  if (row && (row.lease_until_ms > now || row.retry_after_ms > now)) {
    if (previous) return previous;
    throw new SpotPlacementError('この都道府県の地図は準備中、または取得先が混雑しています。1分以上待って現在地を再確認してください。');
  }
  await db.prepare('INSERT OR IGNORE INTO battle_prefecture_candidates (prefecture_code) VALUES (?)').bind(region.code).run();
  const leaseUntil = now + 120000;
  const lease = await db.prepare('UPDATE battle_prefecture_candidates SET lease_until_ms=? WHERE prefecture_code=? AND lease_until_ms<=? AND retry_after_ms<=?')
    .bind(leaseUntil, region.code, now, now).run();
  if (!lease.meta.changes) {
    if (previous) return previous;
    throw new SpotPlacementError('この都道府県の地図を準備しています。1分以上待って再確認してください。');
  }
  let cooldown = 60_000;
  let emptyMaps = 0;
  try {
    for (const provider of PROVIDERS) {
      try {
        const response = await fetch(provider, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PhysiProof/1.0 (+https://github.com/taiki0814/PhysiProof)' }, body: new URLSearchParams({ data: prefectureWalkingQuery(region.code) }), signal: AbortSignal.timeout(45000) });
        if (!response.ok) {
          const retry = response.headers.get('Retry-After');
          if (retry) { const ms = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now(); if (Number.isFinite(ms)) cooldown = Math.max(cooldown, ms); }
          try { await response.body?.cancel(); } catch { /* still honor cooldown */ }
          console.warn('Prefecture walking map provider failed', new URL(provider).hostname, response.status);
          if (response.status === 406 || response.status === 429) break;
          continue;
        }
        const points = parsePrefectureCandidates(await response.json(), region);
        // Public providers can have temporarily different area indexes. A valid
        // but empty primary response is not proof that the prefecture has no
        // walking paths: check the backup without saving an empty catalogue.
        if (!points.length) { emptyMaps++; continue; }
        const saved = await db.prepare('UPDATE battle_prefecture_candidates SET candidates_json=?,fetched_at_ms=?,lease_until_ms=0,retry_after_ms=0 WHERE prefecture_code=? AND lease_until_ms=?')
          .bind(JSON.stringify(points.map(p => [p.latitude, p.longitude])), Date.now(), region.code, leaseUntil).run();
        if (!saved.meta.changes) throw new SpotPlacementError('この都道府県の地図を別の処理で更新しています。1分以上待って再確認してください。');
        return points;
      } catch (error) {
        if (error instanceof SpotPlacementError) throw error;
        console.warn('Prefecture walking map lookup failed', new URL(provider).hostname, error instanceof Error ? error.name : 'UnknownError');
      }
    }
    if (emptyMaps === PROVIDERS.length) throw new SpotPlacementError('この都道府県では公開歩行路の候補を確認できません。スポットなしで申し込むこともできます。', 400);
    if (previous) return previous;
    throw new SpotPlacementError('都道府県のスポット候補を取得できません。1分以上待って現在地を再確認するか、スポットなしで申し込んでください。');
  } finally {
    await db.prepare('UPDATE battle_prefecture_candidates SET lease_until_ms=0,retry_after_ms=? WHERE prefecture_code=? AND lease_until_ms=?')
      .bind(Date.now() + cooldown, region.code, leaseUntil).run();
  }
}
/** Invitation creation only reads the pre-saved catalog: never fetch a whole
 * prefecture here. The GPS and confirmed region are rechecked by the server. */
export async function createPrefecturePlacement(db: D1Database, latitude: number, longitude: number, locatedAt: string, expectedCode: string) {
  const region = locatePrefecture(latitude, longitude, locatedAt);
  if (region.code !== expectedCode) throw new SpotPlacementError('現在地の都道府県が変わりました。配置する都道府県をもう一度確認してください。', 400);
  const row = await db.prepare('SELECT candidates_json,fetched_at_ms,lease_until_ms,retry_after_ms FROM battle_prefecture_candidates WHERE prefecture_code=?').bind(region.code).first<Catalog>();
  const paths = storedCandidates(row, Date.now(), MAX_AGE_MS);
  if (!paths) throw new SpotPlacementError('スポット候補の準備が必要です。現在地を確認してから申し込んでください。', 400);
  const spots = choosePrefectureSpots(paths.filter(p => withinPrefecture(region, p.latitude, p.longitude)));
  if (!spots.length) throw new SpotPlacementError('公開歩行路のスポット候補がありません。現在地を再確認してください。', 400);
  const bounds = [Math.min(...spots.map(p => p.longitude)), Math.min(...spots.map(p => p.latitude)), Math.max(...spots.map(p => p.longitude)), Math.max(...spots.map(p => p.latitude))];
  return { region, spots, bounds };
}
