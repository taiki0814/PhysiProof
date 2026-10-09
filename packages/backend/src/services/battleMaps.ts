import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { area } from '@turf/area';
import type { TeamBattleSummary } from '@my-app/shared';
import { teamBattleSummarySchema } from '@my-app/shared';
import { parseRegion, replayBattleMap, mergeRegions, subtractRegion, timestamp } from './battleMapEngine';
import type { MapRow, MapEvent, MapRules } from './battleMapEngine';

export type BattleRecord = MapRules & { id: string; status: string; cancelled_at: string | null; created_by: string;
  map_rules_version: number; map_revision: number; spots_enabled: number; map_latitude: number | null; map_longitude: number | null;
  map_radius_m: number; distance_points_per_km: number; territory_points_per_1000_sqm: number; scoring_version: 1 | 2;
  spot_scope?: 'radius' | 'prefecture'; prefecture_code?: string | null; prefecture_name?: string | null; spot_bounds_json?: string | null };

export async function canRunBattle(db: D1Database, battleId: string, userId: string, teamId: string) {
  return !!await db.prepare(`SELECT b.id FROM team_battles b
    JOIN team_battle_participants p ON p.battle_id = b.id AND p.team_id = ? AND p.invitation_status = 'accepted'
    JOIN team_battle_members m ON m.battle_id = b.id AND m.team_id = p.team_id AND m.user_id = ?
    WHERE b.id = ? AND b.map_rules_version = 1 AND b.status = 'accepted' AND b.cancelled_at IS NULL
      AND julianday('now') >= julianday(b.starts_at) AND julianday('now') < julianday(b.ends_at)`)
    .bind(teamId, userId, battleId).first();
}

type MapParticipant = { team_id: string; team_name: string; role: string; invitation_status: string; distance_m: number };
type StoredSpot = { id: string; latitude: number; longitude: number };
type RosterRow = { user_id: string; team_id: string };
type Scoped<T> = T & { battle_id: string };

// Batch reads avoid 6 extra D1 queries per history card. Each chunk stays safely
// below D1's parameter limit, and includes only matches already authorised.
export async function loadBattleMaps(db: D1Database, battles: BattleRecord[]) {
  const output = new Map<string, ReturnType<typeof buildBattleMap>>();
  if (!battles.length) return output;
  const clock = await db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS now").first<{ now: string }>();
  const now = timestamp(clock!.now);
  for (let offset = 0; offset < battles.length; offset += 40) {
    const chunk = battles.slice(offset, offset + 40), ids = chunk.map(b => b.id), placeholders = ids.map(() => '?').join(',');
    const [baseline, events, spots, roster, participants] = await Promise.all([
    db.prepare(`SELECT battle_id, territory_id, team_id, geometry_json, area_sqm FROM battle_shared_baselines WHERE battle_id IN (${placeholders})`).bind(...ids).all<Scoped<MapRow>>(),
    db.prepare(`SELECT battle_id, id, kind, territory_id, team_id, user_id, geometry_json, area_sqm, recorded_at FROM battle_map_events WHERE battle_id IN (${placeholders}) ORDER BY recorded_at, id`).bind(...ids).all<Scoped<MapEvent>>(),
    db.prepare(`SELECT battle_id, id, latitude, longitude FROM battle_spots WHERE battle_id IN (${placeholders}) ORDER BY id`).bind(...ids).all<Scoped<StoredSpot>>(),
    db.prepare(`SELECT battle_id, user_id, team_id FROM team_battle_members WHERE battle_id IN (${placeholders})`).bind(...ids).all<Scoped<RosterRow>>(),
    db.prepare(`SELECT p.battle_id, p.team_id, t.name AS team_name, p.role, p.invitation_status,
      COALESCE(SUM(s.distance_m), 0) AS distance_m FROM team_battle_participants p JOIN teams t ON t.id = p.team_id
      LEFT JOIN team_battle_run_scores s ON s.battle_id = p.battle_id AND s.team_id = p.team_id
      WHERE p.battle_id IN (${placeholders}) GROUP BY p.battle_id, p.team_id ORDER BY CASE p.role WHEN 'host' THEN 0 ELSE 1 END, t.name`).bind(...ids).all<Scoped<MapParticipant>>(),
  ]);
    for (const battle of chunk) {
      const select = <T>(rows: Scoped<T>[]) => rows.filter(r => r.battle_id === battle.id);
      output.set(battle.id, buildBattleMap(battle, select(baseline.results), select(events.results), select(spots.results), select(roster.results), select(participants.results), now));
    }
  }
  return output;
}
export async function loadBattleMap(db: D1Database, battle: BattleRecord) {
  return (await loadBattleMaps(db, [battle])).get(battle.id)!;
}
function buildBattleMap(battle: BattleRecord, baseline: MapRow[], events: MapEvent[], spots: StoredSpot[], roster: RosterRow[], participants: MapParticipant[], now: number) {
  const eligible = participants.filter(p => p.invitation_status === 'accepted').map(p => p.team_id);
  const result = replayBattleMap(battle, baseline, battle.status === 'accepted' ? events : [], spots, eligible, roster, now);
  const names = new Map(participants.map(p => [p.team_id, p.team_name]));
  let display_status = battle.cancelled_at ? 'cancelled' : battle.status;
  if (!battle.cancelled_at && battle.status === 'accepted') display_status = now >= timestamp(battle.ends_at) ? 'completed' : now >= timestamp(battle.starts_at) ? 'active' : 'scheduled';
  else if (battle.status === 'pending' && now >= timestamp(battle.starts_at)) display_status = 'expired';
  const summary: TeamBattleSummary = teamBattleSummarySchema.parse({ ...battle, display_status,
    spot_bounds: battle.spot_bounds_json ? JSON.parse(battle.spot_bounds_json) : null,
    spots_enabled: !!battle.spots_enabled, can_cancel: false, can_delete_history: true, spot_count: spots.length,
    participants: participants.map(p => {
      const holding = result.scores.get(p.team_id) ?? { territory_delta_sqm: 0, holding_area_sqm_seconds: 0, holding_points: 0, holding_bonus_points: 0, spot_capture_points: 0, captured_spots: 0 };
      const distance_points = p.distance_m / 1000 * battle.distance_points_per_km;
      const territory_points = holding.territory_delta_sqm / 1000 * battle.territory_points_per_1000_sqm;
      return { ...p, ...holding, distance_points, territory_points, score: distance_points + territory_points + holding.holding_points + holding.holding_bonus_points + holding.spot_capture_points };
    }),
  });
  return { battle: summary, territories: result.territories.map(t => ({ ...t, team_name: names.get(t.team_id) ?? '対戦外チーム' })), spots: result.spots };
}

export function sharedCaptureStatement(db: D1Database, teamId: string, userId: string, geometry: string) {
  return db.prepare(`INSERT INTO battle_map_events (battle_id, kind, team_id, user_id, geometry_json)
    SELECT id, 'capture', ?, ?, ? FROM team_battles
    WHERE map_rules_version = 1 AND map_mode = 'shared' AND status = 'accepted' AND cancelled_at IS NULL
      AND julianday('now') >= julianday(starts_at) AND julianday('now') < julianday(ends_at)`).bind(teamId, userId, geometry);
}

export async function captureIsolated(db: D1Database, battleId: string, teamId: string, userId: string, sessionId: string, raw: string) {
  const incoming = parseRegion(raw);
  if (!Number.isFinite(area(incoming)) || area(incoming) <= 0) throw new Error('領域の面積が不正です。');
  const battle = await db.prepare('SELECT map_revision FROM team_battles WHERE id = ?').bind(battleId).first<{ map_revision: number }>();
  if (!battle) throw new Error('対戦が見つかりません。');
  const rows = await db.prepare('SELECT id AS territory_id, team_id, geometry_json, area_sqm FROM battle_territories WHERE battle_id = ?').bind(battleId).all<MapRow>();
  const own = rows.results.filter(r => r.team_id === teamId);
  const merged = mergeRegions([incoming, ...own.map(r => parseRegion(r.geometry_json))])!;
  const revision = battle.map_revision + 1;
  // A stale concurrent read fails the unique revision guard and rolls back the batch.
  // The NOT NULL PK also rejects an expired/unauthorised claim inside the transaction.
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO battle_map_write_guards (battle_id, revision)
    VALUES ((SELECT b.id FROM team_battles b JOIN team_battle_members m ON m.battle_id = b.id
      JOIN team_battle_participants p ON p.battle_id = b.id AND p.team_id = m.team_id
      WHERE b.id = ? AND b.status = 'accepted' AND b.cancelled_at IS NULL AND b.map_mode = 'isolated'
        AND b.map_revision = ? AND m.team_id = ? AND m.user_id = ? AND p.invitation_status = 'accepted'
        AND julianday('now') >= julianday(b.starts_at) AND julianday('now') < julianday(b.ends_at)), ?)`).bind(battleId, battle.map_revision, teamId, userId, revision),
    db.prepare('INSERT INTO running_territory_claims (running_session_id) VALUES (?)').bind(sessionId)];
  const changes: { id: string; team: string; geometry: string | null; sqm: number }[] = [];
  for (const row of rows.results) {
    if (row.team_id === teamId) changes.push({ id: row.territory_id, team: row.team_id, geometry: null, sqm: 0 });
    else {
      const rest = subtractRegion(parseRegion(row.geometry_json), incoming);
      changes.push({ id: row.territory_id, team: row.team_id, geometry: rest ? JSON.stringify(rest.geometry) : null, sqm: rest ? area(rest) : 0 });
    }
  }
  for (const change of changes) {
    statements.push(change.geometry ? db.prepare('UPDATE battle_territories SET geometry_json = ?, area_sqm = ? WHERE id = ? AND battle_id = ?').bind(change.geometry, change.sqm, change.id, battleId)
      : db.prepare('DELETE FROM battle_territories WHERE id = ? AND battle_id = ?').bind(change.id, battleId));
    statements.push(db.prepare("INSERT INTO battle_map_events (battle_id, kind, territory_id, team_id, geometry_json, area_sqm) VALUES (?, 'territory', ?, ?, ?, ?)").bind(battleId, change.id, change.team, change.geometry, change.sqm));
  }
  const id = crypto.randomUUID();
  statements.push(db.prepare('INSERT INTO battle_territories (id, battle_id, team_id, geometry_json, area_sqm) VALUES (?, ?, ?, ?, ?)').bind(id, battleId, teamId, JSON.stringify(merged.geometry), area(merged)));
  statements.push(db.prepare("INSERT INTO battle_map_events (battle_id, kind, territory_id, team_id, geometry_json, area_sqm) VALUES (?, 'territory', ?, ?, ?, ?)").bind(battleId, id, teamId, JSON.stringify(merged.geometry), area(merged)));
  statements.push(db.prepare("INSERT INTO battle_map_events (battle_id, kind, team_id, user_id, geometry_json) VALUES (?, 'capture', ?, ?, ?)").bind(battleId, teamId, userId, raw));
  statements.push(db.prepare('UPDATE team_battles SET map_revision = ? WHERE id = ?').bind(revision, battleId));
  await db.batch(statements);
  return { success: true, id, battle_id: battleId, message: '専用対戦マップに領域を保存しました。通常マップは変更していません。', newAchievements: [] as string[] };
}
