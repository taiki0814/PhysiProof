import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createStudioUniform, type ChestResult } from '@my-app/shared';
import app from './index';
import { issueSession } from './services/authSession';
import { chestTierForTrace, chestWeekEnd } from './services/mapChests';

let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined;
try { DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync; } catch { /* Node versions before 22 lack built-in SQLite. */ }
const sqlSuite = DatabaseSync ? describe : describe.skip;

const center = { latitude: 35.68, longitude: 139.75 };
function loop(radius: number) {
  const rows = Array.from({ length: 25 }, (_, index) => {
    const angle = index * Math.PI / 12;
    return { latitude: center.latitude + Math.sin(angle) * radius / 111195,
      longitude: center.longitude + Math.cos(angle) * radius / 90300, captured_at: index * 10000 };
  });
  rows[24] = { ...rows[0], captured_at: 240000 };
  return rows;
}

it('uses Japanese Monday midnight and rejects open, disjoint, repeated and edge-grazing loops', () => {
  const monday = Date.parse('2026-11-15T15:00:00Z');
  expect(chestWeekEnd(monday - 1)).toBe(monday);
  expect(chestWeekEnd(monday)).toBe(monday + 7 * 86400000);
  const small = loop(40);
  expect(chestTierForTrace(small, center)).toBe('small');
  expect(chestTierForTrace(loop(85), center)).toBe('medium');
  expect(chestTierForTrace(loop(130), center)).toBe('large');
  expect(chestTierForTrace(small.slice(0, 17), center)).toBeNull();
  expect(chestTierForTrace(small, { ...center, latitude: center.latitude + .0003 })).toBeNull();
  expect(chestTierForTrace([...small, ...small.slice(1).map(row => ({ ...row, captured_at: row.captured_at + 240000 }))], center)).toBeNull();
  const interrupted = small.map(row => row.captured_at >= 120000 ? { ...row, captured_at: row.captured_at + 45000 } : row);
  expect(chestTierForTrace(interrupted, center)).toBeNull();
});

sqlSuite('shared chest placement and private rewards on real SQL', () => {
  let sqlite: import('node:sqlite').DatabaseSync, db: D1Database, clock: number;
  const users = [randomUUID(), randomUUID()];
  let tokens: string[];
  const initialClock = Date.now();
  const expires = chestWeekEnd(initialClock + 3600000);
  const sql = (query: string, ...args: any[]) => sqlite.prepare(query).run(...args);
  const one = (query: string, ...args: any[]) => sqlite.prepare(query).get(...args);
  const stmt = (query: string, args: any[] = []): any => ({
    bind: (...values: any[]) => stmt(query, values),
    first: async () => one(query, ...args) ?? null,
    all: async () => ({ results: sqlite.prepare(query).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql(query, ...args).changes) } }),
  });
  function request(path: string, method = 'GET', body?: unknown, user = 0) {
    return app.request('/api' + path, { method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(user >= 0 ? { Authorization: 'Bearer ' + tokens[user] } : {}) } }, { DB: db } as any);
  }
  function addChest(prefecture = 'JP-13', end = expires) {
    const id = randomUUID();
    sql('INSERT OR IGNORE INTO map_chest_weeks(prefecture_code, expires_at, ready) VALUES(?,?,1)', prefecture, end);
    sql('INSERT INTO map_chests VALUES(?,?,?,?,?)', id, prefecture, end, center.latitude, center.longitude);
    return id;
  }
  async function start(chestId: string, user: number) {
    const response = await request('/running/sessions', 'POST', { activity_mode: 'personal', chest_id: chestId }, user);
    expect(response.status).toBe(201);
    return (await response.json() as { session_id: string }).session_id;
  }
  async function finish(id: string, user: number) {
    const response = await request(`/running/sessions/${id}/complete`, 'POST', { distance_m: 650, duration_sec: 240 }, user);
    expect(response.status).toBe(200);
    return (await response.json() as { chest: ChestResult | null }).chest;
  }
  async function sendTrace(session: string, user: number, points = loop(85)) {
    for (const [sequence, p] of points.entries()) {
      clock += 10000;
      const response = await request(`/running/sessions/${session}/telemetry`, 'POST', {
        sequence, recorded_at_ms: clock, source: 'unavailable', steps: null,
        fix: { latitude: p.latitude, longitude: p.longitude, accuracy_m: 6, captured_at_ms: clock, mocked: false },
      }, user);
      expect(response.status).toBe(200);
    }
  }
  beforeEach(async () => {
    sqlite = new DatabaseSync!(':memory:');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
      sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
    db = { prepare: stmt, batch: async (statements: any[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    } } as unknown as D1Database;
    for (const id of users) sql('INSERT INTO users(id,login_id,password_hash,name) VALUES(?,?,?,?)', id, id, 'fixture', 'Fixture');
    tokens = await Promise.all(users.map(id => issueSession(db, id)));
    clock = expires - 6000000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => { vi.restoreAllMocks(); sqlite.close(); });

  it('publishes one saved prefecture draw and permits each account to claim it independently', async () => {
    const target = addChest();
    addChest('JP-14');
    const nearby = async (user: number) => {
      const response = await request('/map-chests/nearby', 'POST', center, user);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      return await response.json() as { chests: Array<{ id: string; claimed: boolean }> };
    };
    expect((await nearby(0)).chests).toMatchObject([{ id: target, claimed: false }]);
    const run = await start(target, 0);
    await sendTrace(run, 0);
    const prize = await finish(run, 0);
    expect(prize).toMatchObject({ tier: 'medium', reward_id: expect.stringMatching(/^chest-/) });
    expect(await finish(run, 0)).toEqual(prize);
    expect(one('SELECT COUNT(*) n FROM running_chest_points')?.n).toBe(0);
    expect((await nearby(0)).chests).toMatchObject([{ id: target, claimed: true }]);
    expect((await nearby(1)).chests).toMatchObject([{ id: target, claimed: false }]);
    expect((await request('/running/sessions', 'POST', { activity_mode: 'personal', chest_id: target })).status).toBe(409);

    const design = createStudioUniform();
    if (prize?.reward_id === 'chest-compass') design.emblem = prize.reward_id;
    else design.front_pattern = 'chest-switchback';
    expect((await request('/uniforms/personal', 'PUT', { design, revision: 0 }, 1)).status).toBe(400);
    expect((await request('/uniforms/personal', 'PUT', { design, revision: 0 }, 0)).status).toBe(200);
    const otherRun = await start(target, 1);
    await sendTrace(otherRun, 1);
    expect(await finish(otherRun, 1)).toMatchObject({ tier: 'medium' });
    expect(one('SELECT COUNT(*) n FROM map_chest_claims')?.n).toBe(2);
    expect(one('SELECT COUNT(*) n FROM running_place_passages')?.n).toBe(0);
    expect((await request('/map-chests/rewards', 'GET', undefined, -1)).status).toBe(401);
  });

  it('generates one shared draw from verified walking loops, with an alternate provider on failure', async () => {
    const result = { elements: [
      { type: 'area', tags: { 'ISO3166-2': 'JP-13' } },
      { type: 'way', geometry: loop(85).map(p => ({ lat: p.latitude, lon: p.longitude })) },
      { type: 'way', geometry: loop(100).slice(0, 20).map(p => ({ lat: p.latitude, lon: p.longitude })) },
    ] };
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(result));
    const first = await request('/map-chests/nearby', 'POST', center);
    const second = await request('/map-chests/nearby', 'POST', center, 1);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const draw = await first.json() as { chests: unknown[] };
    expect(draw.chests).toHaveLength(1);
    expect(await second.json()).toEqual(draw);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain('JP-13');
  });

  it('draws without duplicates, gives a completion badge when the tier is complete, and rejects open or expired challenges', async () => {
    const claimed: Array<ChestResult | null> = [];
    for (let index = 0; index < 3; index++) {
      const id = await start(addChest(), 0);
      await sendTrace(id, 0);
      claimed.push(await finish(id, 0));
    }
    expect(new Set(claimed.slice(0, 2).map(prize => prize?.reward_id)).size).toBe(2);
    expect(claimed[2]).toEqual({ tier: 'medium', reward_id: null });
    const open = await start(addChest(), 0);
    await sendTrace(open, 0, loop(85).slice(0, 15));
    expect(await finish(open, 0)).toBeNull();
    const expired = addChest('JP-13', clock - 1);
    expect((await request('/running/sessions', 'POST', { activity_mode: 'personal', chest_id: expired })).status).toBe(409);
    expect((await request('/running/sessions', 'POST', { activity_mode: 'team', chest_id: expired })).status).toBe(400);
  });
});
