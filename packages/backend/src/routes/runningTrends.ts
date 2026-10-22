import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { runningTrendQuerySchema, runningTrendPreferenceSchema, runningTrendResponseSchema,
  runningTrendWindow, RUNNING_TREND_MIN_PARTICIPANTS } from '@my-app/shared';
import type { RunningTrendCell } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';

type Env = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
type Group = { weekday: number; slot: number; runs: number; participants: number; distance_m: number };

export const runningTrendRoutes = new Hono<Env>().use('*', firebaseAuth)
  .get('/', zValidator('query', runningTrendQuerySchema), async c => {
    const { scope, weeks: rawWeeks } = c.req.valid('query');
    const weeks = Number(rawWeeks) as 4 | 8;
    const window = runningTrendWindow(weeks);
    const viewer = c.get('firebaseUser').sub, db = c.env.DB;
    const preference = await db.prepare('SELECT share_running_trends FROM users WHERE id=?').bind(viewer).first<{share_running_trends:number}>();
    if (!preference) return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    const grouped = await db.prepare(`
      SELECT CAST(strftime('%w',datetime(s.started_at,'+9 hours')) AS INTEGER) AS weekday,
        CAST(CAST(strftime('%H',datetime(s.started_at,'+9 hours')) AS INTEGER)/2 AS INTEGER) AS slot,
        COUNT(*) AS runs, COUNT(DISTINCT s.user_id) AS participants, SUM(s.distance_m) AS distance_m
      FROM running_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.status='completed' AND s.distance_m>0 AND s.duration_sec>0
        AND julianday(s.started_at)>=julianday(?) AND julianday(s.started_at)<julianday(?)
        AND julianday(s.completed_at)<julianday(?) AND julianday(s.completed_at)>=julianday(s.started_at)
        AND ${scope === 'personal' ? 's.user_id=?' : "u.share_running_trends=1 AND julianday(s.started_at)>=julianday(u.running_trends_consented_at)"}
      GROUP BY weekday,slot
    `).bind(window.starts_at, window.ends_at, window.ends_at, ...(scope === 'personal' ? [viewer] : [])).all<Group>();
    const groups = new Map(grouped.results.map(g => [g.weekday * 12 + g.slot, g]));
    const maxRuns = Math.max(1, ...grouped.results.map(g => g.runs));
    const cells: RunningTrendCell[] = Array.from({ length: 84 }, (_, i) => {
      const row = groups.get(i), runs = row?.runs ?? 0, participants = row?.participants ?? 0;
      const level = scope === 'community'
        ? participants < RUNNING_TREND_MIN_PARTICIPANTS ? 'insufficient' : participants < 10 ? 'low' : participants < 20 ? 'medium' : 'high'
        : !runs ? 'none' : runs / maxRuns <= 1/3 ? 'low' : runs / maxRuns <= 2/3 ? 'medium' : 'high';
      return { weekday: Math.floor(i / 12), slot: i % 12, level, count: scope === 'personal' ? runs : null };
    });
    const payload = runningTrendResponseSchema.parse({ ...window, weeks, scope, cells,
      timezone: 'Asia/Tokyo', method: 'run_starts', sharing: preference.share_running_trends === 1,
      min_participants: RUNNING_TREND_MIN_PARTICIPANTS,
      summary: scope === 'personal' ? { runs: grouped.results.reduce((n,g)=>n+g.runs,0), distance_m: grouped.results.reduce((n,g)=>n+g.distance_m,0) } : null,
    });
    return c.json(payload);
  })
  .put('/preferences', zValidator('json', runningTrendPreferenceSchema), async c => {
    const { sharing } = c.req.valid('json');
    // Repeated opt-in does not backdate or extend consent; re-enabling starts anew.
    const updated = await c.env.DB.prepare(`UPDATE users SET running_trends_consented_at=CASE
        WHEN ?=0 THEN NULL WHEN share_running_trends=0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now')
        ELSE running_trends_consented_at END, share_running_trends=? WHERE id=?`)
      .bind(sharing ? 1 : 0, sharing ? 1 : 0, c.get('firebaseUser').sub).run();
    if (!updated.meta.changes) return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    return c.json({ sharing });
  });
