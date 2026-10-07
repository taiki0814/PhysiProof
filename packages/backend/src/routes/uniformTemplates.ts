import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { uniformTemplateSchema, uniformTemplateQuerySchema, adminUniformTemplateQuerySchema,
  saveUniformTemplateSchema } from '@my-app/shared';
import type { UniformTemplate, UniformTemplateList } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';

type TemplateEnv = { Bindings: { DB: D1Database }; Variables: { firebaseUser: { sub: string } } };
type Row = Omit<UniformTemplate, 'design'> & { design_json: string };
const conflict = '別の画面で更新されています。未保存の変更を確認し、最新のテンプレートを読み込み直してください。';
const validationError = (result: { success: boolean }, c: { json: (data: { error: string }, status: 400) => Response }) => {
  if (!result.success) return c.json({ error: 'テンプレートの入力内容を確認してください。' }, 400);
};
const toTemplate = (row: Row): UniformTemplate => {
  const { design_json, ...metadata } = row;
  return uniformTemplateSchema.parse({ ...metadata, design: JSON.parse(design_json) });
};
async function record(db: D1Database, id: string) {
  const row = await db.prepare('SELECT * FROM uniform_templates WHERE id = ?').bind(id).first<Row>();
  return row ? toTemplate(row) : null;
}
async function list(db: D1Database, query: { search: string; category: string; page: string; limit: string; status?: string }, admin: boolean): Promise<UniformTemplateList> {
  const status = admin ? query.status || 'all' : 'published';
  const where = `(? = 'all' OR status = ?) AND (? = '' OR category = ?)
    AND (? = '' OR instr(lower(name || ' ' || category || ' ' || description), lower(?)) > 0)`;
  const values = [status, status, query.category, query.category, query.search, query.search];
  const limit = Number(query.limit);
  const [rows, count, categories] = await Promise.all([
    db.prepare(`SELECT * FROM uniform_templates WHERE ${where} ORDER BY sort_order, name COLLATE NOCASE, id LIMIT ? OFFSET ?`)
      .bind(...values, limit, (Number(query.page) - 1) * limit).all<Row>(),
    db.prepare(`SELECT COUNT(*) AS total FROM uniform_templates WHERE ${where}`).bind(...values).first<{ total: number }>(),
    db.prepare(`SELECT DISTINCT category FROM uniform_templates WHERE (? = 'all' OR status = ?) ORDER BY category`)
      .bind(admin ? 'all' : 'published', admin ? 'all' : 'published').all<{ category: string }>(),
  ]);
  return { templates: rows.results.map(toTemplate), total: count?.total ?? 0, categories: categories.results.map(row => row.category) };
}

export const publishedUniformTemplateRoutes = new Hono<TemplateEnv>()
  .use('*', firebaseAuth)
  .get('/', zValidator('query', uniformTemplateQuerySchema, validationError), async c => {
    if (!await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(c.get('firebaseUser').sub).first()) {
      return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    }
    return c.json(await list(c.env.DB, c.req.valid('query'), false));
  });

export const adminUniformTemplateRoutes = new Hono<TemplateEnv>()
  .use('*', firebaseAuth)
  .use('*', async (c, next) => {
    const user = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(c.get('firebaseUser').sub).first<{ role: string }>();
    if (user?.role !== 'admin') return c.json({ error: '管理者のみテンプレートを管理できます。' }, 403);
    await next();
  })
  .get('/', zValidator('query', adminUniformTemplateQuerySchema, validationError), async c => {
    return c.json(await list(c.env.DB, c.req.valid('query'), true));
  })
  .get('/:id', async c => {
    const template = await record(c.env.DB, c.req.param('id'));
    return template ? c.json({ template }) : c.json({ error: 'テンプレートが見つかりません。' }, 404);
  })
  .post('/', zValidator('json', saveUniformTemplateSchema, validationError), async c => {
    const value = c.req.valid('json');
    if (value.revision !== 0) return c.json({ error: '新規テンプレートのリビジョンが不正です。' }, 400);
    const id = crypto.randomUUID();
    const result = await c.env.DB.prepare(`
      INSERT INTO uniform_templates (id, name, category, description, status, sort_order, design_json)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin')
    `).bind(id, value.name, value.category, value.description, value.status, value.sort_order, JSON.stringify(value.design), c.get('firebaseUser').sub).run();
    if (!result.meta.changes) return c.json({ error: '管理者権限がありません。' }, 403);
    const template = (await record(c.env.DB, id))!;
    return c.json({ template }, 201);
  })
  .put('/:id', zValidator('json', saveUniformTemplateSchema, validationError), async c => {
    const id = c.req.param('id');
    const value = c.req.valid('json');
    const result = await c.env.DB.prepare(`
      UPDATE uniform_templates SET name = ?, category = ?, description = ?, status = ?, sort_order = ?, design_json = ?,
        revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin')
    `).bind(value.name, value.category, value.description, value.status, value.sort_order, JSON.stringify(value.design), id, value.revision, c.get('firebaseUser').sub).run();
    if (!result.meta.changes) {
      if (!await record(c.env.DB, id)) return c.json({ error: 'テンプレートが見つかりません。' }, 404);
      return c.json({ error: conflict }, 409);
    }
    return c.json({ template: (await record(c.env.DB, id))! });
  })
  .post('/:id/duplicate', async c => {
    const source = await record(c.env.DB, c.req.param('id'));
    if (!source) return c.json({ error: 'テンプレートが見つかりません。' }, 404);
    const id = crypto.randomUUID();
    const result = await c.env.DB.prepare(`
      INSERT INTO uniform_templates (id, name, category, description, status, sort_order, design_json)
      SELECT ?, ?, ?, ?, 'draft', ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin')
    `).bind(id, source.name.slice(0, 45) + ' (複製)', source.category, source.description, source.sort_order, JSON.stringify(source.design), c.get('firebaseUser').sub).run();
    if (!result.meta.changes) return c.json({ error: '管理者権限がありません。' }, 403);
    return c.json({ template: (await record(c.env.DB, id))! }, 201);
  });
