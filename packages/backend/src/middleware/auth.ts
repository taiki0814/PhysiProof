import { createMiddleware } from 'hono/factory';
import { resolveSession } from '../services/authSession';

/**
 * Password-issued opaque sessions. The old export name is retained for routes.
 */
export const firebaseAuth = createMiddleware(async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const authHeader = c.req.header('Authorization');
  
  // Only isolated test fixtures opt in; no Wrangler configuration enables this.
  if (c.env.AUTH_TEST_MODE === 'isolated-fixture' && authHeader?.startsWith('Bearer test-token:')) {
    const uid = authHeader.split(':')[1] || 'demo-user';
    c.set('firebaseUser', { sub: uid, email: `${uid}@example.com` });
    return await next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '認証トークンが不足しています。' }, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const identity = await resolveSession(c.env.DB, token);
    if (!identity) return c.json({ error: 'ログインの有効期限が切れています。再ログインしてください。' }, 401);
    c.set('firebaseUser', identity);
    
  } catch (error) {
    return c.json({ error: '本人確認に接続できません。しばらくしてから再試行してください。' }, 503);
  }
  await next();
});

/**
 * Verify the body identity against the authenticated session, not a client UID.
 */
export const verifyUserOwnership = (userIdInBody: string, jwtSub: string) => {
  if (userIdInBody !== jwtSub) {
    throw new Error('他人のユーザーIDでデータを操作することはできません。');
  }
};

/**
 * Resolve an optional valid session; malformed/expired credentials grant nothing.
 */
export const optionalAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return await next();
  }

  if (c.env.AUTH_TEST_MODE === 'isolated-fixture' && authHeader.startsWith('Bearer test-token:')) {
    const uid = authHeader.split(':')[1] || 'demo-user';
    c.set('firebaseUser', { sub: uid, email: `${uid}@example.com` });
    return await next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const identity = await resolveSession(c.env.DB, token);
    if (identity) c.set('firebaseUser', identity);
  } catch (error) {}
  await next();
});

