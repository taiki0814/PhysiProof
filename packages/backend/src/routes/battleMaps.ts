import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { firebaseAuth } from '../middleware/auth';
import { canRunBattle, loadBattleMap } from '../services/battleMaps';
import type { BattleRecord } from '../services/battleMaps';

export const battleMapRoutes = new Hono<{ Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } }>()
  .get('/:id', firebaseAuth, async c => {
    const db = c.env.DB, userId = c.get('firebaseUser').sub;
    const battle = await db.prepare(`SELECT b.* FROM team_battles b WHERE b.id = ? AND b.map_rules_version = 1
      AND (EXISTS (SELECT 1 FROM team_battle_participants p JOIN users u ON u.team_id = p.team_id WHERE p.battle_id = b.id AND u.id = ?)
        OR EXISTS (SELECT 1 FROM team_battle_members m WHERE m.battle_id = b.id AND m.user_id = ?))
      AND NOT EXISTS (SELECT 1 FROM team_battle_hidden_history h WHERE h.battle_id = b.id AND h.user_id = ?)`).bind(c.req.param('id'), userId, userId, userId).first<BattleRecord>();
    if (!battle) return c.json({ error: '対戦マップが見つかりません。' }, 404);
    try {
      const data = await loadBattleMap(db, battle);
      const user = await db.prepare('SELECT team_id FROM users WHERE id = ?').bind(userId).first<{ team_id: string | null }>();
      data.battle.can_cancel = battle.created_by === userId && data.battle.display_status === 'pending';
      return c.json({ success: true as const, ...data, can_run: !!user?.team_id && await canRunBattle(db, battle.id, userId, user.team_id) });
    } catch (error) {
      console.error('Battle map read failed', error);
      return c.json({ error: '対戦マップを読み込めませんでした。時間をおいて再試行してください。' }, 500);
    }
  });
