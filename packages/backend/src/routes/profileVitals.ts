import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { profileVitalsSchema } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';

type Env = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
export const profileVitalsRoutes = new Hono<Env>().put('/', firebaseAuth, zValidator('json', profileVitalsSchema), async c => {
  const vitals = c.req.valid('json');
  const result = await c.env.DB.prepare('UPDATE users SET current_weight=?,target_weight=?,height=?,gender=? WHERE id=?')
    .bind(vitals.current_weight, vitals.target_weight, vitals.height, vitals.gender, c.get('firebaseUser').sub).run();
  if (!result.meta.changes) return c.json({ error: 'ユーザーが見つかりません。' }, 404);
  return c.json({ success: true, vitals });
});
