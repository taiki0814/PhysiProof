import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { chestInventorySchema, chestLocationSchema, mapChestsSchema } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';
import { chestWeekEnd, populateChestWeek } from '../services/mapChests';
import { findPrefecture } from '../services/prefectureSpots';

type Env = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
export const mapChestRoutes = new Hono<Env>()
  .use('*', firebaseAuth)
  .use('*', async (c, next) => { await next(); c.header('Cache-Control', 'private, no-store'); })
  .post('/nearby', zValidator('json', chestLocationSchema), async c => {
    const { latitude, longitude } = c.req.valid('json');
    const region = findPrefecture(latitude, longitude);
    if (!region) return c.json({ error: '現在地の都道府県を確認できません。GPSを再取得してください。' }, 400);
    const expiresAt = chestWeekEnd(Date.now());
    const db = c.env.DB;
    try {
      await populateChestWeek(db, region, expiresAt);
    } catch (error) {
      console.error('Could not save the weekly chest placement', error);
      return c.json({ error: '宝箱を読み込めませんでした。時間をおいてもう一度お試しください。' }, 503);
    }
    const rows = await db.prepare(`SELECT c.id, c.latitude, c.longitude, (r.user_id IS NOT NULL) AS claimed
      FROM map_chests c LEFT JOIN map_chest_claims r ON r.chest_id=c.id AND r.user_id=?
      WHERE c.prefecture_code=? AND c.expires_at=? ORDER BY c.id`)
      .bind(c.get('firebaseUser').sub, region.code, expiresAt)
      .all<{ id: string; latitude: number; longitude: number; claimed: number }>();
    return c.json(mapChestsSchema.parse({ prefecture: region.name, expires_at: expiresAt,
      chests: rows.results.map(row => ({ ...row, claimed: !!row.claimed })) }));
  })
  .get('/rewards', async c => {
    const rows = await c.env.DB.prepare('SELECT reward_id FROM map_chest_claims WHERE user_id=?')
      .bind(c.get('firebaseUser').sub).all<{ reward_id: string | null }>();
    return c.json(chestInventorySchema.parse({
      rewards: rows.results.flatMap(row => row.reward_id ? [row.reward_id] : []),
      completion_badges: rows.results.filter(row => !row.reward_id).length,
    }));
  });
