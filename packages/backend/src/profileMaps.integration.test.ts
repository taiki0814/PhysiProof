import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from './index';
import { issueSession, hashPassword, verifyPassword } from './services/authSession';
import { ageBand, profileAgeSchema, signupSchema } from '@my-app/shared';

// Real isolated SQLite, migrations, password-issued sessions and Hono routes.
// No AUTH_TEST_MODE flag and no access to local/remote application databases.
let DatabaseSync: any;
try { DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync; } catch {}
const describeSQLite = DatabaseSync ? describe : describe.skip;
let native: any;
const owner = randomUUID(), friend = randomUUID(), outsider = randomUUID();
const polygon = '[[35,139],[35,139.002],[35.002,139.002],[35.002,139]]';
const geometry = JSON.stringify({type:'Polygon',coordinates:[[[139,35],[139.002,35],[139.002,35.002],[139,35.002],[139,35]]]});
const statement = (sql: string, args: unknown[] = []): any => ({
  bind: (...values: unknown[]) => statement(sql, values),
  first: async () => native.prepare(sql).get(...args) ?? null,
  all: async () => ({ success: true, results: native.prepare(sql).all(...args) }),
  run: async () => ({ success: true, meta: { changes: Number(native.prepare(sql).run(...args).changes) } }),
});
const db = { prepare: statement, batch: async (items: any[]) => {
  native.exec('BEGIN');
  try { const result = []; for (const item of items) result.push(await item.run()); native.exec('COMMIT'); return result; }
  catch(e) { native.exec('ROLLBACK'); throw e; }
} } as unknown as D1Database;
let tokens: Record<string,string>;
const sql = (query: string, ...args: unknown[]) => native.prepare(query).run(...args);
const rows = (query: string, ...args: unknown[]) => native.prepare(query).all(...args);
const request = (path: string, user: string | null = owner, method = 'GET', body?: unknown, headers: Record<string,string> = {}) => app.request('/api' + path, {
  method, headers: { ...(user ? {Authorization:'Bearer ' + tokens[user]} : {}), 'Content-Type':'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
}, { DB: db } as any);
const capture = (userId: string, id: string, team: string | null = null) => sql(`INSERT INTO territories
  (id,user_id,team_id,latitude,longitude,area_polygon,geometry_json,area_sqm) VALUES(?,?,?,35,139,?,?,40000)`, id,userId,team,polygon,geometry);
const mutual = () => {
  sql('INSERT INTO friends(user_id,friend_id) VALUES(?,?),(?,?)',owner,friend,friend,owner);
  sql("UPDATE users SET territory_map_visibility='friends' WHERE id=?",owner);
};
beforeEach(async () => {
  native = new DatabaseSync(':memory:'); native.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../migrations/',import.meta.url);
  for (const file of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort()) native.exec(readFileSync(new URL(file,dir),'utf8'));
  for (const [id,name,age] of [[owner,'Owner',19],[friend,'Friend',28],[outsider,'Outsider',null]])
    sql('INSERT INTO users(id,login_id,password_hash,name,age) VALUES(?,?,?,?,?)',id,id,'fixture-password',name,age);
  tokens = {};
  for (const id of [owner,friend,outsider]) tokens[id] = await issueSession(db,id);
  capture(owner,'owner-area'); capture(friend,'friend-area'); capture(outsider,'outsider-area');
});
afterEach(() => { native.close(); vi.unstubAllGlobals(); });

describeSQLite('age and profile territory privacy', () => {
  it('requires a bounded integer age at signup and keeps only age bands public', async () => {
    for (const age of [0,121,1.5,NaN]) expect(profileAgeSchema.safeParse(age).success).toBe(false);
    expect(signupSchema.safeParse({name:'N',loginId:'new',password:'password'}).success).toBe(false);
    expect([ageBand(null),ageBand(9),ageBand(19),ageBand(20),ageBand(120)]).toEqual(['unknown','under10','10','20','100+']);
    const result = await (await request('/territories',null)).json() as any;
    expect(result.territories.find((t:any)=>t.id==='owner-area').age_band).toBe('10');
    expect(JSON.stringify(result)).not.toContain('owner_age');
    expect(result.territories.every((t:any)=>!('age' in t))).toBe(true);
  });
  it('filters decades and rejects unknown filter values without writes', async () => {
    const before = rows('SELECT total_changes() AS n')[0].n;
    const response = await request('/territories?age_band=10',null);
    expect((await response.json() as any).territories.map((t:any)=>t.id)).toEqual(['owner-area']);
    expect((await request('/territories?age_band=invalid',null)).status).toBe(400);
    expect(rows('SELECT total_changes() AS n')[0].n).toBe(before);
  });
  it('rejects guessed UIDs and unsigned JWTs in production auth', async () => {
    for (const token of ['test-token:'+owner,'e30.eyJzdWIiOiJvd25lciJ9.fake', '0'.repeat(64)]) {
      expect((await request(`/profiles/${owner}/territory-map`,null,'GET',undefined,{Authorization:'Bearer '+token})).status).toBe(401);
    }
    expect((await request('/territories?scope=friends',null)).status).toBe(401);
  });
  it('lets the owner view both modes but hides them even from friends by default', async () => {
    sql('INSERT INTO friends(user_id,friend_id) VALUES(?,?),(?,?)',owner,friend,friend,owner);
    for (const mode of ['current','history']) {
      expect((await request(`/profiles/${owner}/territory-map?mode=${mode}`)).status).toBe(200);
      expect((await request(`/profiles/${owner}/territory-map?mode=${mode}`,friend)).status).toBe(403);
      expect((await request(`/profiles/${owner}/territory-map?mode=${mode}`,outsider)).status).toBe(403);
    }
    expect((await request(`/profiles/${owner}/territory-map`)).headers.get('Cache-Control')).toContain('no-store');
  });
  it('requires mutual accepted friendship and rechecks after unfriend or privacy change', async () => {
    mutual();
    expect((await request(`/profiles/${owner}/territory-map`,friend)).status).toBe(200);
    expect((await request(`/profiles/${owner}/territory-map`,outsider)).status).toBe(403);
    sql('DELETE FROM friends WHERE user_id=? AND friend_id=?',owner,friend);
    expect((await request(`/profiles/${owner}/territory-map`,friend)).status).toBe(403);
    sql('INSERT INTO friends(user_id,friend_id) VALUES(?,?)',owner,friend);
    sql("UPDATE users SET territory_map_visibility='private' WHERE id=?",owner);
    expect((await request(`/profiles/${owner}/territory-map`,friend)).status).toBe(403);
  });
  it('never treats a pending request or shared team as a friend grant', async () => {
    sql("UPDATE users SET territory_map_visibility='friends' WHERE id=?",owner);
    sql("INSERT INTO friend_requests(id,sender_id,receiver_id,status) VALUES('pending',?,?,'pending')",friend,owner);
    sql("INSERT INTO teams(id,name,owner_id) VALUES('same-team','same',?)",owner);
    sql("UPDATE users SET team_id='same-team' WHERE id IN (?,?)",owner,friend);
    expect((await request(`/profiles/${owner}/territory-map`,friend)).status).toBe(403);
  });
  it('friends display includes self and mutual friends, never an unrelated owner', async () => {
    mutual();
    const res = await request('/territories?scope=friends');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect((await res.json() as any).territories.map((t:any)=>t.id).sort()).toEqual(['friend-area','owner-area']);
    const all = await (await request('/territories',null)).json() as any;
    expect(all.territories.map((t:any)=>t.id)).toContain('outsider-area');
  });
  it('validates the device snapshot against a revision including age and ownership changes', async () => {
    const first = await request('/territories',null);
    const etag = first.headers.get('ETag')!;
    for (const tag of [etag, 'W/'+etag, '"another-revision", W/'+etag]) {
      expect((await request('/territories',null,'GET',undefined,{'If-None-Match':tag})).status).toBe(304);
    }
    sql('UPDATE users SET age=31 WHERE id=?',owner);
    expect((await request('/territories',null,'GET',undefined,{'If-None-Match':etag})).status).toBe(200);
    const second = (await request('/territories',null)).headers.get('ETag')!;
    sql("DELETE FROM territories WHERE id='owner-area'");
    expect((await request('/territories',null,'GET',undefined,{'If-None-Match':second})).status).toBe(200);
  });
  it('saves age/visibility only for the authenticated owner', async () => {
    const result = await request('/users/me',owner,'PUT',{name:'Owner',avatar_id:'default',age:21,territory_map_visibility:'friends'});
    expect(result.status).toBe(200);
    const me = await (await request('/users/me')).json() as any;
    expect(me.user).toMatchObject({age:21,territory_map_visibility:'friends'});
    expect(rows('SELECT territory_map_visibility FROM users WHERE id=?',friend)[0].territory_map_visibility).toBe('private');
    expect((await request('/users/me',owner,'PUT',{name:'Owner',avatar_id:'default',age:121})).status).toBe(400);
  });
  it('paginates immutable history and never exposes raw tracks or capture timestamps', async () => {
    for(let i=0;i<105;i++) sql("INSERT INTO personal_territory_history(user_id,claim_key,area_polygon,geometry_json,source) VALUES(?,?,?,?,'capture')",owner,'claim-'+i,polygon,geometry);
    const first = await (await request(`/profiles/${owner}/territory-map?mode=history`)).json() as any;
    expect(first.territories).toHaveLength(100);
    const second = await (await request(`/profiles/${owner}/territory-map?mode=history&before=${first.next_before}`)).json() as any;
    expect(second.territories).toHaveLength(5); expect(second.next_before).toBeNull();
    expect(new Set([...first.territories,...second.territories].map(t=>t.id)).size).toBe(105);
    expect(JSON.stringify(first)).not.toMatch(/captured_at|started_at|latitude|address|distance_m/);
  });
  it('keeps a personal capture snapshot even after the territory is lost', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}')));
    const session = randomUUID();
    sql(`INSERT INTO running_sessions(id,user_id,activity_mode,status,distance_m,duration_sec,started_at,completed_at)
      VALUES(?,?,'personal','completed',400,120,datetime('now','-2 minutes'),CURRENT_TIMESTAMP)`,session,owner);
    const payload = {user_id:owner,activity_session_id:session,latitude:35,longitude:139,area_polygon:polygon,area_sqm:40000,time_period:'morning'};
    expect((await request('/territories',owner,'POST',payload)).status).toBe(200);
    expect(rows('SELECT * FROM personal_territory_history WHERE claim_key=?','run:'+session)).toHaveLength(1);
    expect((await request('/territories',owner,'POST',payload)).status).toBe(409);
    sql('DELETE FROM territories WHERE user_id=?',owner);
    const history = await (await request(`/profiles/${owner}/territory-map?mode=history`)).json() as any;
    expect(history.territories).toHaveLength(1); expect(history.territories[0].area_polygon).toBe(polygon);
  });
  it('rolls back claim, territory and history together on transaction failure', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}')));
    const session = randomUUID();
    sql(`INSERT INTO running_sessions(id,user_id,activity_mode,status,distance_m,duration_sec,completed_at)
      VALUES(?,?,'personal','completed',400,120,CURRENT_TIMESTAMP)`,session,owner);
    native.exec("CREATE TRIGGER reject_history BEFORE INSERT ON personal_territory_history BEGIN SELECT RAISE(ABORT,'fixture rejected'); END");
    expect((await request('/territories',owner,'POST',{user_id:owner,activity_session_id:session,latitude:35,longitude:139,area_polygon:polygon,area_sqm:40000,time_period:'morning'})).status).toBe(500);
    expect(rows('SELECT * FROM running_territory_claims WHERE running_session_id=?',session)).toHaveLength(0);
    expect(rows('SELECT id FROM territories WHERE user_id=?',owner).map((t:any)=>t.id)).toEqual(['owner-area']);
  });
});

describeSQLite('password-issued sessions', () => {
  it('does not issue a session if credentials changed after login verification', async () => {
    const before = rows('SELECT * FROM auth_sessions').length;
    await expect(issueSession(db,owner,'no-longer-current')).rejects.toThrow('Credentials changed');
    expect(rows('SELECT * FROM auth_sessions')).toHaveLength(before);
  });
  it('registers age/private defaults without storing plaintext and rejects wrong passwords', async () => {
    const res = await request('/auth/signup',null,'POST',{loginId:'fixture-new',name:'New',password:'fixture-new-password',age:24});
    expect(res.status).toBe(200);
    expect(rows('SELECT age,territory_map_visibility,password_hash FROM users WHERE login_id=?','fixture-new')[0])
      .toMatchObject({age:24,territory_map_visibility:'private',password_hash:expect.stringMatching(/^pbkdf2:/)});
    expect((await request('/auth/login',null,'POST',{loginId:'fixture-new',password:'wrong-password'})).status).toBe(401);
  });
  it('revokes other sessions after password changes while retaining the caller', async () => {
    const otherToken = await issueSession(db,owner);
    expect((await request('/users/me',owner,'PUT',{name:'Owner',avatar_id:'default',password:'updated-password'})).status).toBe(200);
    expect((await request('/users/me')).status).toBe(200);
    expect((await request('/users/me',null,'GET',undefined,{Authorization:'Bearer '+otherToken})).status).toBe(401);
    expect((await request('/auth/login',null,'POST',{loginId:owner,password:'fixture-password'})).status).toBe(401);
    expect((await request('/auth/login',null,'POST',{loginId:owner,password:'updated-password'})).status).toBe(200);
  });
  it('never returns passwords or hashes even in administrator user listings', async () => {
    sql("UPDATE users SET role='admin' WHERE id=?",owner);
    const res = await request('/admin/users');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.users.length).toBeGreaterThan(0);
    expect(body.users.every((u:any)=>!('password' in u)&&!('password_hash' in u))).toBe(true);
  });
  it('hashes new passwords, verifies legacy accounts and upgrades at login without leaking the hash', async () => {
    const hash = await hashPassword('new-password');
    expect(hash).not.toContain('new-password'); expect(await verifyPassword('new-password',hash)).toBe(true);
    expect(await verifyPassword('wrong',hash)).toBe(false);
    const res = await request('/auth/login',null,'POST',{loginId:owner,password:'fixture-password'});
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.accessToken).toMatch(/^[a-f0-9]{64}$/);
    expect(body.password_hash).toBeUndefined();
    expect(rows('SELECT password_hash FROM users WHERE id=?',owner)[0].password_hash).toMatch(/^pbkdf2:/);
    expect(rows('SELECT token_hash FROM auth_sessions').map((r:any)=>r.token_hash)).not.toContain(body.accessToken);
  });
  it('expires, logs out and rejects revoked sessions without a UID fallback', async () => {
    expect((await request('/auth/logout',owner,'POST')).status).toBe(200);
    expect((await request('/users/me')).status).toBe(401);
    sql("UPDATE auth_sessions SET expires_at=datetime('now','-1 second') WHERE user_id=?",friend);
    expect((await request('/users/me',friend)).status).toBe(401);
  });
  it('backfills only existing personal regions, preserves data and defaults private', () => {
    const old = new DatabaseSync(':memory:');
    const dir = new URL('../migrations/',import.meta.url);
    for(const file of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)&&f<'0037').sort()) old.exec(readFileSync(new URL(file,dir),'utf8'));
    old.prepare('INSERT INTO users(id,login_id,password_hash,name) VALUES(?,?,?,?)').run(owner,owner,'legacy','Old');
    old.prepare('INSERT INTO territories(id,user_id,latitude,longitude,area_polygon,area_sqm) VALUES(?,?,35,139,?,10)').run('legacy-map',owner,polygon);
    old.exec(readFileSync(new URL('0037_add_private_profile_maps.sql',dir),'utf8'));
    expect(old.prepare('SELECT * FROM personal_territory_history WHERE user_id=?').all(owner)).toMatchObject([{source:'legacy_snapshot',area_polygon:polygon}]);
    expect(old.prepare('SELECT password_hash,territory_map_visibility FROM users WHERE id=?').get(owner)).toMatchObject({password_hash:'legacy',territory_map_visibility:'private'});
    old.close();
  });
});
