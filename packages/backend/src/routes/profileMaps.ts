import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { profileMapQuerySchema } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';

type Env = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
export const profileMapRoutes = new Hono<Env>().get('/:id/territory-map', firebaseAuth,
  zValidator('query', profileMapQuerySchema), async c => {
    c.header('Cache-Control', 'private, no-store');
    const ownerId = c.req.param('id');
    const viewerId = c.get('firebaseUser').sub;
    const db = c.env.DB;
    // Recheck permission for every page; no teammate/admin exception and no
    // client-supplied friendship claim. Data reads repeat the same SQL predicate.
    const owner = await db.prepare(`SELECT id,name FROM users u WHERE id=? AND
      (id=? OR (territory_map_visibility='friends'
        AND EXISTS(SELECT 1 FROM friends WHERE user_id=u.id AND friend_id=?)
        AND EXISTS(SELECT 1 FROM friends WHERE friend_id=u.id AND user_id=?)))`)
      .bind(ownerId, viewerId, viewerId, viewerId).first<{ id: string; name: string }>();
    if (!owner) return c.json({ error: 'このプロフィールマップは非公開、またはフレンド限定です。' }, 403);
    const { mode, before } = c.req.valid('query');
    // Repeat permission in the data query too: an unfriend/privacy change between
    // SQL statements must not allow a geometry response.
    const permitted = `EXISTS(SELECT 1 FROM users u WHERE u.id=? AND (u.id=? OR
      (u.territory_map_visibility='friends'
      AND EXISTS(SELECT 1 FROM friends WHERE user_id=u.id AND friend_id=?)
      AND EXISTS(SELECT 1 FROM friends WHERE friend_id=u.id AND user_id=?))))`;
    const rows = mode === 'history'
      ? await db.prepare(`SELECT id,area_polygon,geometry_json,source FROM personal_territory_history
          WHERE user_id=? AND id<? AND ${permitted} ORDER BY id DESC LIMIT 101`)
        .bind(ownerId, before ?? Number.MAX_SAFE_INTEGER, ownerId, viewerId, viewerId, viewerId).all()
      : await db.prepare(`SELECT id,area_polygon,geometry_json,'current' AS source FROM territories
          WHERE user_id=? AND team_id IS NULL AND ${permitted} ORDER BY id LIMIT 101 OFFSET ?`)
        .bind(ownerId, ownerId, viewerId, viewerId, viewerId, (before ?? 1) - 1).all();
    const territories = rows.results.slice(0, 100);
    return c.json({ owner, mode, territories, next_before: rows.results.length > 100
      ? mode === 'history' ? Number(territories[99].id) : (before ?? 1) + 100 : null });
  });
