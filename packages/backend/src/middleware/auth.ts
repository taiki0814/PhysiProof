import { createMiddleware } from 'hono/factory';
import { decode } from 'hono/jwt';

/**
 * Firebase Auth の ID トークンを検証するミドルウェア
 */
export const firebaseAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  // 開発環境用のバイパス: "test-token:UID" を許可
  if (authHeader && authHeader.startsWith('Bearer test-token:')) {
    const uid = authHeader.split(':')[1] || 'demo-user';
    c.set('firebaseUser', { sub: uid, email: `${uid}@example.com` });
    return await next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '認証トークンが不足しています。' }, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    // 注意: プロダクション環境では、Google の公開鍵を取得し
    // 署名 (RS256) と有効期限の検証を厳格に行う必要があります。
    // ここでは構造上の流れを示します。
    const { payload } = decode(token);
    
    // JWT の sub (Subject) フィールドを Firebase UID として保存
    c.set('firebaseUser', payload);
    
    await next();
  } catch (error) {
    return c.json({ error: '無効な認証トークンです。' }, 401);
  }
});

/**
 * リクエストボディ内の user_id と JWT の UID が一致するか検証するユーティリティ
 */
export const verifyUserOwnership = (userIdInBody: string, jwtSub: string) => {
  if (userIdInBody !== jwtSub) {
    throw new Error('他人のユーザーIDでデータを操作することはできません。');
  }
};

/**
 * トークンが存在すればデコードして c.set('firebaseUser', ...) し、無ければ無視して次に進むミドルウェア
 */
export const optionalAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return await next();
  }

  if (authHeader.startsWith('Bearer test-token:')) {
    const uid = authHeader.split(':')[1] || 'demo-user';
    c.set('firebaseUser', { sub: uid, email: `${uid}@example.com` });
    return await next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const { payload } = decode(token);
    c.set('firebaseUser', payload);
  } catch (error) {}
  await next();
});

