import type { D1Database } from '@cloudflare/workers-types';

export async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function issueSession(db: D1Database, userId: string, expectedPasswordHash?: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const result = await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<=CURRENT_TIMESTAMP'),
    expectedPasswordHash
      ? db.prepare(`INSERT INTO auth_sessions(token_hash,user_id,expires_at)
          SELECT ?,id,datetime('now','+14 days') FROM users WHERE id=? AND password_hash=?`)
        .bind(await tokenHash(token), userId, expectedPasswordHash)
      : db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+14 days'))")
        .bind(await tokenHash(token), userId),
  ]);
  if (expectedPasswordHash && !result[1].meta.changes) throw new Error('Credentials changed while logging in');
  return token;
}
export async function resolveSession(db: D1Database, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`SELECT s.user_id AS sub FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP`).bind(await tokenHash(token)).first<{ sub: string }>();
}
const iterations = 100000;
async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
export async function hashPassword(password: string) {
  const salt = crypto.randomUUID();
  return `pbkdf2:${iterations}:${salt}:${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('pbkdf2:')) return await tokenHash(password) === await tokenHash(stored);
  const [_, count, salt, expected] = stored.split(':');
  if (count !== String(iterations) || !salt || !/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
  const actual = await derive(password, salt);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
