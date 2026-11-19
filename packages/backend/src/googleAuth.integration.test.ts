import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { D1Database } from '@cloudflare/workers-types';
import app from './index';
import { issueSession, resolveSession } from './services/authSession';
import { verifyUniformAdminSession } from './services/uniformAdminSession';

let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined;
try { DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync; } catch { /* Requires Node 22+. */ }
const sqlSuite = DatabaseSync ? describe : describe.skip;
const CLIENT = '123456-testclient.apps.googleusercontent.com';
const users = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

sqlSuite('Google sign-in with signed JWTs and real SQLite transactions', () => {
  let sqlite: import('node:sqlite').DatabaseSync;
  let db: D1Database;
  let tokens: string[];
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let publicKey: Awaited<ReturnType<typeof exportJWK>>;
  const sql = (query: string, ...args: any[]) => sqlite.prepare(query).run(...args);
  const one = (query: string, ...args: any[]) => sqlite.prepare(query).get(...args);
  const stmt = (query: string, args: any[] = []): any => ({
    bind: (...values: any[]) => stmt(query, values),
    first: async () => one(query, ...args) ?? null,
    all: async () => ({ results: sqlite.prepare(query).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql(query, ...args).changes) } }),
  });
  function request(path: string, method = 'GET', body?: unknown, user = -1, client = CLIENT) {
    return app.request('/api' + path, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(user >= 0 ? { Authorization: 'Bearer ' + tokens[user] } : {}) },
    }, { DB: db, GOOGLE_CLIENT_ID: client } as any);
  }
  async function challenge(user = -1) {
    const response = await request('/auth/google/' + (user >= 0 ? 'link/challenge' : 'challenge'), 'POST', undefined, user);
    expect(response.status).toBe(200);
    return response.json() as Promise<{ challenge_id: string; nonce: string }>;
  }
  async function credential(nonce: string, claims: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: 'google-user-a', email: 'runner@example.com', email_verified: true, name: 'Google Runner', nonce,
      iss: 'https://accounts.google.com', aud: CLIENT, iat: now, exp: now + 300, ...claims,
    }).setProtectedHeader({ alg: 'RS256', kid: 'foope-test-key' }).sign(keys.privateKey);
  }
  async function signIn(input: { challenge_id: string; nonce: string }, profile?: { name: string; age: number }, claims?: Record<string, unknown>) {
    return request('/auth/google/signin', 'POST', {
      challenge_id: input.challenge_id, credential: await credential(input.nonce, claims), ...(profile ? { profile } : {}),
    });
  }
  async function link(user: number, claims?: Record<string, unknown>) {
    const input = await challenge(user);
    return request('/auth/google/link', 'POST', {
      challenge_id: input.challenge_id, credential: await credential(input.nonce, claims),
    }, user);
  }
  beforeAll(async () => {
    keys = await generateKeyPair('RS256');
    publicKey = { ...await exportJWK(keys.publicKey), kid: 'foope-test-key', alg: 'RS256', use: 'sig' };
  });
  beforeEach(async () => {
    sqlite = new DatabaseSync!(':memory:');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
      sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
    let pending: Promise<unknown> = Promise.resolve();
    db = { prepare: stmt, batch: (statements: any[]) => {
      const transaction = pending.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      pending = transaction.catch(() => {});
      return transaction;
    } } as unknown as D1Database;
    users.forEach((id, index) => sql('INSERT INTO users(id,login_id,password_hash,name,age,role,xp) VALUES(?,?,?,?,?,?,?)',
      id, 'fixture' + index, 'test-pass-123', 'Existing Runner', 20, index === 2 ? 'admin' : 'user', 120));
    tokens = await Promise.all(users.map(id => issueSession(db, id)));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      expect(String(input)).toBe('https://www.googleapis.com/oauth2/v3/certs');
      return new Response(JSON.stringify({ keys: [publicKey] }), { headers: { 'Content-Type': 'application/json' } });
    });
  });
  afterEach(() => { vi.restoreAllMocks(); sqlite.close(); });

  it('stays disabled until the OAuth client is configured', async () => {
    const response = await request('/auth/google/config', 'GET', undefined, -1, '');
    expect(await response.json()).toEqual({ client_id: null });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await request('/auth/google/challenge', 'POST', undefined, -1, '')).status).toBe(503);
    expect(one('SELECT COUNT(*) n FROM google_auth_challenges')?.n).toBe(0);
  });

  it('requires age and explicit profile completion before creating an ordinary Google user', async () => {
    const input = await challenge();
    expect(await (await signIn(input)).json()).toEqual({ status: 'profile_required', default_name: 'Google Runner' });
    expect(one('SELECT COUNT(*) n FROM auth_identities')?.n).toBe(0);
    expect((await signIn(input, { name: 'Runner', age: 0 })).status).toBe(400);
    const response = await signIn(input, { name: 'New Runner', age: 22 }, { role: 'admin' });
    expect(response.status).toBe(200);
    const result = await response.json() as any;
    expect(result).toMatchObject({ status: 'signed_in', session: { name: 'New Runner', age: 22, role: 'user', avatar_id: 'default' } });
    expect(await resolveSession(db, result.session.accessToken)).toEqual({ sub: result.session.userId });
    expect(result.session).not.toHaveProperty('password_hash');
    expect(result.session).not.toHaveProperty('uniformAdminToken');
    const stored = one('SELECT password_hash,login_id FROM users WHERE id=?', result.session.userId)!;
    expect(String(stored.password_hash)).toMatch(/^external:/);
    expect((await request('/auth/login', 'POST', { loginId: stored.login_id, password: stored.password_hash })).status).toBe(401);
  });

  it('links only after existing-account authentication and retains the existing user and records', async () => {
    const userCount = one('SELECT COUNT(*) n FROM users')?.n;
    sql('UPDATE users SET login_id=? WHERE id=?', 'runner@example.com', users[0]);
    const input = await challenge();
    expect(await (await signIn(input)).json()).toMatchObject({ status: 'profile_required' });
    expect((await request('/auth/google/link', 'GET')).status).toBe(401);
    const owned = await challenge(0);
    const token = await credential(owned.nonce);
    expect((await request('/auth/google/link', 'POST', {
      challenge_id: owned.challenge_id, credential: await credential('wrong-nonce'),
    }, 0)).status).toBe(400);
    expect(await resolveSession(db, tokens[0])).toEqual({ sub: users[0] });
    expect((await request('/auth/google/link', 'POST', { challenge_id: owned.challenge_id, credential: token }, 1)).status).toBe(409);
    expect((await request('/auth/google/signin', 'POST', { challenge_id: owned.challenge_id, credential: token })).status).toBe(409);
    expect((await request('/auth/google/link', 'POST', { challenge_id: owned.challenge_id, credential: token }, 0)).status).toBe(200);
    const result = await (await signIn(input)).json() as any;
    expect(result.session).toMatchObject({ userId: users[0], xp: 120, name: 'Existing Runner', login_id: 'runner@example.com' });
    expect(one('SELECT COUNT(*) n FROM users')?.n).toBe(userCount);
    expect(await (await request('/auth/google/link', 'GET', undefined, 0)).json()).toMatchObject({ linked: true, email: 'runner@example.com' });
    const changedEmail = await (await signIn(await challenge(), undefined, { email: 'new@example.com' })).json() as any;
    expect(changedEmail.session.userId).toBe(users[0]);
  });

  it('rejects signed tokens for the wrong client, issuer, nonce or time, and invalid signatures', async () => {
    const input = await challenge();
    for (const claims of [
      { aud: 'another-client' }, { iss: 'https://attacker.example' }, { nonce: 'wrong' },
      { exp: Math.floor(Date.now() / 1000) - 60 }, { email_verified: false },
      { iat: Math.floor(Date.now() / 1000) + 120 }, { azp: 'another-client' },
      { aud: [CLIENT, 'another-client'] },
    ]) expect((await signIn(input, { name: 'Blocked', age: 20 }, claims)).status).toBe(401);
    const token = await credential(input.nonce);
    const offset = token.length - 10;
    const forged = token.slice(0, offset) + (token[offset] === 'A' ? 'B' : 'A') + token.slice(offset + 1);
    expect((await request('/auth/google/signin', 'POST', { challenge_id: input.challenge_id, credential: forged, profile: { name: 'Blocked', age: 20 } })).status).toBe(401);
    expect(one('SELECT COUNT(*) n FROM auth_identities')?.n).toBe(0);
  });

  it('consumes the nonce once and rejects an expired or replayed challenge', async () => {
    const expired = await challenge();
    sql("UPDATE google_auth_challenges SET expires_at=datetime('now','-1 minute') WHERE id=?", expired.challenge_id);
    expect((await signIn(expired, { name: 'Late', age: 20 })).status).toBe(409);
    const input = await challenge();
    expect((await signIn(input, { name: 'One Runner', age: 20 })).status).toBe(200);
    expect((await signIn(input, { name: 'Another Runner', age: 20 })).status).toBe(409);
    expect(one('SELECT COUNT(*) n FROM auth_identities')?.n).toBe(1);
  });

  it('allows only one account creation for concurrent submissions of one challenge', async () => {
    const input = await challenge();
    const responses = await Promise.all([signIn(input, { name: 'First', age: 20 }), signIn(input, { name: 'Second', age: 20 })]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(one('SELECT COUNT(*) n FROM auth_identities')?.n).toBe(1);
    expect(one("SELECT COUNT(*) n FROM users WHERE password_hash LIKE 'external:%'")?.n).toBe(1);
  });

  it('does not leave an orphan user when separate challenges race for one Google identity', async () => {
    const a = await challenge(), b = await challenge();
    const prepare = db.prepare.bind(db);
    let reads = 0;
    let release!: () => void;
    const bothReads = new Promise<void>(resolve => { release = resolve; });
    db.prepare = ((query: string) => {
      const statement = prepare(query);
      if (!query.startsWith('SELECT user_id FROM auth_identities')) return statement;
      return { ...statement, bind: (...values: any[]) => {
        const bound = statement.bind(...values);
        return { ...bound, first: async () => {
          const value = await bound.first();
          if (++reads === 2) release();
          await bothReads;
          return value;
        } };
      } };
    }) as D1Database['prepare'];
    const responses = await Promise.all([signIn(a, { name: 'First', age: 20 }), signIn(b, { name: 'Second', age: 20 })]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(one('SELECT COUNT(*) n FROM auth_identities')?.n).toBe(1);
    expect(one("SELECT COUNT(*) n FROM users WHERE password_hash LIKE 'external:%'")?.n).toBe(1);
  });

  it('never transfers a Google identity between users or replaces an already linked identity', async () => {
    expect((await link(0)).status).toBe(200);
    expect((await link(1)).status).toBe(409);
    expect((await link(0, { sub: 'google-user-b' })).status).toBe(409);
    expect(one('SELECT user_id FROM auth_identities WHERE subject=?', 'google-user-a')?.user_id).toBe(users[0]);
    expect(one('SELECT COUNT(*) n FROM auth_identities')?.n).toBe(1);
  });

  it('issues the same password-login profile and preserves explicitly linked administrator access', async () => {
    const passwordResponse = await request('/auth/login', 'POST', { loginId: 'fixture2', password: 'test-pass-123' });
    expect(passwordResponse.status).toBe(200);
    expect((await link(2)).status).toBe(200);
    const result = await (await signIn(await challenge())).json() as any;
    expect(result.session).toMatchObject({ userId: users[2], role: 'admin', xp: 120 });
    expect(await verifyUniformAdminSession(db, users[2], result.session.uniformAdminToken)).toBe(true);
    expect(result.session).not.toHaveProperty('password_hash');
    expect((await request('/auth/login', 'POST', { loginId: 'fixture2', password: 'test-pass-123' })).status).toBe(200);
  });
});
