import type { D1Database } from '@cloudflare/workers-types';
import { CHEST_MAX_TRACE_POINTS, CHEST_REWARDS, chestResultSchema } from '@my-app/shared';
import type { ChestResult, ChestTier } from '@my-app/shared';
import { chestCandidates } from '../data/chestCandidates';
import { metresBetween, type SpotPosition } from './battleSpots';
import { chestTierForTrace, type ChestPoint } from './mapChestGeometry';
import type { Prefecture } from './prefectureSpots';

const DAY = 86400000;
export function chestWeekEnd(now: number) {
  // Monday 00:00 JST, including at the exact turnover instant.
  const monday = 4 * DAY - 9 * 3600000;
  return monday + (Math.floor((now - monday) / (7 * DAY)) + 1) * 7 * DAY;
}

type ChestRow = SpotPosition & { id: string; expires_at: number };

export async function populateChestWeek(db: D1Database, region: Prefecture, expiresAt: number) {
  const placed = await db.prepare(`SELECT 1 FROM map_chest_weeks w
    WHERE w.prefecture_code=? AND w.expires_at=? AND w.ready=1 AND EXISTS (
      SELECT 1 FROM map_chests c WHERE c.prefecture_code=w.prefecture_code AND c.expires_at=w.expires_at
    )`).bind(region.code, expiresAt).first();
  if (placed) return;

  const pool = chestCandidates[region.code];
  if (!pool?.length) throw new Error('Missing bundled walking loops for ' + region.code);
  const remaining = pool.map(([latitude, longitude]) => ({ latitude, longitude }));
  const selected: SpotPosition[] = [];
  while (remaining.length && selected.length < 12) {
    const index = Math.floor(Math.random() * remaining.length);
    const [candidate] = remaining.splice(index, 1);
    if (selected.every(other => metresBetween(candidate, other) >= 750)) selected.push(candidate);
  }

  // D1 runs this batch as one transaction. A second request will see ready=1
  // and leave the first draw alone. Empty weeks and old retry leases recover
  // immediately, while weeks with existing chests retain their IDs and claims.
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO map_chest_weeks(prefecture_code, expires_at) VALUES (?, ?)').bind(region.code, expiresAt),
    db.prepare(`UPDATE map_chest_weeks SET ready=0 WHERE prefecture_code=? AND expires_at=? AND ready=1
      AND NOT EXISTS (SELECT 1 FROM map_chests WHERE prefecture_code=? AND expires_at=?)`)
      .bind(region.code, expiresAt, region.code, expiresAt),
    ...selected.map(point => db.prepare(`INSERT INTO map_chests (id, prefecture_code, expires_at, latitude, longitude)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM map_chest_weeks WHERE prefecture_code=? AND expires_at=? AND ready=0
      )`).bind(crypto.randomUUID(), region.code, expiresAt, point.latitude, point.longitude, region.code, expiresAt)),
    db.prepare(`UPDATE map_chest_weeks SET ready=1, retry_at=0 WHERE prefecture_code=? AND expires_at=? AND ready=0`)
      .bind(region.code, expiresAt),
  ]);
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
