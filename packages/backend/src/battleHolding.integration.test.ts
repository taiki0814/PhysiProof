import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import { teamBattleSummarySchema } from '@my-app/shared';
import app from './index';
import { sharedCaptureStatement } from './services/battleMaps';
import type { D1Database } from '@cloudflare/workers-types';

// No static node:sqlite import: older Node versions can collect and skip this suite.
type SqlValue = string | number | bigint | null | Uint8Array;
type SqlRow = Record<string, SqlValue>;
interface NativeStatement {
  all(...values: SqlValue[]): SqlRow[];
  get(...values: SqlValue[]): SqlRow | undefined;
  run(...values: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
interface NativeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NativeStatement;
  close(): void;
}
type SQLiteConstructor = new (path: string) => NativeDatabase;
let SQLite: SQLiteConstructor | undefined;
try {
  SQLite = (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: SQLiteConstructor }).DatabaseSync;
} catch (error) {
  const code = (error as { code?: string }).code;
  if (code !== 'ERR_UNKNOWN_BUILTIN_MODULE' && code !== 'MODULE_NOT_FOUND') throw error;
}
const describeSQLite = SQLite ? describe : describe.skip;
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d{4}.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= 32)
  .sort();
const holdingMigration = '0031_add_battle_holding_scores.sql';

// This is a SQL-executing D1 adapter, not a query mock. batch() is one transaction.
class MemoryStatement {
  constructor(readonly db: MemoryD1, readonly sql: string, readonly values: SqlValue[] = []) {}
  bind(...values: SqlValue[]) { return new MemoryStatement(this.db, this.sql, values); }
  async first<T = SqlRow>(column?: string): Promise<T | null> {
    this.db.calls.push({ method: 'first', sql: this.sql });
    const row = this.db.native.prepare(this.sql).get(...this.values);
    return (row ? (column ? row[column] : { ...row }) : null) as T | null;
  }
  async all<T = SqlRow>() {
    this.db.calls.push({ method: 'all', sql: this.sql });
    const results = this.db.native.prepare(this.sql).all(...this.values).map((row) => ({ ...row }));
    this.db.reads.push({ sql: this.sql, results });
    return { success: true, results: results as T[], meta: { changes: 0 } };
  }
  execute() {
    this.db.calls.push({ method: 'run', sql: this.sql });
    const result = this.db.native.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async run() { return this.execute(); }
}
class MemoryD1 {
  readonly calls: Array<{ method: string; sql: string }> = [];
  readonly reads: Array<{ sql: string; results: SqlRow[] }> = [];
  constructor(readonly native: NativeDatabase) {}
  prepare(sql: string) { return new MemoryStatement(this, sql); }
  async batch(statements: MemoryStatement[]) {
    this.calls.push({ method: 'batch', sql: 'BEGIN' });
    this.native.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.execute());
      this.native.exec('COMMIT');
      return results;
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }
}

const teams = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
const users = {
  a: randomUUID(), b: randomUUID(), c: randomUUID(), member: randomUUID(),
  former: randomUUID(), outsider: randomUUID(), admin: randomUUID(), disposable: randomUUID(),
};
const iso = (ms: number) => new Date(ms).toISOString();
const utcMs = (timestamp: string) => Date.parse(timestamp.replace(' ', 'T') + 'Z');
type Coordinates = [number, number][];
const captureCoordinates: Coordinates = [[35, 139], [35, 139.002], [35.002, 139.002], [35.002, 139]];
const polygonArea = (coordinates: Coordinates) => turfArea(turfPolygon([
  [...coordinates.map(([lat, lng]) => [lng, lat]), [coordinates[0][1], coordinates[0][0]]],
]));
type BattleOptions = {
  version?: 1 | 2;
  status?: 'pending' | 'accepted' | 'rejected';
  startsAt?: string;
  endsAt?: string;
  opponents?: string[];
  opponentStatus?: 'pending' | 'accepted' | 'rejected';
  cancelled?: boolean;
};
type AreaEvent = { id: number; battle_id: string; team_id: string; territory_id: string; area_delta_sqm: number; recorded_at: string };
const connections: NativeDatabase[] = [];

class Fixture {
  readonly native: NativeDatabase;
  readonly db: MemoryD1;
  constructor(through = 32) {
    if (!SQLite) throw new Error('node:sqlite unavailable');
    this.native = new SQLite(':memory:');
    connections.push(this.native);
    this.db = new MemoryD1(this.native);
    this.native.exec('PRAGMA foreign_keys = ON');
    // Apply every real migration through 0031 (the repository has no 0019 file),
    // including its synthetic seed rows. Never open a local or remote database.
    for (const name of migrationFiles) {
      if (Number(name.slice(0, 4)) <= through) this.native.exec(readFileSync(`${migrationsDir}/${name}`, 'utf8'));
    }
    for (const [name, id] of Object.entries(users)) {
      this.run('INSERT INTO users (id, login_id, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
        id, id, 'integration-fixture', name, name === 'admin' ? 'admin' : 'user');
    }
    for (const name of ['a', 'b', 'c'] as const) {
      this.run('INSERT INTO teams (id, name, owner_id) VALUES (?, ?, ?)', teams[name], `fixture-${name}`, users[name]);
      this.run('UPDATE users SET team_id = ? WHERE id = ?', teams[name], users[name]);
    }
    for (const user of [users.member, users.former, users.disposable]) {
      this.run('UPDATE users SET team_id = ? WHERE id = ?', teams.a, user);
    }
  }
  run(sql: string, ...values: SqlValue[]) { return this.native.prepare(sql).run(...values); }
  rows(sql: string, ...values: SqlValue[]) { return this.native.prepare(sql).all(...values).map((row) => ({ ...row })); }
  row(sql: string, ...values: SqlValue[]) { return this.rows(sql, ...values)[0]; }
  now() { return utcMs(String(this.row('SELECT CURRENT_TIMESTAMP AS now').now)); }
  changes() { return Number(this.row('SELECT total_changes() AS n').n); }
  count(table: string) { return Number(this.row(`SELECT COUNT(*) AS n FROM ${table}`).n); }
  battle(options: BattleOptions = {}, preHoldingMigration = false) {
    const id = randomUUID();
    const opponents = options.opponents ?? [teams.b];
    const status = options.status ?? 'accepted';
    const startsAt = options.startsAt ?? iso(this.now() - 3600_000);
    const endsAt = options.endsAt ?? iso(this.now() + 3600_000);
    const columns = preHoldingMigration ? '' : ', scoring_version, holding_points_per_1000_sqm_full_period';
    const extra = preHoldingMigration ? '' : ', ?, ?';
    this.run(`INSERT INTO team_battles
      (id, team_a_id, team_b_id, created_by, starts_at, ends_at, status,
       distance_points_per_km, territory_points_per_1000_sqm${columns})
      VALUES (?, ?, ?, ?, ?, ?, ?, 2, 3${extra})`,
      id, teams.a, opponents[0], users.a, startsAt, endsAt, status,
      ...(preHoldingMigration ? [] : [options.version ?? 2, 4]));
    this.run(`INSERT INTO team_battle_participants (battle_id, team_id, role, invitation_status)
      VALUES (?, ?, 'host', 'accepted')`, id, teams.a);
    for (const team of opponents) {
      this.run(`INSERT INTO team_battle_participants (battle_id, team_id, role, invitation_status)
        VALUES (?, ?, 'opponent', ?)`, id, team, options.opponentStatus ?? (status === 'pending' ? 'pending' : 'accepted'));
    }
    if (options.cancelled) this.run('UPDATE team_battles SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ?', id);
    return id;
  }
  territory(area: number, team: string | null = teams.a, id = randomUUID(), user = users.a) {
    this.run(`INSERT INTO territories (id, user_id, team_id, latitude, longitude, area_polygon, area_sqm)
      VALUES (?, ?, ?, 35, 139, ?, ?)`, id, user, team, '[[35,139],[35,139.001],[35.001,139]]', area);
    return id;
  }
  events(battle?: string): AreaEvent[] {
    return this.rows(`SELECT * FROM team_battle_area_events${battle ? ' WHERE battle_id = ?' : ''} ORDER BY id`,
      ...(battle ? [battle] : [])) as unknown as AreaEvent[];
  }
  score(battle: string, distance: number, delta: number, team = teams.a, user = users.a) {
    const session = randomUUID();
    this.run(`INSERT INTO running_sessions
      (id, user_id, activity_mode, team_id, status, distance_m, duration_sec, completed_at)
      VALUES (?, ?, 'team', ?, 'completed', ?, 600, CURRENT_TIMESTAMP)`, session, user, team, distance);
    this.run(`INSERT INTO team_battle_run_scores
      (battle_id, running_session_id, team_id, distance_m, territory_delta_sqm) VALUES (?, ?, ?, ?, ?)`,
      battle, session, team, distance, delta);
    return session;
  }
  roster(battle: string, user = users.former, team = teams.a) {
    this.run('INSERT INTO team_battle_members (battle_id, user_id, team_id) VALUES (?, ?, ?)', battle, user, team);
  }
  completedSession(mode: 'personal' | 'team' = 'team') {
    const id = randomUUID();
    this.run(`INSERT INTO running_sessions
      (id, user_id, activity_mode, team_id, status, distance_m, duration_sec, started_at, completed_at)
      VALUES (?, ?, ?, ?, 'completed', 400, 120, datetime('now', '-2 minutes'), CURRENT_TIMESTAMP)`,
      id, users.a, mode, mode === 'team' ? teams.a : null);
    return id;
  }
  capturePayload(session: string, coordinates = captureCoordinates) {
    return { user_id: users.a, activity_session_id: session, latitude: coordinates[0][0], longitude: coordinates[0][1],
      area_polygon: JSON.stringify(coordinates), area_sqm: polygonArea(coordinates), time_period: 'morning' };
  }
  defender(coordinates = captureCoordinates) {
    const id = this.territory(polygonArea(coordinates), teams.b, randomUUID(), users.b);
    this.run('UPDATE territories SET area_polygon = ? WHERE id = ?', JSON.stringify(coordinates), id);
    return id;
  }
  closedWindow(battle: string, times: number[]) {
    const end = this.now() - 3600_000;
    const start = end - 3600_000;
    this.run('UPDATE team_battles SET starts_at = ?, ends_at = ? WHERE id = ?', iso(start), iso(end), battle);
    const events = this.events(battle);
    expect(events).toHaveLength(times.length);
    // Fixture-only time travel AFTER real ownership triggers fired at server time.
    // App requests never insert/rewrite events or replace CURRENT_TIMESTAMP.
    events.forEach((event, index) => this.run('UPDATE team_battle_area_events SET recorded_at = ? WHERE id = ?',
      iso(start + times[index] * 1000), event.id));
    return { start, end };
  }
  async request(path: string, user: string | null = users.a, method = 'GET', body?: unknown) {
    return app.request(`/api${path}`, {
      method,
      headers: { ...(user ? { Authorization: `Bearer test-token:${user}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, { DB: this.db } as unknown as Parameters<typeof app.request>[2]);
  }
  async list(user = users.a) {
    const before = this.changes();
    const calls = this.db.calls.length;
    // SQLite itself rejects writes, including writes hidden behind a read adapter.
    this.native.exec('PRAGMA query_only = ON');
    try {
      const response = await this.request('/teams/battles', user);
      expect(response.status).toBe(200);
      const result = await response.json() as { success: boolean; battles: unknown[] };
      expect(result.success).toBe(true);
      expect(this.changes()).toBe(before);
      expect(this.db.calls.slice(calls).every((call) => call.method === 'first' || call.method === 'all')).toBe(true);
      return result.battles.map((battle) => teamBattleSummarySchema.parse(battle));
    } finally {
      this.native.exec('PRAGMA query_only = OFF');
    }
  }
}

describeSQLite('battle holding: real migrations, SQLite triggers and Hono API', () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = new Fixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ display_name: 'integration-address' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const connection of connections.splice(0)) connection.close();
  });

  it('applies all actual migrations through 0031 with foreign keys enabled', () => {
    expect(migrationFiles[0]).toBe('0001_initial_schema.sql');
    expect(migrationFiles.at(-1)).toBe('0032_add_battle_maps_and_spots.sql');
    expect(fixture.row('PRAGMA foreign_keys').foreign_keys).toBe(1);
    expect(fixture.rows('PRAGMA foreign_key_check')).toEqual([]);
    expect(fixture.rows("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'battle_area_%'")
      .map((row) => row.name).sort()).toEqual(['battle_area_delete', 'battle_area_insert', 'battle_area_update']);
    expect(fixture.row("SELECT value FROM system_settings WHERE key = 'battle_holding_points_per_1000_sqm_full_period'").value).toBe('1');
  });

  it('preserves pre0031 invitations/history/signed scores as v1 without backfilling holdings', async () => {
    const legacy = new Fixture(30);
    const pending = legacy.battle({ status: 'pending', startsAt: iso(legacy.now() + 3600_000), endsAt: iso(legacy.now() + 7200_000) }, true);
    const active = legacy.battle({}, true);
    const completed = legacy.battle({ startsAt: iso(legacy.now() - 7200_000), endsAt: iso(legacy.now() - 3600_000) }, true);
    legacy.score(active, 2000, -1000);
    legacy.score(completed, 1000, 500);
    legacy.roster(completed);
    legacy.run('INSERT INTO team_battle_hidden_history (battle_id, user_id) VALUES (?, ?)', completed, users.a);
    legacy.territory(5000);
    const battles = legacy.rows('SELECT * FROM team_battles ORDER BY id');
    const participants = legacy.rows('SELECT * FROM team_battle_participants ORDER BY battle_id, team_id');
    const scores = legacy.rows('SELECT * FROM team_battle_run_scores ORDER BY battle_id');
    const history = legacy.rows('SELECT * FROM team_battle_hidden_history');
    legacy.native.exec(readFileSync(`${migrationsDir}/${holdingMigration}`, 'utf8'));
    expect(legacy.rows('SELECT * FROM team_battles ORDER BY id')).toEqual(battles.map((battle) => ({
      ...battle, scoring_version: 1, holding_points_per_1000_sqm_full_period: 1,
    })));
    expect(legacy.rows('SELECT * FROM team_battle_participants ORDER BY battle_id, team_id')).toEqual(participants);
    expect(legacy.rows('SELECT * FROM team_battle_run_scores ORDER BY battle_id')).toEqual(scores);
    expect(legacy.rows('SELECT * FROM team_battle_hidden_history')).toEqual(history);
    expect(legacy.events()).toEqual([]);
    legacy.territory(1000);
    expect(legacy.events()).toEqual([]);
    legacy.native.exec(readFileSync(`${migrationsDir}/0032_add_battle_maps_and_spots.sql`, 'utf8'));
    const listed = await legacy.list();
    expect(listed.map((battle) => battle.id).sort()).toEqual([pending, active].sort());
    expect(listed.find((battle) => battle.id === active)?.participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ distance_points: 4, territory_points: -3, score: 1, holding_points: 0, holding_area_sqm_seconds: 0 });
    const historical = (await legacy.list(users.b)).find((battle) => battle.id === completed)!;
    expect(historical).toMatchObject({ scoring_version: 1, display_status: 'completed' });
    expect(historical.participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ distance_points: 2, territory_points: 1.5, score: 3.5, holding_points: 0 });
  });

  it('accepts an existing v1 invitation through the API without enabling holding', async () => {
    const battle = fixture.battle({ version: 1, status: 'pending', startsAt: iso(fixture.now() + 3600_000), endsAt: iso(fixture.now() + 7200_000) });
    const response = await fixture.request(`/teams/battles/${battle}/accept`, users.b, 'POST');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, battle_ready: true });
    expect(fixture.row('SELECT scoring_version, status FROM team_battles WHERE id = ?', battle))
      .toEqual({ scoring_version: 1, status: 'accepted' });
    fixture.run('UPDATE team_battles SET starts_at = ? WHERE id = ?', iso(fixture.now() - 3600_000), battle);
    fixture.territory(1000);
    expect(fixture.events()).toEqual([]);
    expect((await fixture.list())[0].participants.every((team) => team.holding_points === 0)).toBe(true);
  });

  const createPayload = () => ({ opponent_team_ids: [teams.b, teams.c],
    starts_at: iso(Date.now() + 3600_000), ends_at: iso(Date.now() + 7200_000) });

  it('creates v2 via real transactional SQL and freezes all three settings', async () => {
    fixture.run("UPDATE system_settings SET value = '2' WHERE key = 'battle_distance_points_per_km'");
    fixture.run("UPDATE system_settings SET value = '3' WHERE key = 'battle_territory_points_per_1000_sqm'");
    fixture.run("UPDATE system_settings SET value = '7.5' WHERE key = 'battle_holding_points_per_1000_sqm_full_period'");
    const response = await fixture.request('/teams/battles', users.a, 'POST', createPayload());
    expect(response.status).toBe(200);
    const { battle_id: battle } = await response.json() as { battle_id: string };
    expect(fixture.row(`SELECT scoring_version, distance_points_per_km, territory_points_per_1000_sqm,
      holding_points_per_1000_sqm_full_period FROM team_battles WHERE id = ?`, battle)).toEqual({
      scoring_version: 2, distance_points_per_km: 2, territory_points_per_1000_sqm: 3, holding_points_per_1000_sqm_full_period: 7.5,
    });
    expect(fixture.rows('SELECT invitation_status FROM team_battle_participants WHERE battle_id = ?', battle)
      .map((row) => row.invitation_status).sort()).toEqual(['accepted', 'pending', 'pending']);
    expect(fixture.rows('SELECT user_id FROM team_battle_members WHERE battle_id = ?', battle)
      .map((row) => row.user_id).sort()).toEqual([users.a, users.member, users.former, users.disposable].sort());
    fixture.run("UPDATE system_settings SET value = '99' WHERE key LIKE 'battle_%'");
    const listed = (await fixture.list()).find((item) => item.id === battle)!;
    expect(listed).toMatchObject({ scoring_version: 2, holding_points_per_1000_sqm_full_period: 7.5,
      distance_points_per_km: 2, territory_points_per_1000_sqm: 3, display_status: 'pending', can_cancel: true });
    expect(listed.participants).toHaveLength(3);
    expect(listed.participants.every((team) => team.holding_points === 0)).toBe(true);
    expect(fixture.db.calls.some((call) => call.method === 'batch')).toBe(true);
  });

  const settingsPayload = (holding: string) => ({ max_territories: '123',
    battle_distance_points_per_km: '2', battle_territory_points_per_1000_sqm: '3',
    battle_holding_points_per_1000_sqm_full_period: holding });

  it('persists an admin holding-rate change through the API while an existing invitation stays frozen', async () => {
    const existingResponse = await fixture.request('/teams/battles', users.a, 'POST', createPayload());
    expect(existingResponse.status).toBe(200);
    const { battle_id: existing } = await existingResponse.json() as { battle_id: string };
    const invitation = fixture.row('SELECT * FROM team_battles WHERE id = ?', existing);
    expect(invitation.holding_points_per_1000_sqm_full_period).toBe(1);

    const response = await fixture.request('/admin/settings', users.admin, 'POST', settingsPayload('7.5'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(fixture.row("SELECT value FROM system_settings WHERE key = 'battle_holding_points_per_1000_sqm_full_period'").value).toBe('7.5');
    const read = await fixture.request('/admin/settings', users.admin);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ settings: { battle_holding_points_per_1000_sqm_full_period: '7.5' } });
    expect(fixture.row('SELECT * FROM team_battles WHERE id = ?', existing)).toEqual(invitation);

    const nextResponse = await fixture.request('/teams/battles', users.a, 'POST', createPayload());
    expect(nextResponse.status).toBe(200);
    const { battle_id: next } = await nextResponse.json() as { battle_id: string };
    const listed = await fixture.list();
    expect(listed.find((battle) => battle.id === existing))
      .toMatchObject({ display_status: 'pending', scoring_version: 2, holding_points_per_1000_sqm_full_period: 1 });
    expect(listed.find((battle) => battle.id === next))
      .toMatchObject({ display_status: 'pending', scoring_version: 2, holding_points_per_1000_sqm_full_period: 7.5 });
  });

  it.each([
    { label: 'unauthenticated', user: null, value: '7.5', status: 401 },
    { label: 'non-admin', user: users.member, value: '7.5', status: 403 },
    { label: 'unknown user', user: randomUUID(), value: '7.5', status: 403 },
    { label: 'zero', user: users.admin, value: '0', status: 400 },
    { label: 'negative', user: users.admin, value: '-1', status: 400 },
    { label: 'NaN', user: users.admin, value: 'NaN', status: 400 },
    { label: 'positive infinity', user: users.admin, value: 'Infinity', status: 400 },
    { label: 'negative infinity', user: users.admin, value: '-Infinity', status: 400 },
    // Valid decimal syntax whose numeric value is non-finite: exercises the finite refinement.
    { label: 'decimal overflow', user: users.admin, value: '9'.repeat(400), status: 400 },
  ])('rejects admin settings from/with $label without persisting any setting', async ({ user, value, status }) => {
    const settings = fixture.rows('SELECT * FROM system_settings ORDER BY key');
    const before = fixture.changes();
    const calls = fixture.db.calls.length;
    const response = await fixture.request('/admin/settings', user, 'POST', settingsPayload(value));
    expect(response.status).toBe(status);
    expect(fixture.changes()).toBe(before);
    expect(fixture.rows('SELECT * FROM system_settings ORDER BY key')).toEqual(settings);
    expect(fixture.db.calls.slice(calls).every((call) => call.method === 'first' || call.method === 'all')).toBe(true);
  });

  it.each([undefined, '0', '-2', 'Infinity', 'invalid'])('defaults an absent/invalid holding setting (%s) to 1', async (value) => {
    if (value === undefined) fixture.run("DELETE FROM system_settings WHERE key = 'battle_holding_points_per_1000_sqm_full_period'");
    else fixture.run("UPDATE system_settings SET value = ? WHERE key = 'battle_holding_points_per_1000_sqm_full_period'", value);
    const response = await fixture.request('/teams/battles', users.a, 'POST', createPayload());
    expect(response.status).toBe(200);
    expect(fixture.row('SELECT holding_points_per_1000_sqm_full_period AS rate FROM team_battles').rate).toBe(1);
  });

  it.each([['unauthenticated', null, 401], ['ordinary member', users.member, 403], ['no team', users.outsider, 403]] as const)
    ('rejects v2 create from %s without DB mutations', async (_label, user, status) => {
      const before = fixture.changes();
      const response = await fixture.request('/teams/battles', user, 'POST', createPayload());
      expect(response.status).toBe(status);
      expect(fixture.changes()).toBe(before);
      expect(fixture.count('team_battles')).toBe(0);
    });

  it.each(['self', 'missing opponent', 'past start'] as const)('rejects create with %s without partial invitations', async (invalid) => {
    const payload = createPayload();
    if (invalid === 'self') payload.opponent_team_ids = [teams.a];
    if (invalid === 'missing opponent') payload.opponent_team_ids = [randomUUID()];
    if (invalid === 'past start') payload.starts_at = iso(fixture.now() - 3600_000);
    const before = fixture.changes();
    expect((await fixture.request('/teams/battles', users.a, 'POST', payload)).status).toBe(invalid === 'missing opponent' ? 404 : 400);
    expect(fixture.changes()).toBe(before);
    expect(fixture.count('team_battle_participants')).toBe(0);
  });

  it('requires all opponent acceptances before a v2 battle is eligible', async () => {
    const response = await fixture.request('/teams/battles', users.a, 'POST', createPayload());
    const { battle_id: battle } = await response.json() as { battle_id: string };
    expect((await fixture.request(`/teams/battles/${battle}/accept`, users.member, 'POST')).status).toBe(403);
    const first = await fixture.request(`/teams/battles/${battle}/accept`, users.b, 'POST');
    expect(await first.json()).toEqual({ success: true, battle_ready: false });
    expect(fixture.row('SELECT status FROM team_battles WHERE id = ?', battle).status).toBe('pending');
    fixture.territory(1000);
    expect(fixture.events()).toEqual([]);
    const last = await fixture.request(`/teams/battles/${battle}/accept`, users.c, 'POST');
    expect(await last.json()).toEqual({ success: true, battle_ready: true });
    fixture.territory(1000);
    expect(fixture.events()).toEqual([]); // Accepted, but still before the scheduled start.
    fixture.run('UPDATE team_battles SET starts_at = ? WHERE id = ?', iso(fixture.now() - 3600_000), battle);
    fixture.territory(1000, teams.c);
    expect(fixture.events(battle).map((event) => [event.team_id, event.area_delta_sqm])).toEqual([[teams.c, 1000]]);
    expect((await fixture.request(`/teams/battles/${battle}/accept`, users.c, 'POST')).status).toBe(409);
  });

  it.each(['pending', 'rejected', 'cancelled', 'before start', 'after end', 'v1', 'unaccepted participant', 'rejected participant'] as const)
    ('excludes insert/update/delete events for %s', (excluded) => {
      const options: BattleOptions = {};
      if (excluded === 'pending' || excluded === 'rejected') options.status = excluded;
      if (excluded === 'cancelled') options.cancelled = true;
      if (excluded === 'before start') { options.startsAt = iso(fixture.now() + 3600_000); options.endsAt = iso(fixture.now() + 7200_000); }
      if (excluded === 'after end') { options.startsAt = iso(fixture.now() - 7200_000); options.endsAt = iso(fixture.now() - 3600_000); }
      if (excluded === 'v1') options.version = 1;
      if (excluded === 'unaccepted participant') options.opponentStatus = 'pending';
      if (excluded === 'rejected participant') options.opponentStatus = 'rejected';
      const battle = fixture.battle(options);
      const territory = fixture.territory(1000, teams.b);
      fixture.run('UPDATE territories SET area_sqm = 600 WHERE id = ?', territory);
      fixture.run('DELETE FROM territories WHERE id = ?', territory);
      expect(fixture.events(battle)).toEqual([]);
    });

  it('uses start-inclusive/end-exclusive server-second boundaries for trigger writes', () => {
    const startBattle = fixture.battle();
    const endBattle = fixture.battle();
    // Test-only BEFORE trigger positions both windows at CURRENT_TIMESTAMP in
    // the SAME sqlite3_step as the ownership write, avoiding second-rollover races.
    fixture.native.exec(`CREATE TEMP TRIGGER fixture_exact_boundaries BEFORE INSERT ON territories BEGIN
      UPDATE team_battles SET starts_at = CURRENT_TIMESTAMP, ends_at = datetime('now', '+1 hour') WHERE id = '${startBattle}';
      UPDATE team_battles SET starts_at = datetime('now', '-1 hour'), ends_at = CURRENT_TIMESTAMP WHERE id = '${endBattle}';
    END;`);
    fixture.territory(1000);
    expect(fixture.events(startBattle)).toHaveLength(1);
    expect(fixture.events(startBattle)[0].recorded_at).toBe(fixture.row('SELECT starts_at FROM team_battles WHERE id = ?', startBattle).starts_at);
    expect(fixture.events(endBattle)).toEqual([]);
  });

  it('excludes personal, zero-area, no-op and unrelated metadata mutations', () => {
    fixture.battle();
    const personal = fixture.territory(1000, null);
    fixture.run('UPDATE territories SET area_sqm = 500 WHERE id = ?', personal);
    fixture.run('DELETE FROM territories WHERE id = ?', personal);
    const zero = fixture.territory(0);
    fixture.run('DELETE FROM territories WHERE id = ?', zero);
    const team = fixture.territory(1000);
    const events = fixture.events();
    fixture.run('UPDATE territories SET area_sqm = area_sqm, team_id = team_id WHERE id = ?', team);
    fixture.run("UPDATE territories SET address = 'fixture address', ai_integrity = 'valid' WHERE id = ?", team);
    expect(fixture.events()).toEqual(events);
  });

  it('records insert, growth, partial loss and full deletion independently of territory lifetime', () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    fixture.run('UPDATE territories SET area_sqm = 1500 WHERE id = ?', territory);
    fixture.run('UPDATE territories SET area_sqm = 600 WHERE id = ?', territory);
    fixture.run('DELETE FROM territories WHERE id = ?', territory);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([1000, 500, -900, -600]);
    expect(fixture.events(battle).every((event) => event.territory_id === territory)).toBe(true);
    expect(fixture.row('SELECT id FROM territories WHERE id = ?', territory)).toBeUndefined();
    expect(fixture.rows('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('records both sides of team/area transfer and team-personal conversions', () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    fixture.run('UPDATE territories SET team_id = ?, area_sqm = 700 WHERE id = ?', teams.b, territory);
    fixture.run('UPDATE territories SET team_id = NULL WHERE id = ?', territory);
    fixture.run('UPDATE territories SET team_id = ?, area_sqm = 800 WHERE id = ?', teams.a, territory);
    expect(fixture.events(battle).map((event) => [event.team_id, event.area_delta_sqm])).toEqual([
      [teams.a, 1000], [teams.a, -1000], [teams.b, 700], [teams.b, -700], [teams.a, 800],
    ]);
  });

  it('fans out an ownership change only to eligible simultaneous battles', () => {
    const first = fixture.battle();
    const second = fixture.battle({ opponents: [teams.c] });
    const legacy = fixture.battle({ version: 1 });
    const future = fixture.battle({ startsAt: iso(fixture.now() + 3600_000), endsAt: iso(fixture.now() + 7200_000) });
    const territory = fixture.territory(1000);
    fixture.run('UPDATE territories SET team_id = ? WHERE id = ?', teams.b, territory);
    expect(fixture.events(first).map((event) => [event.team_id, event.area_delta_sqm]))
      .toEqual([[teams.a, 1000], [teams.a, -1000], [teams.b, 1000]]);
    expect(fixture.events(second).map((event) => [event.team_id, event.area_delta_sqm]))
      .toEqual([[teams.a, 1000], [teams.a, -1000]]);
    expect(fixture.events(legacy)).toEqual([]);
    expect(fixture.events(future)).toEqual([]);
  });

  it('keeps same-team merge net area unchanged and folds events in the same second', async () => {
    const battle = fixture.battle();
    const first = fixture.territory(600);
    const second = fixture.territory(400);
    await fixture.db.batch([
      fixture.db.prepare('DELETE FROM territories WHERE id = ?').bind(second),
      fixture.db.prepare('UPDATE territories SET area_sqm = 1000 WHERE id = ?').bind(first),
    ]);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([600, 400, -400, 400]);
    fixture.closedWindow(battle, [0, 0, 1800, 1800]);
    const participant = (await fixture.list())[0].participants.find((team) => team.team_id === teams.a)!;
    expect(participant).toMatchObject({ territory_delta_sqm: 1000, territory_points: 3,
      holding_area_sqm_seconds: 3600_000, holding_points: 4, score: 7 });
  });

  it('folds a same-second acquisition and full loss without phantom holding', async () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    fixture.run('DELETE FROM territories WHERE id = ?', territory);
    fixture.closedWindow(battle, [1800, 1800]);
    expect((await fixture.list())[0].participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ territory_delta_sqm: 0, holding_area_sqm_seconds: 0, holding_points: 0, score: 0 });
  });

  it('keeps a net-zero merge of baseline territory at zero rather than creating holding', async () => {
    const first = fixture.territory(600);
    const second = fixture.territory(400);
    const battle = fixture.battle();
    await fixture.db.batch([
      fixture.db.prepare('DELETE FROM territories WHERE id = ?').bind(second),
      fixture.db.prepare('UPDATE territories SET area_sqm = 1000 WHERE id = ?').bind(first),
    ]);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([-400, 400]);
    fixture.closedWindow(battle, [1800, 1800]);
    expect((await fixture.list())[0].participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ territory_delta_sqm: 0, holding_area_sqm_seconds: 0, holding_points: 0, score: 0 });
  });

  it('lists distance + event-based territory + holding without double-counting v2 run deltas', async () => {
    const battle = fixture.battle();
    fixture.score(battle, 2000, 999999);
    const territory = fixture.territory(1000);
    fixture.run('UPDATE territories SET area_sqm = 500 WHERE id = ?', territory);
    fixture.closedWindow(battle, [0, 1800]);
    const listed = (await fixture.list())[0];
    expect(listed).toMatchObject({ scoring_version: 2, display_status: 'completed' });
    expect(listed.participants.find((team) => team.team_id === teams.a)).toMatchObject({
      distance_m: 2000, distance_points: 4, territory_delta_sqm: 500, territory_points: 1.5,
      holding_area_sqm_seconds: 2700_000, holding_points: 3, score: 8.5,
    });
    expect(listed.participants.find((team) => team.team_id === teams.b))
      .toMatchObject({ distance_points: 0, territory_points: 0, holding_points: 0, score: 0 });
  });

  it('preserves earned holding after complete loss and freezes it at battle end across refreshes', async () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    fixture.run('DELETE FROM territories WHERE id = ?', territory);
    fixture.closedWindow(battle, [0, 1800]);
    const events = fixture.events();
    const before = await fixture.list();
    expect(before[0].participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ territory_delta_sqm: 0, territory_points: 0, holding_area_sqm_seconds: 1800_000, holding_points: 2, score: 2 });
    fixture.territory(9000); // Real trigger write AFTER end: no new battle event.
    expect(fixture.events()).toEqual(events);
    expect(await fixture.list()).toEqual(before);
    expect(await fixture.list()).toEqual(before);
    expect(fixture.events()).toEqual(events);
  });

  it('lists retained holding after full loss and later recapture without crediting the lost interval', async () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    fixture.run('DELETE FROM territories WHERE id = ?', territory);
    fixture.territory(1000);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([1000, -1000, 1000]);
    // Fixture-only timing after all three real triggers fired: held 900s, lost 1800s,
    // then held 900s. Each held interval earns 1 point at the frozen full-period rate 4.
    fixture.closedWindow(battle, [0, 900, 2700]);
    const listed = await fixture.list();
    expect(listed[0]).toMatchObject({ scoring_version: 2, display_status: 'completed' });
    expect(listed[0].participants.find((team) => team.team_id === teams.a)).toMatchObject({
      territory_delta_sqm: 1000, territory_points: 3,
      holding_area_sqm_seconds: 1800_000, holding_points: 2, score: 5,
    });
    expect(await fixture.list()).toEqual(listed);
  });

  it('does not award pre-existing area and retains signed baseline losses without negative holding', async () => {
    const territory = fixture.territory(2000);
    const battle = fixture.battle();
    expect(fixture.events(battle)).toEqual([]);
    fixture.run('DELETE FROM territories WHERE id = ?', territory);
    fixture.closedWindow(battle, [1800]);
    expect((await fixture.list())[0].participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ territory_delta_sqm: -2000, territory_points: -6, holding_points: 0, score: -6 });
  });

  it('clips fixture events at exact start/end and ignores future events in the actual list API', async () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    fixture.run('UPDATE territories SET area_sqm = 2000 WHERE id = ?', territory);
    fixture.run('UPDATE territories SET area_sqm = 3000 WHERE id = ?', territory);
    fixture.run('UPDATE territories SET area_sqm = 4000 WHERE id = ?', territory);
    fixture.closedWindow(battle, [-1, 0, 3600, 3601]);
    expect((await fixture.list())[0].participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ territory_delta_sqm: 1000, holding_area_sqm_seconds: 3600_000, holding_points: 4, territory_points: 3, score: 7 });
  });

  it('enforces current-team/roster visibility and per-user hidden history without read writes', async () => {
    const battle = fixture.battle();
    fixture.roster(battle);
    fixture.run('UPDATE users SET team_id = NULL WHERE id = ?', users.former);
    fixture.territory(1000);
    fixture.closedWindow(battle, [0]);
    expect((await fixture.list(users.a)).map((item) => item.id)).toEqual([battle]);
    expect((await fixture.list(users.b)).map((item) => item.id)).toEqual([battle]);
    expect((await fixture.list(users.former)).map((item) => item.id)).toEqual([battle]);
    expect(await fixture.list(users.c)).toEqual([]);
    expect(fixture.db.reads.filter((read) => read.sql.includes('FROM team_battle_area_events')).at(-1)?.results).toEqual([]);
    expect(await fixture.list(users.outsider)).toEqual([]);
    expect(fixture.db.reads.filter((read) => read.sql.includes('FROM team_battle_area_events')).at(-1)?.results).toEqual([]);
    const events = fixture.events();
    expect((await fixture.request(`/teams/battles/${battle}/history`, users.outsider, 'DELETE')).status).toBe(404);
    expect((await fixture.request(`/teams/battles/${battle}/history`, users.a, 'DELETE')).status).toBe(200);
    expect((await fixture.request(`/teams/battles/${battle}/history`, users.a, 'DELETE')).status).toBe(200);
    expect(fixture.count('team_battle_hidden_history')).toBe(1);
    expect(await fixture.list(users.a)).toEqual([]);
    expect(fixture.db.reads.filter((read) => read.sql.includes('FROM team_battle_area_events')).at(-1)?.results).toEqual([]);
    expect(await fixture.list(users.b)).toHaveLength(1);
    expect(fixture.db.reads.filter((read) => read.sql.includes('FROM team_battle_area_events')).at(-1)?.results).toHaveLength(1);
    expect(await fixture.list(users.former)).toHaveLength(1);
    expect(fixture.events()).toEqual(events);
    const hiddenQueries = fixture.db.calls.filter((call) => call.method === 'all' && call.sql.includes('FROM team_battle_area_events'));
    expect(hiddenQueries.length).toBeGreaterThan(0);
  });

  it('records real admin territory deletion and rejects a non-admin without events', async () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    expect((await fixture.request(`/admin/territories/${territory}`, users.member, 'DELETE')).status).toBe(403);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([1000]);
    expect((await fixture.request(`/admin/territories/${territory}`, users.admin, 'DELETE')).status).toBe(200);
    expect((await fixture.request(`/admin/territories/${territory}`, users.admin, 'DELETE')).status).toBe(200);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([1000, -1000]);
  });

  it('keeps ownership events after an admin deletes their creator and cascades run scores', async () => {
    const battle = fixture.battle();
    fixture.territory(1000, teams.a, randomUUID(), users.disposable);
    fixture.score(battle, 2000, 1000, teams.a, users.disposable);
    expect((await fixture.request(`/admin/users/${users.disposable}`, users.admin, 'DELETE')).status).toBe(200);
    expect(fixture.row('SELECT id FROM users WHERE id = ?', users.disposable)).toBeUndefined();
    expect(fixture.count('running_sessions')).toBe(0);
    expect(fixture.count('team_battle_run_scores')).toBe(0);
    expect(fixture.events(battle).map((event) => event.area_delta_sqm)).toEqual([1000, -1000]);
    fixture.closedWindow(battle, [0, 1800]);
    expect((await fixture.list())[0].participants.find((team) => team.team_id === teams.a))
      .toMatchObject({ holding_points: 2, territory_delta_sqm: 0, distance_points: 0, score: 2 });
    expect(fixture.rows('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rolls back territory mutations and their trigger events on a later batch FK failure', async () => {
    const battle = fixture.battle();
    const territory = fixture.territory(1000);
    const events = fixture.events();
    await expect(fixture.db.batch([
      fixture.db.prepare('UPDATE territories SET area_sqm = 500 WHERE id = ?').bind(territory),
      fixture.db.prepare('DELETE FROM territories WHERE id = ?').bind(territory),
      fixture.db.prepare(`INSERT INTO team_battle_area_events (battle_id, team_id, territory_id, area_delta_sqm)
        VALUES (?, ?, ?, 1)`).bind(randomUUID(), teams.a, territory),
    ])).rejects.toThrow(/FOREIGN KEY/);
    expect(fixture.row('SELECT area_sqm FROM territories WHERE id = ?', territory).area_sqm).toBe(1000);
    expect(fixture.events(battle)).toEqual(events);
    expect(fixture.rows('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('atomically rolls back a transfer when the new team violates its FK', () => {
    fixture.battle();
    const territory = fixture.territory(1000);
    const events = fixture.events();
    expect(() => fixture.run('UPDATE territories SET team_id = ?, area_sqm = 700 WHERE id = ?', randomUUID(), territory)).toThrow(/FOREIGN KEY/);
    expect(fixture.row('SELECT team_id, area_sqm FROM territories WHERE id = ?', territory)).toEqual({ team_id: teams.a, area_sqm: 1000 });
    expect(fixture.events()).toEqual(events);
  });

  it('rolls back actual admin deletion and trigger events when a roster FK blocks user deletion', async () => {
    const battle = fixture.battle();
    fixture.roster(battle, users.disposable);
    const territory = fixture.territory(1000, teams.a, randomUUID(), users.disposable);
    const events = fixture.events();
    expect((await fixture.request(`/admin/users/${users.disposable}`, users.admin, 'DELETE')).status).toBe(500);
    expect(fixture.row('SELECT id FROM users WHERE id = ?', users.disposable).id).toBe(users.disposable);
    expect(fixture.row('SELECT area_sqm FROM territories WHERE id = ?', territory).area_sqm).toBe(1000);
    expect(fixture.events()).toEqual(events);
  });

  it('rolls back v2 creation when an invitation insert fails inside the actual API batch', async () => {
    // Test-only failure injection; the real API performs the transaction/rollback.
    fixture.native.exec(`CREATE TEMP TRIGGER fixture_fail_invitation BEFORE INSERT ON team_battle_participants
      WHEN NEW.team_id = '${teams.c}' BEGIN SELECT RAISE(ABORT, 'fixture invitation failure'); END;`);
    expect((await fixture.request('/teams/battles', users.a, 'POST', createPayload())).status).toBe(500);
    expect(fixture.count('team_battles')).toBe(0);
    expect(fixture.count('team_battle_participants')).toBe(0);
    expect(fixture.count('team_battle_members')).toBe(0);
    expect(fixture.events()).toEqual([]);
  });

  it('captures through the real route once, uses only the v2 ledger, and rejects replay before geocoding', async () => {
    const defender = fixture.defender();
    const v2 = fixture.battle();
    const v1 = fixture.battle({ version: 1 });
    const session = fixture.completedSession();
    const payload = fixture.capturePayload(session);
    const response = await fixture.request('/territories', users.a, 'POST', payload);
    expect(response.status).toBe(200);
    expect(fixture.row('SELECT id FROM territories WHERE id = ?', defender)).toBeUndefined();
    expect(fixture.rows('SELECT running_session_id FROM running_territory_claims')).toEqual([{ running_session_id: session }]);
    const area = polygonArea(captureCoordinates);
    expect(fixture.events(v2).map((event) => [event.team_id, event.area_delta_sqm])).toEqual([[teams.b, -area], [teams.a, area]]);
    expect(fixture.events(v1)).toEqual([]);
    expect(fixture.rows('SELECT territory_delta_sqm FROM team_battle_run_scores WHERE battle_id = ?', v2)).toEqual([]);
    expect(fixture.rows('SELECT team_id, territory_delta_sqm FROM team_battle_run_scores WHERE battle_id = ? ORDER BY team_id', v1))
      .toEqual([{ team_id: teams.a, territory_delta_sqm: area }, { team_id: teams.b, territory_delta_sqm: -area }]
        .sort((left, right) => left.team_id.localeCompare(right.team_id)));
    const before = fixture.changes();
    const events = fixture.events();
    const territories = fixture.rows('SELECT * FROM territories ORDER BY id');
    const fetchCount = vi.mocked(fetch).mock.calls.length;
    expect((await fixture.request('/territories', users.a, 'POST', payload)).status).toBe(409);
    expect((await fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session,
      [[36, 140], [36, 140.002], [36.002, 140.002], [36.002, 140]]))).status).toBe(409);
    expect(fixture.changes()).toBe(before);
    expect(fixture.events()).toEqual(events);
    expect(fixture.rows('SELECT * FROM territories ORDER BY id')).toEqual(territories);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(fetchCount);
  });

  it('captures a partial defender loss via actual SQL in the same claim transaction', async () => {
    const defender = fixture.defender();
    const oldArea = polygonArea(captureCoordinates);
    const battle = fixture.battle();
    const session = fixture.completedSession();
    const half: Coordinates = [[35, 139], [35, 139.001], [35.002, 139.001], [35.002, 139]];
    const response = await fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session, half));
    expect(response.status).toBe(200);
    const remaining = Number(fixture.row('SELECT area_sqm FROM territories WHERE id = ?', defender).area_sqm);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(oldArea);
    const defenderEvents = fixture.events(battle).filter((event) => event.team_id === teams.b);
    expect(defenderEvents).toHaveLength(1);
    expect(defenderEvents[0].area_delta_sqm).toBeCloseTo(remaining - oldArea, 6);
    expect(fixture.events(battle).find((event) => event.team_id === teams.a)?.area_delta_sqm).toBeCloseTo(polygonArea(half), 6);
    expect(fixture.count('running_territory_claims')).toBe(1);
  });

  it('rejects the area limit without changing defender, ledger, claim, scores, notices or XP', async () => {
    fixture.defender();
    fixture.battle();
    fixture.battle({ version: 1 });
    const session = fixture.completedSession();
    fixture.run("UPDATE system_settings SET value = '0' WHERE key = 'max_territories'");
    const territories = fixture.rows('SELECT * FROM territories ORDER BY id');
    const events = fixture.events();
    const before = fixture.changes();
    const response = await fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session));
    expect(response.status).toBe(400);
    expect(fixture.changes()).toBe(before);
    expect(fixture.rows('SELECT * FROM territories ORDER BY id')).toEqual(territories);
    expect(fixture.events()).toEqual(events);
    expect(fixture.count('running_territory_claims')).toBe(0);
    expect(fixture.count('team_battle_run_scores')).toBe(0);
    expect(fixture.count('notifications')).toBe(0);
    expect(fixture.row('SELECT xp FROM users WHERE id = ?', users.a).xp).toBe(0);
  });

  it('rolls back the claim and defender/ledger changes when winner insertion fails', async () => {
    fixture.defender();
    fixture.battle();
    const session = fixture.completedSession();
    const territories = fixture.rows('SELECT * FROM territories ORDER BY id');
    const events = fixture.events();
    // The failure occurs AFTER claim INSERT and defender DELETE inside the API batch.
    fixture.native.exec(`CREATE TEMP TRIGGER fixture_fail_capture BEFORE INSERT ON territories
      WHEN NEW.team_id = '${teams.a}' BEGIN SELECT RAISE(ABORT, 'fixture capture failure'); END;`);
    expect((await fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session))).status).toBe(500);
    expect(fixture.rows('SELECT * FROM territories ORDER BY id')).toEqual(territories);
    expect(fixture.events()).toEqual(events);
    expect(fixture.count('running_territory_claims')).toBe(0);
    expect(fixture.count('notifications')).toBe(0);
    expect(fixture.rows('PRAGMA foreign_key_check')).toEqual([]);
    fixture.native.exec('DROP TRIGGER fixture_fail_capture');
    expect((await fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session))).status).toBe(200);
    expect(fixture.count('running_territory_claims')).toBe(1);
  });

  it('lets only one concurrent capture claim win and returns 409 for the unique-key loser', async () => {
    fixture.defender();
    const battle = fixture.battle();
    const session = fixture.completedSession();
    let arrivals = 0;
    let release!: () => void;
    const bothReady = new Promise<void>((resolve) => { release = resolve; });
    const batch = fixture.db.batch.bind(fixture.db);
    vi.spyOn(fixture.db, 'batch').mockImplementation(async (statements) => {
      if (statements[0]?.sql.includes('INSERT INTO running_territory_claims')) {
        // Hold both real requests AFTER their prechecks, BEFORE either transaction.
        arrivals += 1;
        if (arrivals === 2) release();
        await bothReady;
      }
      return batch(statements);
    });
    const responses = await Promise.all([
      fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session)),
      fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(arrivals).toBe(2);
    expect(fixture.count('running_territory_claims')).toBe(1);
    expect(fixture.count('territories')).toBe(1);
    expect(fixture.events(battle).map((event) => event.team_id)).toEqual([teams.b, teams.a]);
    expect(fixture.rows("SELECT id FROM notifications WHERE type = 'territory_lost' AND user_id = ?", users.b)).toHaveLength(1);
    expect(fixture.rows('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rolls back an earlier ownership/event write when a duplicate claim fails in a batch', async () => {
    fixture.battle();
    const territory = fixture.territory(1000);
    const session = fixture.completedSession();
    fixture.run('INSERT INTO running_territory_claims (running_session_id) VALUES (?)', session);
    const events = fixture.events();
    await expect(fixture.db.batch([
      fixture.db.prepare('DELETE FROM territories WHERE id = ?').bind(territory),
      fixture.db.prepare('INSERT INTO running_territory_claims (running_session_id) VALUES (?)').bind(session),
    ])).rejects.toThrow(/UNIQUE/);
    expect(fixture.row('SELECT area_sqm FROM territories WHERE id = ?', territory).area_sqm).toBe(1000);
    expect(fixture.events()).toEqual(events);
    expect(fixture.count('running_territory_claims')).toBe(1);
  });

  it('finalizes a personal capture without touching the team layer or battle events', async () => {
    const defender = fixture.defender();
    fixture.battle();
    const before = fixture.row('SELECT * FROM territories WHERE id = ?', defender);
    const session = fixture.completedSession('personal');
    expect((await fixture.request('/territories', users.a, 'POST', fixture.capturePayload(session))).status).toBe(200);
    expect(fixture.row('SELECT * FROM territories WHERE id = ?', defender)).toEqual(before);
    expect(fixture.rows('SELECT team_id FROM territories WHERE user_id = ?', users.a)).toEqual([{ team_id: null }]);
    expect(fixture.events()).toEqual([]);
    expect(fixture.count('team_battle_run_scores')).toBe(0);
    expect(fixture.count('running_territory_claims')).toBe(1);
  });
});

describeSQLite('isolated/shared battle maps: transactional API and real migration 0032', () => {
  let f: Fixture;
  const newBattle = (mode: 'isolated' | 'shared' = 'isolated') => {
    const id = f.battle();
    f.run("UPDATE team_battles SET map_rules_version = 1, map_mode = ?, spots_enabled = 1, spot_capture_points = .2 WHERE id = ?", mode, id);
    f.roster(id, users.a, teams.a); f.roster(id, users.b, teams.b); f.roster(id, users.member, teams.a);
    f.run('INSERT INTO battle_spots (id,battle_id,latitude,longitude) VALUES (?,?,35.001,139.001)', randomUUID(), id);
    return id;
  };
  const capture = async (battle: string, coords = captureCoordinates, user = users.a, team = teams.a) => {
    const session = randomUUID();
    f.run(`INSERT INTO running_sessions (id,user_id,activity_mode,team_id,battle_id,status,distance_m,duration_sec,started_at,completed_at)
      VALUES (?,?,'team',?,?,'completed',400,120,datetime('now','-2 minutes'),CURRENT_TIMESTAMP)`, session, user, team, battle);
    return { session, response: await f.request('/territories', user, 'POST', { ...f.capturePayload(session, coords), user_id: user }) };
  };
  beforeEach(() => {
    f = new Fixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ display_name: 'fixture' }))));
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    for (const connection of connections.splice(0)) connection.close();
  });
  it('creates a new isolated invitation and keeps old rows on their original rules', async () => {
    const legacy = f.battle({ version: 1 });
    const response = await f.request('/teams/battles', users.a, 'POST', { opponent_team_ids: [teams.b], starts_at: iso(Date.now() + 3600000), ends_at: iso(Date.now() + 7200000), map_mode: 'isolated', spots_enabled: false });
    expect(response.status).toBe(200);
    const data = await response.json() as { battle_id: string };
    expect(f.row('SELECT map_mode,map_rules_version,spots_enabled FROM team_battles WHERE id=?', data.battle_id)).toEqual({ map_mode: 'isolated', map_rules_version: 1, spots_enabled: 0 });
    expect(f.row('SELECT scoring_version,map_rules_version FROM team_battles WHERE id=?', legacy)).toEqual({ scoring_version: 1, map_rules_version: 0 });
    expect((await f.list()).find(b => b.id === data.battle_id)).toMatchObject({ map_mode: 'isolated', map_rules_version: 1 });
  });
  it('returns a placement error without leaving a partial invitation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const response = await f.request('/teams/battles', users.a, 'POST', { opponent_team_ids: [teams.b], starts_at: iso(Date.now() + 3600000), ends_at: iso(Date.now() + 7200000), map_mode: 'isolated', spots_enabled: true, map_latitude: 35, map_longitude: 139 });
    expect(response.status).toBe(503);
    expect(f.count('team_battles')).toBe(0); expect(f.count('battle_spots')).toBe(0);
  });
  it('stores a fixed battle at start, counts distance once there and keeps normal personal/team totals', async () => {
    const selected = newBattle(), other = newBattle(), legacy = f.battle();
    const response = await f.request('/running/sessions', users.a, 'POST', { activity_mode: 'team', battle_id: selected });
    expect(response.status).toBe(201);
    const { session_id } = await response.json() as { session_id: string };
    expect(f.row('SELECT battle_id,team_id FROM running_sessions WHERE id=?', session_id)).toEqual({ battle_id: selected, team_id: teams.a });
    expect((await f.request(`/running/sessions/${session_id}/complete`, users.a, 'POST', { distance_m: 100, duration_sec: 60 })).status).toBe(200);
    expect(f.rows('SELECT battle_id,distance_m FROM team_battle_run_scores WHERE running_session_id=?', session_id)).toEqual([{ battle_id: selected, distance_m: 100 }]);
    expect(f.rows('SELECT distance_m,status FROM running_sessions WHERE id=?', session_id)).toEqual([{ distance_m: 100, status: 'completed' }]);
    expect(f.count('territories')).toBeGreaterThanOrEqual(0);
    expect(f.rows('SELECT battle_id FROM team_battle_run_scores WHERE battle_id IN (?,?)', other, legacy)).toEqual([]);
  });
  it('rejects outsiders, late starts, and users added after the roster was fixed', async () => {
    const id = newBattle();
    expect((await f.request('/running/sessions', users.c, 'POST', { activity_mode: 'team', battle_id: id })).status).toBe(409);
    expect((await f.request('/running/sessions', users.disposable, 'POST', { activity_mode: 'team', battle_id: id })).status).toBe(409);
    f.run('UPDATE team_battles SET ends_at=? WHERE id=?', iso(f.now() - 1000), id);
    expect((await f.request('/running/sessions', users.a, 'POST', { activity_mode: 'team', battle_id: id })).status).toBe(409);
    expect(f.count('running_sessions')).toBe(0);
  });
  it('captures only in the selected isolated match; no world or other-match changes, no replay', async () => {
    const selected = newBattle(), other = newBattle();
    const defender = f.defender(); const world = f.row('SELECT * FROM territories WHERE id=?', defender);
    const { session, response } = await capture(selected);
    expect(response.status).toBe(200);
    expect(f.row('SELECT * FROM territories WHERE id=?', defender)).toEqual(world);
    expect(f.count('battle_territories')).toBe(1);
    expect(f.rows('SELECT battle_id FROM battle_territories')).toEqual([{ battle_id: selected }]);
    expect(f.rows('SELECT * FROM battle_map_events WHERE battle_id=?', other)).toEqual([]);
    expect((await f.request('/territories', users.a, 'POST', f.capturePayload(session))).status).toBe(409);
    const mapped = await f.request(`/battle-maps/${selected}`);
    expect(mapped.status).toBe(200);
    const data = await mapped.json() as any;
    expect(data.spots[0]).toMatchObject({ owner_team_id: teams.a, first_capture_team_ids: [teams.a] });
    expect(data.battle.participants.find((p: any) => p.team_id === teams.a)).toMatchObject({ captured_spots: 1, spot_capture_points: .2 });
  });
  it('merges teammates and handles stealing/retaking without repeat first-capture points', async () => {
    const id = newBattle();
    expect((await capture(id)).response.status).toBe(200);
    const overlap: Coordinates = [[35,139.001],[35,139.003],[35.002,139.003],[35.002,139.001]];
    expect((await capture(id, overlap, users.member)).response.status).toBe(200);
    expect(f.rows('SELECT team_id FROM battle_territories WHERE battle_id=?', id)).toEqual([{ team_id: teams.a }]);
    expect((await capture(id, captureCoordinates, users.b, teams.b)).response.status).toBe(200);
    expect((await capture(id)).response.status).toBe(200);
    const data = await (await f.request(`/battle-maps/${id}`)).json() as any;
    expect(data.spots[0]).toMatchObject({ owner_team_id: teams.a });
    expect(data.spots[0].first_capture_team_ids.sort()).toEqual([teams.a,teams.b].sort());
    expect(data.battle.participants.every((p: any) => p.spot_capture_points === .2)).toBe(true);
  });
  it('rolls back guards, claims, territories and events when a polygon insertion fails', async () => {
    const id = newBattle();
    f.native.exec("CREATE TRIGGER fixture_fail_battle BEFORE INSERT ON battle_territories BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    expect((await capture(id)).response.status).toBe(409);
    expect(f.count('battle_map_write_guards')).toBe(0); expect(f.count('running_territory_claims')).toBe(0);
    expect(f.count('battle_map_events')).toBe(0); expect(f.count('battle_territories')).toBe(0);
    expect(f.row('SELECT map_revision FROM team_battles WHERE id=?', id).map_revision).toBe(0);
  });
  it('only lets one concurrent stale polygon revision commit', async () => {
    const id = newBattle();
    const original = f.db.batch.bind(f.db);
    let calls = 0, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(f.db, 'batch').mockImplementation(async statements => {
      if (statements[0].sql.includes('battle_map_write_guards')) {
        if (++calls === 2) release();
        await gate;
      }
      return original(statements);
    });
    const results = await Promise.all([capture(id), capture(id, captureCoordinates, users.member)]);
    expect(results.map(r => r.response.status).sort()).toEqual([200,409]);
    expect(f.count('running_territory_claims')).toBe(1); expect(f.count('battle_map_write_guards')).toBe(1);
  });
  it('shared baseline tracks pre-start world edits and freezes exactly at start', async () => {
    const response = await f.request('/teams/battles', users.a, 'POST', { opponent_team_ids: [teams.b], starts_at: iso(Date.now() + 3600000), ends_at: iso(Date.now() + 7200000), map_mode: 'shared' });
    const { battle_id: id } = await response.json() as { battle_id: string };
    const territory = f.territory(1000); f.run('UPDATE territories SET area_sqm=2000 WHERE id=?', territory);
    expect(f.row('SELECT area_sqm FROM battle_shared_baselines WHERE battle_id=? AND territory_id=?', id, territory).area_sqm).toBe(2000);
    f.run("UPDATE team_battles SET status='accepted',starts_at=? WHERE id=?", iso(f.now() - 1000), id);
    f.run('UPDATE territories SET area_sqm=3000 WHERE id=?', territory);
    expect(f.row('SELECT area_sqm FROM battle_shared_baselines WHERE battle_id=? AND territory_id=?', id, territory).area_sqm).toBe(2000);
    expect(f.row('SELECT area_sqm FROM battle_map_events WHERE battle_id=?', id).area_sqm).toBe(3000);
  });
  it('shared world outsiders remove a participant spot and affect net area without earning buffs', async () => {
    const id = newBattle('shared');
    const own = f.territory(polygonArea(captureCoordinates));
    f.run('UPDATE territories SET area_polygon=? WHERE id=?', JSON.stringify(captureCoordinates), own);
    await sharedCaptureStatement(f.db as unknown as D1Database, teams.a, users.a, JSON.stringify(captureCoordinates)).run();
    f.run('DELETE FROM territories WHERE id=?', own);
    const outside = f.territory(polygonArea(captureCoordinates), teams.c, randomUUID(), users.c);
    f.run('UPDATE territories SET area_polygon=? WHERE id=?', JSON.stringify(captureCoordinates), outside);
    await sharedCaptureStatement(f.db as unknown as D1Database, teams.c, users.c, JSON.stringify(captureCoordinates)).run();
    const data = await (await f.request(`/battle-maps/${id}`)).json() as any;
    expect(data.spots[0]).toMatchObject({ owner_team_id: null, first_capture_team_ids: [teams.a] });
    expect(data.battle.participants.find((p: any) => p.team_id===teams.a)).toMatchObject({ territory_delta_sqm: 0, captured_spots: 1 });
    expect(data.battle.participants.some((p: any) => p.team_id===teams.c)).toBe(false);
  });
  it('shared events and dedicated map reads never mutate a personal layer', async () => {
    const id = newBattle('shared');
    f.territory(1000, null);
    expect(f.rows('SELECT * FROM battle_map_events WHERE battle_id=?', id)).toEqual([]);
    const before = f.changes(); f.native.exec('PRAGMA query_only=ON');
    expect((await f.request(`/battle-maps/${id}`)).status).toBe(200);
    expect(f.changes()).toBe(before); f.native.exec('PRAGMA query_only=OFF');
  });
  it('protects map/history visibility and requires auth', async () => {
    const id = newBattle();
    expect((await f.request(`/battle-maps/${id}`, null)).status).toBe(401);
    expect((await f.request(`/battle-maps/${id}`, users.c)).status).toBe(404);
    f.run('INSERT INTO team_battle_hidden_history (battle_id,user_id) VALUES (?,?)', id, users.a);
    expect((await f.request(`/battle-maps/${id}`)).status).toBe(404);
    expect((await f.request(`/battle-maps/${id}`, users.b)).status).toBe(200);
  });
  it('shared captures preserve holes and disconnected fragments for future ownership and buffs', async () => {
    const id = newBattle('shared');
    const outer: Coordinates = [[34.998,138.998],[34.998,139.004],[35.004,139.004],[35.004,138.998]];
    const defender = f.defender(outer);
    const normalSession = f.completedSession();
    expect((await f.request('/territories', users.a, 'POST', f.capturePayload(normalSession))).status).toBe(200);
    const rest = JSON.parse(String(f.row('SELECT geometry_json FROM territories WHERE id=?', defender).geometry_json));
    expect(rest.type).toBe('Polygon'); expect(rest.coordinates).toHaveLength(2);
    const mapped = await (await f.request(`/battle-maps/${id}`)).json() as any;
    expect(mapped.spots[0].owner_team_id).toBe(teams.a);
    expect(mapped.territories.find((t: any) => t.team_id===teams.b).geometry.coordinates).toHaveLength(2);
    const ordinary = await (await f.request('/territories')).json() as any;
    expect(ordinary.territories.find((t: any) => t.id===defender).geometry_json).toBe(JSON.stringify(rest));
    const splitter: Coordinates = [[34.997,139.0015],[34.997,139.0025],[35.005,139.0025],[35.005,139.0015]];
    const next = f.completedSession();
    expect((await f.request('/territories', users.a, 'POST', f.capturePayload(next, splitter))).status).toBe(200);
    const split = JSON.parse(String(f.row('SELECT geometry_json FROM territories WHERE id=?', defender).geometry_json));
    expect(split.type).toBe('MultiPolygon'); expect(split.coordinates.length).toBeGreaterThanOrEqual(2);
  });
  it('does not save a dedicated claim whose match ends during the transaction', async () => {
    const id = newBattle();
    const original = f.db.batch.bind(f.db);
    vi.spyOn(f.db, 'batch').mockImplementation(async statements => {
      if (statements[0].sql.includes('battle_map_write_guards')) f.run('UPDATE team_battles SET ends_at=? WHERE id=?', iso(f.now() - 1000), id);
      return original(statements);
    });
    expect((await capture(id)).response.status).toBe(409);
    expect(f.count('battle_territories')).toBe(0); expect(f.count('battle_map_events')).toBe(0);
    expect(f.count('running_territory_claims')).toBe(0);
  });
});
