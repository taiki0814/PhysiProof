import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import {
  androidAuthApproveSchema,
  androidAuthExchangeSchema,
  androidAuthRequestSchema,
  androidAuthStartSchema,
  type AndroidAuthRequest,
} from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';
import { tokenHash } from '../services/authSession';
import { createLoginResponse, readLoginProfile } from '../services/loginProfile';

type Env = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
type Approval = {
  approved_user_id: string | null;
  approval_session_hash: string | null;
  approval_password_fingerprint: string | null;
};

const trustedOrigins = [
  'https://physiproof-frontend.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const metadataColumns = "id AS request_id, confirmation_code, strftime('%Y-%m-%dT%H:%M:%SZ', expires_at) AS expires_at";

function generateConfirmationCode() {
  const range = 100_000_000;
  const limit = Math.floor(2 ** 32 / range) * range;
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= limit);
  return String(random[0] % range).padStart(8, '0');
}

function unavailable(c: Context<Env>) {
  return c.json({ error: '認証リクエストを確認できませんでした。Androidアプリからやり直してください。' }, 409);
}

function invalidInput(result: { success: boolean }) {
  if (!result.success) throw new HTTPException(400);
}

const requestIdValidator = () => zValidator('param', androidAuthRequestSchema.pick({ request_id: true }), invalidInput);

export const androidAuthRoutes = new Hono<Env>()
  .onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return c.json({ error: '入力が無効です。' }, 400);
    }
    return c.json({ error: '認証を完了できませんでした。時間を置いて再試行してください。' }, 503);
  })
  .use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    await next();
  })
  .use('*', cors({
    origin: trustedOrigins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }))
  .use('*', async (c, next) => {
    const reader = c.req.raw.body?.getReader();
    if (!reader) return next();
    const buffer = new Uint8Array(1024);
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > buffer.byteLength) {
        void reader.cancel().catch(() => {});
        return c.json({ error: 'リクエストが大きすぎます。' }, 413);
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
    c.req.raw = new Request(c.req.raw, { body: buffer.subarray(0, length) });
    await next();
  })
  .post('/start', zValidator('json', androidAuthStartSchema, invalidInput), async c => {
    const { proof_hash } = c.req.valid('json');
    const db = c.env.DB;
    const [, inserted] = await db.batch<AndroidAuthRequest>([
      db.prepare('DELETE FROM android_login_handoffs WHERE expires_at<=CURRENT_TIMESTAMP'),
      db.prepare(`INSERT INTO android_login_handoffs(id,proof_hash,confirmation_code,expires_at)
        VALUES(?,?,?,datetime('now','+5 minutes')) RETURNING ${metadataColumns}`)
        .bind(crypto.randomUUID(), proof_hash, generateConfirmationCode()),
    ]);
    return c.json(androidAuthRequestSchema.parse(inserted.results[0]));
  })
  .get('/:request_id', requestIdValidator(), async c => {
    const { request_id } = c.req.valid('param');
    const metadata = await c.env.DB.prepare(`SELECT ${metadataColumns} FROM android_login_handoffs
      WHERE id=? AND expires_at>CURRENT_TIMESTAMP`).bind(request_id).first<AndroidAuthRequest>();
    if (!metadata) return c.json({ error: '認証リクエストが見つかりません。' }, 404);
    return c.json(metadata);
  })
  .post('/:request_id/approve', requestIdValidator(), firebaseAuth, zValidator('json', androidAuthApproveSchema, invalidInput), async c => {
    const origin = c.req.header('Origin');
    if (origin !== undefined && !trustedOrigins.includes(origin)) {
      return c.json({ error: '許可されていないオリジンです。' }, 403);
    }

    const { request_id } = c.req.valid('param');
    const { confirmation_code } = c.req.valid('json');
    const userId = c.get('firebaseUser').sub;
    const db = c.env.DB;
    const sessionHash = await tokenHash(c.req.header('Authorization')!.split(' ')[1]);
    const user = await db.prepare('SELECT password_hash FROM users WHERE id=?')
      .bind(userId).first<{ password_hash: string }>();
    if (!user?.password_hash) return unavailable(c);

    const approval = await db.prepare(`UPDATE android_login_handoffs
      SET approved_user_id=?, approval_session_hash=?, approval_password_fingerprint=?
      WHERE id=? AND confirmation_code=? AND expires_at>CURRENT_TIMESTAMP
        AND approved_user_id IS NULL AND consumed_at IS NULL
        AND EXISTS (SELECT 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>CURRENT_TIMESTAMP AND u.password_hash=?)
      RETURNING id`)
      .bind(userId, sessionHash, await tokenHash(user.password_hash),
        request_id, confirmation_code, sessionHash, userId, user.password_hash).first();
    if (!approval) return unavailable(c);
    return c.json({ success: true as const });
  })
  .post('/:request_id/exchange', requestIdValidator(), zValidator('json', androidAuthExchangeSchema, invalidInput), async c => {
    const { request_id } = c.req.valid('param');
    const { proof } = c.req.valid('json');
    const proofHash = await tokenHash(proof);
    const db = c.env.DB;
    const approval = await db.prepare(`SELECT approved_user_id,approval_session_hash,approval_password_fingerprint
      FROM android_login_handoffs WHERE id=? AND proof_hash=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP`)
      .bind(request_id, proofHash).first<Approval>();
    if (!approval) return unavailable(c);
    if (!approval.approved_user_id) return c.json({ status: 'pending' as const });

    const profile = await readLoginProfile(db, 'id', approval.approved_user_id);
    if (!profile?.password_hash || await tokenHash(profile.password_hash) !== approval.approval_password_fingerprint) {
      return unavailable(c);
    }

    // Redeem only while the approval's credentials still match. Session issuance
    // also checks this exact password hash, covering a change after redemption.
    const redeemed = await db.prepare(`UPDATE android_login_handoffs SET consumed_at=CURRENT_TIMESTAMP
      WHERE id=? AND proof_hash=? AND approved_user_id=? AND approval_session_hash=?
        AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP
        AND EXISTS (SELECT 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>CURRENT_TIMESTAMP AND u.password_hash=?)
      RETURNING id`)
      .bind(request_id, proofHash, profile.id, approval.approval_session_hash,
        approval.approval_session_hash, profile.id, profile.password_hash).first();
    if (!redeemed) return unavailable(c);
    return c.json({ status: 'signed_in' as const, session: await createLoginResponse(db, profile) });
  })
  .all('*', c => c.notFound());
