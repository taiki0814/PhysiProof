import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { STUDIO_UNIFORM_COLLECTION, createDefaultUniform, uniformTemplateListSchema } from '@my-app/shared';
import { adminUniformTemplateRoutes, publishedUniformTemplateRoutes } from './routes/uniformTemplates';
import { uniformRoutes } from './routes/uniforms';

type Native = { exec: (sql: string) => void; close: () => void; prepare: (sql: string) => {
  get: (...args: unknown[]) => Record<string, unknown> | undefined;
  all: (...args: unknown[]) => Record<string, unknown>[]; run: (...args: unknown[]) => { changes: number };
} };
let SQLite: (new (path: string) => Native) | undefined;
try { SQLite = createRequire(import.meta.url)('node:sqlite').DatabaseSync; } catch {}
const migration = (name: string) => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8');
const seed = migration('0036_add_studio_uniform_collection.sql');
const app = new Hono<{ Bindings: { DB: D1Database } }>()
  .route('/templates', publishedUniformTemplateRoutes).route('/admin/templates', adminUniformTemplateRoutes).route('/uniforms', uniformRoutes);
let native: Native;
const db = { prepare: (sql: string) => {
  const statement = (args: unknown[]) => ({ bind: (...values: unknown[]) => statement(values),
    first: async () => native.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: native.prepare(sql).all(...args), success: true }),
    run: async () => ({ meta: native.prepare(sql).run(...args), success: true }),
  });
  return statement([]);
} } as unknown as D1Database;
const request = (path: string, user = 'runner', method = 'GET', json?: unknown) => app.request(path, {
  method, headers: { Authorization: 'Bearer test-token:' + user, 'Content-Type': 'application/json' },
  body: json ? JSON.stringify(json) : undefined,
}, { DB: db });

(SQLite ? describe : describe.skip)('original collection with real SQLite migrations and API routes', () => {
  let originals: Record<string, unknown>[];
  beforeEach(() => {
    native = new SQLite!(':memory:');
    native.exec("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,role TEXT,team_id TEXT); CREATE TABLE teams(id TEXT PRIMARY KEY,name TEXT,owner_id TEXT); INSERT INTO users VALUES('admin','Admin','admin',NULL),('runner','Runner','user',NULL);");
    native.exec(migration('0029_add_uniforms.sql'));
    native.exec(migration('0030_add_uniform_templates.sql'));
    originals = native.prepare('SELECT * FROM uniform_templates ORDER BY id').all();
    native.prepare('INSERT INTO user_uniforms(user_id,design_json) VALUES(?,?)').run('admin', JSON.stringify(createDefaultUniform()));
    native.exec(seed);
  });
  afterEach(() => native.close());

  it('adds exactly the six schema-valid Studio records without touching the old catalog or saved uniforms', () => {
    expect(native.prepare('SELECT * FROM uniform_templates WHERE id LIKE ? ORDER BY id').all('builtin-%')).toEqual(originals);
    for (const p of STUDIO_UNIFORM_COLLECTION) {
      const row = native.prepare('SELECT * FROM uniform_templates WHERE id=?').get(p.id)!;
      expect(row).toMatchObject({ name: p.name, category: p.category, description: p.description, status: 'published', sort_order: p.sort_order, revision: 1 });
      expect(JSON.parse(String(row.design_json))).toEqual(p.design);
    }
    expect(native.prepare('SELECT count(*) AS n FROM uniform_templates').get()?.n).toBe(12);
    expect(JSON.parse(String(native.prepare('SELECT design_json FROM user_uniforms WHERE user_id=?').get('admin')?.design_json))).toEqual(createDefaultUniform());
  });
  it('does not overwrite a renamed/hidden/updated record if the seed is replayed', () => {
    const id = STUDIO_UNIFORM_COLLECTION[0].id;
    native.prepare("UPDATE uniform_templates SET name='My edit',status='hidden',revision=4 WHERE id=?").run(id);
    const before = native.prepare('SELECT * FROM uniform_templates ORDER BY id').all();
    native.exec(seed);
    expect(native.prepare('SELECT * FROM uniform_templates ORDER BY id').all()).toEqual(before);
  });
  it('lists the collection through the real user and administrator catalogs with search/category filters', async () => {
    const result = await request('/templates');
    expect(result.status).toBe(200);
    expect(uniformTemplateListSchema.parse(await result.json()).total).toBe(12);
    const filtered = await request('/templates?search=TERRAIN&category=' + encodeURIComponent('アウトドア'));
    const body = uniformTemplateListSchema.parse(await filtered.json());
    expect(body.total).toBe(1); expect(body.templates[0].id).toBe('studio-terrain-club');
    expect((await request('/admin/templates', 'runner')).status).toBe(403);
    const admin = await request('/admin/templates', 'admin');
    expect(uniformTemplateListSchema.parse(await admin.json()).total).toBe(12);
  });
  it.each(STUDIO_UNIFORM_COLLECTION)('saves $name with personalized lettering through the real uniform API', async p => {
    const design = { ...p.design, jersey_name: 'RUNNER', number: '012' };
    const response = await request('/uniforms/personal', 'runner', 'PUT', { design, revision: 0 });
    expect(response.status).toBe(200);
    expect(JSON.parse(String(native.prepare('SELECT design_json FROM user_uniforms WHERE user_id=?').get('runner')?.design_json))).toEqual(design);
    expect(native.prepare('SELECT revision FROM uniform_templates WHERE id=?').get(p.id)?.revision).toBe(1);
  });
  it.each(STUDIO_UNIFORM_COLLECTION)('saves $name for a team independently of the personal uniform', async p => {
    native.exec("INSERT INTO teams VALUES('club','Running club','runner'); UPDATE users SET team_id='club' WHERE id='runner';");
    const response = await request('/uniforms/team/club', 'runner', 'PUT', { design: p.design, revision: 0 });
    expect(response.status).toBe(200);
    expect(JSON.parse(String(native.prepare('SELECT design_json FROM team_uniforms WHERE team_id=?').get('club')?.design_json))).toEqual(p.design);
    expect(native.prepare('SELECT * FROM user_uniforms WHERE user_id=?').get('runner')).toBeUndefined();
    expect((await request('/uniforms/team/club', 'admin', 'PUT', { design: p.design, revision: 1 })).status).toBe(403);
  });
});
