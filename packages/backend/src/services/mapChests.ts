import type { D1Database } from '@cloudflare/workers-types';
import { CHEST_INNER_MARGIN_M, CHEST_MAX_TRACE_POINTS, CHEST_REWARDS, CHEST_TIERS, chestResultSchema } from '@my-app/shared';
import type { ChestResult, ChestTier } from '@my-app/shared';
import { metresBetween, type SpotPosition } from './battleSpots';
import { withinPrefecture, type Prefecture } from './prefectureSpots';

const DAY = 86400000;
export function chestWeekEnd(now: number) {
  // Monday 00:00 JST, including at the exact turnover instant.
  const monday = 4 * DAY - 9 * 3600000;
  return monday + (Math.floor((now - monday) / (7 * DAY)) + 1) * 7 * DAY;
}

type Point = [number, number];
type ChestPoint = { latitude: number | null; longitude: number | null; captured_at: number };
type ChestRow = SpotPosition & { id: string; expires_at: number };
const project = (point: SpotPosition, origin: SpotPosition): Point => [
  (point.longitude - origin.longitude) * 111195 * Math.cos(origin.latitude * Math.PI / 180),
  (point.latitude - origin.latitude) * 111195,
];

function edgeDistance(a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(...a);
  const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared));
  return Math.hypot(a[0] + dx * t, a[1] + dy * t);
}

function loopMetrics(points: SpotPosition[], chest: SpotPosition) {
  const vertices = points.map(point => project(point, chest));
  let twiceArea = 0, inside = false, clearance = Infinity;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i];
    twiceArea += a[0] * b[1] - b[0] * a[1];
    if ((a[1] > 0) !== (b[1] > 0) && a[0] + (b[0] - a[0]) * -a[1] / (b[1] - a[1]) > 0) inside = !inside;
    clearance = Math.min(clearance, edgeDistance(a, b));
  }
  return { area: Math.abs(twiceArea) / 2, clearance, inside };
}

function crossesItself(points: SpotPosition[], origin: SpotPosition) {
  const vertices = points.map(point => project(point, origin));
  const side = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const boundsOverlap = (a: number, b: number, c: number, d: number) =>
    Math.max(Math.min(a, b), Math.min(c, d)) <= Math.min(Math.max(a, b), Math.max(c, d));
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue;
      const c = vertices[j], d = vertices[(j + 1) % vertices.length];
      if (!boundsOverlap(a[0], b[0], c[0], d[0]) || !boundsOverlap(a[1], b[1], c[1], d[1])) continue;
      if (side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return true;
    }
  }
  return false;
}

export function chestTierForTrace(rows: ChestPoint[], chest: SpotPosition): ChestTier | null {
  if (rows.length > CHEST_MAX_TRACE_POINTS) return null;
  let points: SpotPosition[] = [], lastAt = 0;
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null || row.captured_at - lastAt > 45000) points = [];
    lastAt = row.captured_at;
    if (row.latitude !== null && row.longitude !== null) points.push({ latitude: row.latitude, longitude: row.longitude });
  }
  if (points.length < 6 || metresBetween(points[0], points[points.length - 1]) > 25) return null;
  if (metresBetween(points[0], points[points.length - 1]) < 1) points.pop();
  const metrics = loopMetrics(points, chest);
  if (!metrics.inside || metrics.clearance < CHEST_INNER_MARGIN_M || crossesItself(points, chest)) return null;
  return [...CHEST_TIERS].reverse().find(tier => metrics.area >= tier.area)?.id ?? null;
}

/** Only use actual closed public pedestrian ways. Never fill gaps with random coordinates. */
export function parseChestCandidates(data: unknown, region: Prefecture) {
  const result = data as { remark?: string; elements?: Array<{ type?: string; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }> } | null;
  if (!result || result.remark || !Array.isArray(result.elements) || result.elements.length > 10000
    || !result.elements.some(item => item?.type === 'area' && item.tags?.['ISO3166-2'] === region.code)) {
    throw new Error('Incomplete walking loops');
  }
  const candidates: SpotPosition[] = [];
  for (const item of result.elements) {
    if (!Array.isArray(item?.geometry) || item.geometry.length < 4 || item.geometry.length > 1000) continue;
    if (!item.geometry.every(p => Number.isFinite(p?.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180)) continue;
    const points = item.geometry.slice(0, -1).map(p => ({ latitude: p.lat, longitude: p.lon }));
    const last = item.geometry[item.geometry.length - 1];
    if (last.lat !== points[0].latitude || last.lon !== points[0].longitude) continue;
    const center = {
      latitude: points.reduce((total, p) => total + p.latitude, 0) / points.length,
      longitude: points.reduce((total, p) => total + p.longitude, 0) / points.length,
    };
    const metrics = loopMetrics(points, center);
    if (!metrics.inside || metrics.clearance < CHEST_INNER_MARGIN_M + 6 || metrics.area < CHEST_TIERS[0].area || metrics.area > 300000
      || crossesItself(points, center)) continue;
    if (withinPrefecture(region, center.latitude, center.longitude)) candidates.push(center);
  }
  return candidates;
}

export class ChestPlacementError extends Error {}

async function fetchChestCandidates(region: Prefecture) {
  const open = '[access!~"^(private|no|customers|permit)$"][foot!~"^(private|no)$"][indoor!=yes][fee!=yes][area!=yes]';
  const closed = '(if:is_closed()==1)';
  const query = `[out:json][timeout:10];area["ISO3166-2"="${region.code}"][admin_level=4]->.pref;(
    way(area.pref)[highway~"^(footway|pedestrian)$"]${open}${closed};
    way(area.pref)[highway=path][foot~"^(yes|designated|permissive)$"]${open}${closed};
    way(area.pref)[leisure=track][sport=running][access~"^(yes|permissive)$"]${open}${closed};
  );out geom;.pref out tags;`;
  let verifiedEmpty = false;
  for (const host of ['overpass.private.coffee', 'overpass-api.de']) {
    try {
      const response = await fetch(`https://${host}/api/interpreter?${new URLSearchParams({ data: query })}`, {
        headers: { 'User-Agent': 'Foope/1.0 (+https://github.com/taiki0814/PhysiProof)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) break;
        continue;
      }
      const candidates = parseChestCandidates(await response.json(), region);
      if (candidates.length) return candidates.slice(0, 2000);
      verifiedEmpty = true;
    } catch { /* Try the second provider before marking the week unavailable. */ }
  }
  if (verifiedEmpty) return [];
  throw new ChestPlacementError('公開歩行路のデータを取得できません。２分ほど待って再試行してください。');
}

export async function populateChestWeek(db: D1Database, region: Prefecture, expiresAt: number) {
  const week = await db.prepare('SELECT ready FROM map_chest_weeks WHERE prefecture_code=? AND expires_at=?')
    .bind(region.code, expiresAt).first<{ ready: number }>();
  if (week?.ready) return;
  const now = Date.now();
  await db.prepare('INSERT OR IGNORE INTO map_chest_weeks(prefecture_code, expires_at) VALUES (?, ?)').bind(region.code, expiresAt).run();
  const lease = now + 120000;
  const acquired = await db.prepare('UPDATE map_chest_weeks SET retry_at=? WHERE prefecture_code=? AND expires_at=? AND ready=0 AND retry_at<=?')
    .bind(lease, region.code, expiresAt, now).run();
  if (!acquired.meta.changes) {
    const existing = await db.prepare('SELECT ready FROM map_chest_weeks WHERE prefecture_code=? AND expires_at=?')
      .bind(region.code, expiresAt).first<{ ready: number }>();
    if (existing?.ready) return;
    throw new ChestPlacementError('宝箱を準備しています。少し待って再読み込みしてください。');
  }
  try {
    const cached = await db.prepare(`SELECT candidates_json, candidates_fetched_at FROM map_chest_weeks
      WHERE prefecture_code=? AND expires_at<? AND candidates_fetched_at>=? AND candidates_json IS NOT NULL
      ORDER BY expires_at DESC LIMIT 1`).bind(region.code, expiresAt, now - 28 * DAY)
      .first<{ candidates_json: string; candidates_fetched_at: number }>();
    const candidates: SpotPosition[] = cached ? JSON.parse(cached.candidates_json) : await fetchChestCandidates(region);
    const serializedCandidates = JSON.stringify(candidates);
    const selected: SpotPosition[] = [];
    while (candidates.length && selected.length < 12) {
      const index = Math.floor(Math.random() * candidates.length);
      const [candidate] = candidates.splice(index, 1);
      if (selected.every(other => metresBetween(candidate, other) >= 750)) selected.push(candidate);
    }
    const saved = await db.batch([
      ...selected.map(point => db.prepare(`INSERT INTO map_chests (id, prefecture_code, expires_at, latitude, longitude)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM map_chest_weeks WHERE prefecture_code=? AND expires_at=? AND retry_at=? AND ready=0
        )`).bind(crypto.randomUUID(), region.code, expiresAt, point.latitude, point.longitude, region.code, expiresAt, lease)),
      db.prepare(`UPDATE map_chest_weeks SET ready=1, candidates_json=?, candidates_fetched_at=?
        WHERE prefecture_code=? AND expires_at=? AND retry_at=?`)
        .bind(serializedCandidates, cached?.candidates_fetched_at ?? now, region.code, expiresAt, lease),
      db.prepare(`UPDATE map_chest_weeks SET candidates_json=NULL, candidates_fetched_at=NULL
        WHERE prefecture_code=? AND expires_at<? AND candidates_json IS NOT NULL AND EXISTS (
          SELECT 1 FROM map_chest_weeks WHERE prefecture_code=? AND expires_at=? AND retry_at=? AND ready=1
        )`).bind(region.code, expiresAt, region.code, expiresAt, lease),
    ]);
    if (!saved[selected.length].meta.changes) throw new Error('Placement lease lost');
  } catch {
    throw new ChestPlacementError('公開歩行路のデータを取得できません。２分ほど待って再試行してください。');
  }
}

export async function readChestTier(db: D1Database, sessionId: string, chestId: string) {
  const [chest, trace] = await Promise.all([
    db.prepare('SELECT * FROM map_chests WHERE id=?').bind(chestId).first<ChestRow>(),
    db.prepare(`SELECT latitude, longitude, captured_at FROM running_chest_points
      WHERE session_id=? ORDER BY sequence LIMIT ?`).bind(sessionId, CHEST_MAX_TRACE_POINTS + 1).all<ChestPoint>(),
  ]);
  return chest ? chestTierForTrace(trace.results, chest) : null;
}

export function claimChest(db: D1Database, sessionId: string, userId: string, tier: ChestTier) {
  const rewards = JSON.stringify(CHEST_REWARDS.filter(reward => reward.tier === tier).map(reward => reward.id));
  return db.prepare(`INSERT OR IGNORE INTO map_chest_claims (user_id, chest_id, session_id, tier, reward_id)
    SELECT s.user_id, c.id, s.id, ?, (
      SELECT value FROM json_each(?) AS prize
      WHERE NOT EXISTS (SELECT 1 FROM map_chest_claims WHERE user_id=s.user_id AND reward_id=prize.value)
      ORDER BY random() LIMIT 1
    )
    FROM running_sessions s JOIN map_chests c ON c.id=s.chest_id
    WHERE s.id=? AND s.user_id=? AND s.status='completed' AND s.activity_mode='personal' AND s.distance_m>0
      AND (julianday(s.completed_at)-2440587.5)*86400000<c.expires_at`).bind(tier, rewards, sessionId, userId);
}

export async function chestResult(db: D1Database, userId: string, sessionId: string): Promise<ChestResult | null> {
  const row = await db.prepare('SELECT tier, reward_id FROM map_chest_claims WHERE user_id=? AND session_id=?')
    .bind(userId, sessionId).first();
  return row ? chestResultSchema.parse(row) : null;
}
