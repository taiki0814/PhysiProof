import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { googleAuthRequestSchema, type GoogleAuthRequest } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';
import { tokenHash } from '../services/authSession';
import { googleClientId, verifyGoogleIdentity } from '../services/googleIdentity';
import { createLoginResponse, readLoginProfile } from '../services/loginProfile';

type Env = { Bindings: { DB: D1Database; GOOGLE_CLIENT_ID?: string }; Variables: { firebaseUser: { sub: string } } };
type Challenge = { nonce_hash: string };
type Purpose = 'login' | 'link';

function configuredClient(c: Context<Env>) {
  const client = googleClientId(c.env.GOOGLE_CLIENT_ID);
  if (!client) throw new HTTPException(503, { message: 'Googleログインの設定を準備しています。' });
  return client;
}

async function createChallenge(c: Context<Env>, purpose: Purpose, userId: string | null = null) {
  const clientId = configuredClient(c);
  const id = crypto.randomUUID();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM google_auth_challenges WHERE expires_at<=CURRENT_TIMESTAMP'),
    c.env.DB.prepare(`INSERT INTO google_auth_challenges(id,nonce_hash,purpose,user_id,expires_at)
      VALUES(?,?,?,?,datetime('now','+5 minutes'))`).bind(id, await tokenHash(nonce), purpose, userId),
  ]);
  return { challenge_id: id, nonce, client_id: clientId };
}

async function verifyChallenge(c: Context<Env>, request: GoogleAuthRequest, purpose: Purpose, userId: string | null = null) {
  const clientId = configuredClient(c);
  const challenge = await c.env.DB.prepare(`SELECT nonce_hash FROM google_auth_challenges
    WHERE id=? AND purpose=? AND user_id IS ? AND operation_id IS NULL AND expires_at>CURRENT_TIMESTAMP`)
    .bind(request.challenge_id, purpose, userId).first<Challenge>();
  if (!challenge) throw new HTTPException(409, { message: '認証の有効期限が切れたか、完了済みです。Googleログインをやり直してください。' });
  try {
    return await verifyGoogleIdentity(request.credential, clientId, challenge.nonce_hash);
  } catch {
    throw new HTTPException(401, { message: 'Googleの本人確認を完了できませんでした。もう一度お試しください。' });
  }
}

function consumeChallenge(db: D1Database, id: string, operation: string) {
  return db.prepare(`UPDATE google_auth_challenges SET operation_id=?
    WHERE id=? AND operation_id IS NULL AND expires_at>CURRENT_TIMESTAMP`).bind(operation, id);
}

function checkConsumed(changes: number | undefined) {
  if (!changes) throw new HTTPException(409, { message: '認証が別画面で完了したか、有効期限が切れました。やり直してください。' });
}

export const googleAuthRoutes = new Hono<Env>()
  .onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error('Google sign-in operation failed');
    return c.json({ error: 'Googleログインを完了できませんでした。時間を置いて再試行してください。' }, 503);
  })
  .use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); })
  .use('*', bodyLimit({ maxSize: 16384 }))
  .get('/config', c => c.json({ client_id: googleClientId(c.env.GOOGLE_CLIENT_ID) }))
  .post('/challenge', async c => c.json(await createChallenge(c, 'login')))
  .get('/link', firebaseAuth, async c => {
    const linked = await c.env.DB.prepare("SELECT email FROM auth_identities WHERE provider='google' AND user_id=?")
      .bind(c.get('firebaseUser').sub).first<{ email: string }>();
    return c.json({ client_id: googleClientId(c.env.GOOGLE_CLIENT_ID), linked: !!linked, email: linked?.email ?? null });
  })
  .post('/link/challenge', firebaseAuth, async c =>
    c.json(await createChallenge(c, 'link', c.get('firebaseUser').sub)))
  .post('/link', firebaseAuth, zValidator('json', googleAuthRequestSchema), async c => {
    const request = c.req.valid('json');
    const userId = c.get('firebaseUser').sub;
    const identity = await verifyChallenge(c, request, 'link', userId);
    const db = c.env.DB;
    const operation = crypto.randomUUID();
    let result;
    try {
      result = await db.batch([
        consumeChallenge(db, request.challenge_id, operation),
        db.prepare(`INSERT INTO auth_identities(provider,subject,user_id,email)
          SELECT 'google',?,?,? WHERE EXISTS(SELECT 1 FROM google_auth_challenges WHERE id=? AND operation_id=?)
          ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email WHERE auth_identities.user_id=excluded.user_id`)
          .bind(identity.subject, userId, identity.email, request.challenge_id, operation),
      ]);
    } catch (error) {
      if (String(error).includes('UNIQUE constraint')) throw new HTTPException(409, { message: 'このアカウントには別のGoogleアカウントを連携済みです。' });
      throw error;
    }
    checkConsumed(result[0].meta.changes);
    if (!result[1].meta.changes) throw new HTTPException(409, { message: 'このGoogleアカウントは別のfoopeアカウントに連携済みです。' });
    return c.json({ success: true as const });
  })
  .post('/signin', zValidator('json', googleAuthRequestSchema), async c => {
    const request = c.req.valid('json');
    const identity = await verifyChallenge(c, request, 'login');
    const db = c.env.DB;
    const existing = await db.prepare("SELECT user_id FROM auth_identities WHERE provider='google' AND subject=?")
      .bind(identity.subject).first<{ user_id: string }>();
    if (!existing && !request.profile) return c.json({ status: 'profile_required' as const, default_name: identity.name });

    let userId = existing?.user_id;
    const operation = crypto.randomUUID();
    if (!userId) {
      userId = crypto.randomUUID();
      const profile = request.profile!;
      try {
        const result = await db.batch([
          consumeChallenge(db, request.challenge_id, operation),
          db.prepare(`INSERT INTO users(id,login_id,password_hash,name,age)
            SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM google_auth_challenges WHERE id=? AND operation_id=?)`)
            .bind(userId, 'google_' + userId, 'external:' + crypto.randomUUID(), profile.name, profile.age, request.challenge_id, operation),
          db.prepare(`INSERT INTO auth_identities(provider,subject,user_id,email)
            SELECT 'google',?,?,? WHERE EXISTS(SELECT 1 FROM google_auth_challenges WHERE id=? AND operation_id=?)`)
            .bind(identity.subject, userId, identity.email, request.challenge_id, operation),
        ]);
        checkConsumed(result[0].meta.changes);
      } catch (error) {
        if (String(error).includes('UNIQUE constraint')) throw new HTTPException(409, { message: 'このGoogleアカウントの登録が先に完了しました。Googleログインをやり直してください。' });
        throw error;
      }
    } else {
      const result = await db.batch([
        consumeChallenge(db, request.challenge_id, operation),
        db.prepare(`UPDATE auth_identities SET email=? WHERE provider='google' AND subject=? AND user_id=?
          AND EXISTS(SELECT 1 FROM google_auth_challenges WHERE id=? AND operation_id=?)`)
          .bind(identity.email, identity.subject, userId, request.challenge_id, operation),
      ]);
      checkConsumed(result[0].meta.changes);
    }
    const profile = await readLoginProfile(db, 'id', userId);
    if (!profile) throw new HTTPException(401, { message: 'アカウントを確認できませんでした。ログインをやり直してください。' });
    return c.json({ status: 'signed_in' as const, session: await createLoginResponse(db, profile) });
  });
