import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { createDefaultUniform, personalizeUniform, saveUniformSchema, saveUniformPersonalizationSchema,
  uniformDesignSchema, uniformPersonalizationSchema } from '@my-app/shared';
import type { UniformState, MemberUniformState } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';

type UniformEnv = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
type UserRow = { id: string; name: string; team_id: string | null };
type DesignRow = { design_json: string; revision: number };
type PersonalizationRow = { personalization_json: string; revision: number };
const conflict = '別の画面で更新されています。最新の設定を読み込み直してから保存してください。';
const validationError = (result: { success: boolean }, c: { json: (data: { error: string }, status: 400) => Response }) => {
  if (!result.success) return c.json({ error: 'ユニフォームの設定が不正です。入力内容を確認してください。' }, 400);
};

async function getUser(db: D1Database, id: string) {
  return db.prepare('SELECT id, name, team_id FROM users WHERE id = ?').bind(id).first<UserRow>();
}
async function personalRecord(db: D1Database, user: UserRow) {
  const row = await db.prepare('SELECT design_json, revision FROM user_uniforms WHERE user_id = ?').bind(user.id).first<DesignRow>();
  return { design: row ? uniformDesignSchema.parse(JSON.parse(row.design_json)) : { ...createDefaultUniform(), jersey_name: user.name.slice(0, 12) }, revision: row?.revision ?? 0 };
}
async function teamRecord(db: D1Database, teamId: string) {
  const row = await db.prepare('SELECT design_json, revision FROM team_uniforms WHERE team_id = ?').bind(teamId).first<DesignRow>();
  return { design: row ? uniformDesignSchema.parse(JSON.parse(row.design_json)) : createDefaultUniform(true), revision: row?.revision ?? 0 };
}
async function letteringRecord(db: D1Database, user: UserRow, teamId: string) {
  const row = await db.prepare('SELECT personalization_json, revision FROM team_uniform_personalizations WHERE team_id = ? AND user_id = ?')
    .bind(teamId, user.id).first<PersonalizationRow>();
  return { personalization: row ? uniformPersonalizationSchema.parse(JSON.parse(row.personalization_json)) : { jersey_name: user.name.slice(0, 12), number: '' }, revision: row?.revision ?? 0 };
}
async function currentTeam(db: D1Database, userId: string, teamId: string) {
  return db.prepare('SELECT t.id, t.name, t.owner_id FROM teams t JOIN users u ON u.team_id = t.id WHERE u.id = ? AND t.id = ?')
    .bind(userId, teamId).first<{ id: string; name: string; owner_id: string }>();
}

export const uniformRoutes = new Hono<UniformEnv>()
  .use('*', firebaseAuth)
  .get('/me', async c => {
    const db = c.env.DB;
    const user = await getUser(db, c.get('firebaseUser').sub);
    if (!user) return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    const personal = await personalRecord(db, user);
    let team: UniformState['team'] = null;
    if (user.team_id) {
      const info = await currentTeam(db, user.id, user.team_id);
      if (info) {
        const [common, lettering] = await Promise.all([teamRecord(db, info.id), letteringRecord(db, user, info.id)]);
        team = { id: info.id, name: info.name, can_edit: info.owner_id === user.id, ...common,
          personalization: lettering.personalization, personalization_revision: lettering.revision };
      }
    }
    const uniforms: UniformState = { personal, team };
    return c.json({ uniforms });
  })
  .put('/personal', zValidator('json', saveUniformSchema, validationError), async c => {
    const userId = c.get('firebaseUser').sub;
    if (!await getUser(c.env.DB, userId)) return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    const { design, revision } = c.req.valid('json');
    const result = await c.env.DB.prepare(`
      INSERT INTO user_uniforms (user_id, design_json, revision)
      SELECT ?, ?, 1 WHERE ? = 0 OR EXISTS (SELECT 1 FROM user_uniforms WHERE user_id = ?)
      ON CONFLICT(user_id) DO UPDATE SET design_json = excluded.design_json,
        revision = user_uniforms.revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_uniforms.revision = ?
    `).bind(userId, JSON.stringify(design), revision, userId, revision).run();
    if (!result.meta.changes) return c.json({ error: conflict }, 409);
    return c.json({ success: true, revision: revision + 1 });
  })
  .put('/team/:teamId', zValidator('json', saveUniformSchema, validationError), async c => {
    const userId = c.get('firebaseUser').sub;
    const teamId = c.req.param('teamId');
    const team = await currentTeam(c.env.DB, userId, teamId);
    if (!team || team.owner_id !== userId) return c.json({ error: '所属チームのリーダーのみ共通デザインを編集できます。' }, 403);
    const { design, revision } = c.req.valid('json');
    const result = await c.env.DB.prepare(`
      INSERT INTO team_uniforms (team_id, design_json, revision)
      SELECT ?, ?, 1 WHERE EXISTS (
        SELECT 1 FROM teams t JOIN users u ON u.team_id = t.id WHERE t.id = ? AND t.owner_id = ? AND u.id = ?
      ) AND (? = 0 OR EXISTS (SELECT 1 FROM team_uniforms WHERE team_id = ?))
      ON CONFLICT(team_id) DO UPDATE SET design_json = excluded.design_json,
        revision = team_uniforms.revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE team_uniforms.revision = ?
    `).bind(teamId, JSON.stringify(design), teamId, userId, userId, revision, teamId, revision).run();
    if (!result.meta.changes) return c.json({ error: conflict }, 409);
    return c.json({ success: true, revision: revision + 1 });
  })
  .put('/team/:teamId/personalization', zValidator('json', saveUniformPersonalizationSchema, validationError), async c => {
    const userId = c.get('firebaseUser').sub;
    const teamId = c.req.param('teamId');
    if (!await currentTeam(c.env.DB, userId, teamId)) return c.json({ error: 'このチームに所属していません。' }, 403);
    const { personalization, revision } = c.req.valid('json');
    const result = await c.env.DB.prepare(`
      INSERT INTO team_uniform_personalizations (team_id, user_id, personalization_json, revision)
      SELECT ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND team_id = ?)
        AND (? = 0 OR EXISTS (SELECT 1 FROM team_uniform_personalizations WHERE team_id = ? AND user_id = ?))
      ON CONFLICT(team_id, user_id) DO UPDATE SET personalization_json = excluded.personalization_json,
        revision = team_uniform_personalizations.revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE team_uniform_personalizations.revision = ?
    `).bind(teamId, userId, JSON.stringify(personalization), userId, teamId, revision, teamId, userId, revision).run();
    if (!result.meta.changes) return c.json({ error: conflict }, 409);
    return c.json({ success: true, revision: revision + 1 });
  })
  .get('/members/:userId', async c => {
    const db = c.env.DB;
    const [viewer, member] = await Promise.all([getUser(db, c.get('firebaseUser').sub), getUser(db, c.req.param('userId'))]);
    if (!viewer?.team_id || !member || viewer.team_id !== member.team_id) {
      return c.json({ error: '同じチームのメンバーのみ参照できます。' }, 403);
    }
    const [personal, common, lettering] = await Promise.all([personalRecord(db, member), teamRecord(db, viewer.team_id), letteringRecord(db, member, viewer.team_id)]);
    const uniforms: MemberUniformState = { personal: personal.design, team: personalizeUniform(common.design, lettering.personalization) };
    return c.json({ uniforms });
  });
