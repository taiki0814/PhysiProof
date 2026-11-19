import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { androidAuthExchangeResultSchema, androidAuthStartResultSchema } from '@my-app/shared';
import app from './index';
import { issueSession, resolveSession, tokenHash } from './services/authSession';

let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined;
try { DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync; } catch { /* Requires Node 22+. */ }
const sqlSuite = DatabaseSync ? describe : describe.skip;
const endpoint = '/api/auth/android';
const trustedOrigin = 'https://physiproof-frontend.pages.dev';
const users = [crypto.randomUUID(), crypto.randomUUID()];
const proof = 'a'.repeat(64);
const wrongProof = 'b'.repeat(64);

sqlSuite('Android browser handoff with SQLite and opaque sessions', () => {
  let sqlite: import('node:sqlite').DatabaseSync;
  let db: D1Database;
  let tokens: string[];

  function prepare(query: string, values: SQLInputValue[] = []) {
    const execute = () => {
      const results = sqlite.prepare(query).all(...values);
      const changes = sqlite.prepare('SELECT changes() AS count').get()?.count;
      return { results, meta: { changes } };
    };
    return {
      bind: (...args: SQLInputValue[]) => prepare(query, args),
      first: async () => sqlite.prepare(query).get(...values) ?? null,
      run: async () => execute(),
      execute,
    };
  }

  beforeEach(async () => {
    sqlite = new DatabaseSync!(':memory:');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
      sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
    db = {
      prepare,
      batch: async (statements: ReturnType<typeof prepare>[]) => {
        sqlite.exec('BEGIN');
        try {
          const results = statements.map(statement => statement.execute());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as D1Database;
    const insert = sqlite.prepare('INSERT INTO users(id,login_id,password_hash,name,age) VALUES(?,?,?,?,?)');
    users.forEach((id, index) => insert.run(id, 'fixture' + index, 'external:' + crypto.randomUUID(), 'Runner ' + index, 20));
    tokens = await Promise.all(users.map(id => issueSession(db, id)));
  });
  afterEach(() => sqlite.close());

  function request(path: string, method = 'GET', body?: unknown, headers?: HeadersInit) {
    const requestHeaders = new Headers(headers);
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
    return app.request(endpoint + path, {
      method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
    }, { DB: db });
  }

  async function start() {
    const response = await request('/start', 'POST', { proof_hash: await tokenHash(proof) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    return androidAuthStartResultSchema.parse(await response.json());
  }

  function approve(id: string, code: string, user = 0, origin = trustedOrigin) {
    return request('/' + id + '/approve', 'POST', { confirmation_code: code }, {
      Authorization: 'Bearer ' + tokens[user], Origin: origin,
    });
  }

  function exchange(id: string, verifier = proof) {
    return request('/' + id + '/exchange', 'POST', { proof: verifier });
  }

  it('returns only public metadata, keeps the proof private, and polls with the right proof', async () => {
    const input = await start();
    const { request_id, confirmation_code, expires_at } = input;
    expect(Date.parse(expires_at) - Date.now()).toBeGreaterThan(298_000);
    expect(Date.parse(expires_at) - Date.now()).toBeLessThanOrEqual(300_000);
    const pending = await exchange(request_id);
    expect(pending.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await pending.json()).toEqual({ status: 'pending' });
    expect((await exchange(request_id, wrongProof)).status).toBe(409);
    expect((await exchange(request_id, await tokenHash(proof))).status).toBe(409);

    const metadata = () => request('/' + request_id);
    expect(await (await metadata()).json()).toEqual(input);
    expect((await approve(request_id, confirmation_code)).status).toBe(200);
    expect(await (await metadata()).json()).toEqual(input);
    expect((await exchange(request_id)).status).toBe(200);
    expect(await (await metadata()).json()).toEqual(input);
    const stored = sqlite.prepare('SELECT * FROM android_login_handoffs WHERE id=?').get(request_id);
    expect(stored).toMatchObject({
      proof_hash: await tokenHash(proof), approval_session_hash: await tokenHash(tokens[0]),
    });
    expect(Object.values(stored ?? {}).some(value => value === proof || tokens.includes(String(value)))).toBe(false);
  });

  it('requires authentication and the matching code and prevents account substitution', async () => {
    const { request_id, confirmation_code } = await start();
    const path = '/' + request_id + '/approve';
    expect((await request(path, 'POST', { confirmation_code })).status).toBe(401);
    const wrongCode = confirmation_code === '00000000' ? '11111111' : '00000000';
    expect((await approve(request_id, wrongCode)).status).toBe(409);
    const injected = await request(path, 'POST', { confirmation_code, userId: users[1] }, {
      Authorization: 'Bearer ' + tokens[0],
    });
    expect(injected.status).toBe(400);
    expect(await injected.json()).toEqual({ error: '入力が無効です。' });
    expect((await request(path, 'POST', { confirmation_code }, { Authorization: 'Bearer ' + tokens[0] })).status).toBe(200);
    expect((await approve(request_id, confirmation_code, 1)).status).toBe(409);

    const result = androidAuthExchangeResultSchema.parse(await (await exchange(request_id)).json());
    expect(result).toMatchObject({ status: 'signed_in', session: { userId: users[0], name: 'Runner 0' } });
    if (result.status !== 'signed_in') throw new Error('Expected signed-in result');
    expect(result.session.accessToken === tokens[0]).toBe(false);
    expect(result.session).not.toHaveProperty('password_hash');
    expect(await resolveSession(db, result.session.accessToken)).toEqual({ sub: users[0] });
    expect((await exchange(request_id)).status).toBe(409);
  });

  it('rejects expired requests before or after approval', async () => {
    const pending = await start();
    const approved = await start();
    expect((await approve(approved.request_id, approved.confirmation_code)).status).toBe(200);
    sqlite.exec("UPDATE android_login_handoffs SET expires_at=datetime('now','-1 second')");
    expect((await request('/' + pending.request_id)).status).toBe(404);
    expect((await approve(pending.request_id, pending.confirmation_code)).status).toBe(409);
    expect((await exchange(pending.request_id)).status).toBe(409);
    expect((await exchange(approved.request_id)).status).toBe(409);
  });

  it('issues only one app session across concurrent exchanges', async () => {
    const { request_id, confirmation_code } = await start();
    expect((await approve(request_id, confirmation_code)).status).toBe(200);
    const responses = await Promise.all([exchange(request_id), exchange(request_id)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions WHERE user_id=?').get(users[0])?.count).toBe(2);
  });

  it.each(['password change', 'session revocation'])('invalidates approval after %s', async change => {
    const { request_id, confirmation_code } = await start();
    expect((await approve(request_id, confirmation_code)).status).toBe(200);
    if (change === 'password change') {
      sqlite.prepare('UPDATE users SET password_hash=? WHERE id=?').run('external:' + crypto.randomUUID(), users[0]);
      expect(await resolveSession(db, tokens[0])).toEqual({ sub: users[0] });
    } else {
      const logout = await app.request('/api/auth/logout', {
        method: 'POST', headers: { Authorization: 'Bearer ' + tokens[0] },
      }, { DB: db });
      expect(logout.status).toBe(200);
      expect(await resolveSession(db, tokens[0])).toBeNull();
    }
    expect((await exchange(request_id)).status).toBe(409);
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions WHERE user_id=?').get(users[0])?.count)
      .toBe(change === 'password change' ? 1 : 0);
  });

  it('applies exact CORS and Origin checks to browser approval', async () => {
    const { request_id, confirmation_code } = await start();
    const path = '/' + request_id + '/approve';
    const preflight = (origin: string) => request(path, 'OPTIONS', undefined, {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    });
    for (const origin of ['null', trustedOrigin + '.example', 'http://localhost:5174', '']) {
      const rejected = await approve(request_id, confirmation_code, 0, origin);
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect((await preflight(origin)).headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    for (const origin of [trustedOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']) {
      const response = await preflight(origin);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
    expect((await approve(request_id, confirmation_code)).headers.get('Access-Control-Allow-Origin')).toBe(trustedOrigin);
  });

  it('rejects invalid, oversized, and noncanonical requests', async () => {
    const { request_id } = await start();
    expect((await request('/not-a-uuid')).status).toBe(400);
    expect((await request('/' + request_id + '/')).status).toBe(404);
    expect((await request('/' + request_id + '/exchange', 'GET')).status).toBe(404);
    expect((await request('/start/', 'POST', { proof_hash: await tokenHash(proof) })).status).toBe(404);
    expect((await request('/start', 'POST', { proof_hash: 'A'.repeat(64) })).status).toBe(400);
    expect((await request('/start', 'POST', { proof_hash: proof.slice(1) + '\n' })).status).toBe(400);
    expect((await request('/start', 'POST', { proof_hash: 'a'.repeat(1024) })).status).toBe(413);
  });
});
