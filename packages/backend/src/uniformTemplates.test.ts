import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
  createDefaultUniform, uniformTemplateListSchema, uniformTemplateSchema,
} from '@my-app/shared';
import type { UniformTemplate } from '@my-app/shared';
import { adminUniformTemplateRoutes, publishedUniformTemplateRoutes } from './routes/uniformTemplates';

const adminId = 'admin-user';
const memberId = 'member-user';
const templateId = 'template-1';
const newId = '00000000-0000-4000-8000-000000000001';
const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const validationError = 'テンプレートの入力内容を確認してください。';
const notFoundError = 'テンプレートが見つかりません。';
type TemplateRow = Omit<UniformTemplate, 'design'> & { design_json: string };

const template = (overrides: Partial<UniformTemplate> = {}): UniformTemplate => ({
  id: templateId, name: 'VOLT RUN', category: 'スポーツ', description: 'ランニング向け',
  status: 'published', sort_order: 10, design: createDefaultUniform(), revision: 3,
  created_at: '2026-10-07 01:00:00', updated_at: '2026-10-07 02:00:00', ...overrides,
});
const row = (value: UniformTemplate): TemplateRow => {
  const { design, ...metadata } = value;
  return { ...metadata, design_json: JSON.stringify(design) };
};
const payload = () => ({
  name: '  INK DASH  ', category: '  インク  ', description: '  新しいデザイン  ',
  status: 'draft' as const, sort_order: 7,
  design: { ...createDefaultUniform(), jersey_name: '  RUNNER  ', number: '007' }, revision: 0,
});
const savedPayload = () => ({
  ...payload(), name: 'INK DASH', category: 'インク', description: '新しいデザイン',
  design: { ...payload().design, jersey_name: 'RUNNER' },
});

type DatabaseOptions = {
  users?: { id: string; role: string }[];
  records?: Record<string, TemplateRow>;
  listRows?: TemplateRow[];
  total?: number | null;
  categories?: string[];
  changes?: number;
};

// This is a non-executing D1 boundary mock, not a SQLite simulator. List/read
// results and affected rows are supplied explicitly. Tests assert SQL clauses,
// per-statement bindings and handler responses; they do not prove SQL semantics.
const createDatabase = (options: DatabaseOptions = {}) => {
  const users = options.users ?? [
    { id: adminId, role: 'admin' }, { id: memberId, role: 'user' },
  ];
  const readFirst = (sql: string, params: unknown[]): unknown => {
    if (sql === 'SELECT role FROM users WHERE id = ?') {
      const user = users.find(user => user.id === params[0]);
      return user ? { role: user.role } : null;
    }
    if (sql === 'SELECT id FROM users WHERE id = ?') {
      const user = users.find(user => user.id === params[0]);
      return user ? { id: user.id } : null;
    }
    if (sql === 'SELECT * FROM uniform_templates WHERE id = ?') {
      return options.records?.[String(params[0])] ?? null;
    }
    if (sql.startsWith('SELECT COUNT(*) AS total FROM uniform_templates WHERE ')) {
      return options.total === null ? null : { total: options.total ?? options.listRows?.length ?? 0 };
    }
    throw new Error(`Unexpected template first(): ${sql}`);
  };
  const readAll = (sql: string) => {
    if (sql.startsWith('SELECT * FROM uniform_templates WHERE ')) return options.listRows ?? [];
    if (sql.startsWith('SELECT DISTINCT category FROM uniform_templates WHERE ')) {
      return (options.categories ?? []).map(category => ({ category }));
    }
    throw new Error(`Unexpected template all(): ${sql}`);
  };
  const prepareStatement = (sql: string) => {
    const bind = vi.fn().mockReturnThis();
    return {
      sql, bind,
      first: vi.fn(async () => readFirst(normalizeSql(sql), bind.mock.calls[0] ?? [])),
      all: vi.fn(async () => ({ success: true, results: readAll(normalizeSql(sql)), meta: {} })),
      run: vi.fn(async () => {
        if (!/^(INSERT INTO|UPDATE) uniform_templates /.test(normalizeSql(sql))) {
          throw new Error(`Unexpected template write: ${sql}`);
        }
        return { success: true, results: [], meta: { changes: options.changes ?? 1 } };
      }),
    };
  };
  const statements: ReturnType<typeof prepareStatement>[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const statement = prepareStatement(sql);
      statements.push(statement);
      return statement;
    }),
  };
  return { db, statements };
};

type Database = ReturnType<typeof createDatabase>;
type RequestOptions = { userId?: string | null; method?: string; body?: unknown };
const request = (database: Database, route: 'admin' | 'published', path: string, options: RequestOptions = {}) => {
  const userId = options.userId === undefined ? (route === 'admin' ? adminId : memberId) : options.userId;
  const router = route === 'admin' ? adminUniformTemplateRoutes : publishedUniformTemplateRoutes;
  return router.request(path, {
    method: options.method ?? 'GET',
    headers: {
      ...(userId === null ? {} : { Authorization: `Bearer test-token:${userId}` }),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }, { DB: database.db as unknown as D1Database });
};

const expectNoWrite = (database: Database) => {
  expect(database.statements.filter(statement => /^(INSERT|UPDATE|DELETE) /.test(normalizeSql(statement.sql)))).toHaveLength(0);
  for (const statement of database.statements) expect(statement.run).not.toHaveBeenCalled();
};
const getStatement = (database: Database, prefix: string) => {
  const matches = database.statements.filter(statement => normalizeSql(statement.sql).startsWith(prefix));
  expect(matches).toHaveLength(1);
  return matches[0];
};
const getWrite = (database: Database) => {
  const matches = database.statements.filter(statement => statement.run.mock.calls.length > 0);
  expect(matches).toHaveLength(1);
  expect(matches[0].run).toHaveBeenCalledOnce();
  return matches[0];
};
const expectAdminGuard = (statement: Database['statements'][number]) => {
  expect(normalizeSql(statement.sql)).toContain("EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin')");
  expect(statement.bind.mock.calls[0].at(-1)).toBe(adminId);
};
const readTemplate = async (response: Response) => {
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('template' in body)) {
    throw new Error('Expected a template response');
  }
  return uniformTemplateSchema.parse(body.template);
};
const adminEndpoints = [
  { path: '/', method: 'GET' },
  { path: `/${templateId}`, method: 'GET' },
  { path: '/', method: 'POST', body: payload() },
  { path: `/${templateId}`, method: 'PUT', body: { ...payload(), revision: 3 } },
  { path: `/${templateId}/duplicate`, method: 'POST' },
];

beforeEach(() => { vi.spyOn(crypto, 'randomUUID').mockReturnValue(newId); });
afterEach(() => { vi.restoreAllMocks(); });

describe('uniform template authentication and administration', () => {
  it.each([
    { route: 'published' as const, path: '/', method: 'GET' },
    ...adminEndpoints.map(endpoint => ({ ...endpoint, route: 'admin' as const })),
  ])('requires authentication for $route $method $path before reading D1', async ({ route, path, ...options }) => {
    const database = createDatabase();
    const response = await request(database, route, path, { ...options, userId: null });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: '認証トークンが不足しています。' });
    expect(database.db.prepare).not.toHaveBeenCalled();
  });

  it.each(adminEndpoints)('denies a normal user admin $method $path before catalog access', async ({ path, ...options }) => {
    const database = createDatabase();
    const response = await request(database, 'admin', path, { ...options, userId: memberId });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: '管理者のみテンプレートを管理できます。' });
    expect(database.statements).toHaveLength(1);
    expect(database.statements[0].bind).toHaveBeenCalledWith(memberId);
    expectNoWrite(database);
  });

  it.each(['owner', 'superadmin', 'ADMIN'])('does not treat role %s as admin', async role => {
    const database = createDatabase({ users: [{ id: adminId, role }] });
    const response = await request(database, 'admin', '/');
    expect(response.status).toBe(403);
    expect(database.statements).toHaveLength(1);
    expectNoWrite(database);
  });

  it('rejects an authenticated identity missing from the admin user table', async () => {
    const database = createDatabase();
    expect((await request(database, 'admin', '/', { userId: 'missing-user' })).status).toBe(403);
    expect(database.statements[0].bind).toHaveBeenCalledWith('missing-user');
    expect(database.statements).toHaveLength(1);
  });

  it('returns 404 for an authenticated but missing catalog user', async () => {
    const database = createDatabase();
    const response = await request(database, 'published', '/', { userId: 'missing-user' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'ユーザーが見つかりません。' });
    expect(database.statements[0].bind).toHaveBeenCalledWith('missing-user');
    expect(database.statements).toHaveLength(1);
  });
});

describe('uniform template list query construction and response mapping', () => {
  const listPrefix = 'SELECT * FROM uniform_templates WHERE ';
  const countPrefix = 'SELECT COUNT(*) AS total FROM uniform_templates WHERE ';
  const categoriesPrefix = 'SELECT DISTINCT category FROM uniform_templates WHERE ';

  it('pins user list/count/categories to published and ignores an attempted all-status override', async () => {
    const value = template();
    const database = createDatabase({ listRows: [row(value)], total: 30, categories: ['スポーツ'] });
    const response = await request(database, 'published', '/?status=all');
    expect(response.status).toBe(200);
    expect(uniformTemplateListSchema.parse(await response.json())).toEqual({ templates: [value], total: 30, categories: ['スポーツ'] });
    expect(getStatement(database, 'SELECT id FROM users WHERE id = ?').bind).toHaveBeenCalledWith(memberId);
    expect(getStatement(database, listPrefix).bind).toHaveBeenCalledWith('published', 'published', '', '', '', '', 12, 0);
    expect(getStatement(database, countPrefix).bind).toHaveBeenCalledWith('published', 'published', '', '', '', '');
    expect(getStatement(database, categoriesPrefix).bind).toHaveBeenCalledWith('published', 'published');
    for (const prefix of [listPrefix, countPrefix, categoriesPrefix]) {
      expect(normalizeSql(getStatement(database, prefix).sql)).toContain("(? = 'all' OR status = ?)");
    }
    expectNoWrite(database);
  });

  it('defaults the admin list to all statuses and maps every returned record', async () => {
    const values = (['draft', 'published', 'hidden'] as const).map((status, index) => template({ id: `template-${index}`, status }));
    const database = createDatabase({ listRows: values.map(row), categories: ['スポーツ', 'インク'] });
    const response = await request(database, 'admin', '/');
    expect(response.status).toBe(200);
    expect(uniformTemplateListSchema.parse(await response.json())).toEqual({ templates: values, total: 3, categories: ['スポーツ', 'インク'] });
    expect(getStatement(database, listPrefix).bind).toHaveBeenCalledWith('all', 'all', '', '', '', '', 12, 0);
    expect(getStatement(database, countPrefix).bind).toHaveBeenCalledWith('all', 'all', '', '', '', '');
    expect(getStatement(database, categoriesPrefix).bind).toHaveBeenCalledWith('all', 'all');
    expectNoWrite(database);
  });

  it.each(['draft', 'published', 'hidden'])('binds admin status filter %s to list and count', async status => {
    const database = createDatabase();
    expect((await request(database, 'admin', `/?status=${status}`)).status).toBe(200);
    expect(getStatement(database, listPrefix).bind).toHaveBeenCalledWith(status, status, '', '', '', '', 12, 0);
    expect(getStatement(database, countPrefix).bind).toHaveBeenCalledWith(status, status, '', '', '', '');
    expect(getStatement(database, categoriesPrefix).bind).toHaveBeenCalledWith('all', 'all');
  });

  it.each(['admin', 'published'] as const)('binds literal search/category and pagination independently for %s', async route => {
    const search = "%_' OR 1=1 --";
    const category = 'シティ';
    const query = new URLSearchParams({ search: `  ${search}  `, category: ` ${category} `, page: '3', limit: '24' });
    const database = createDatabase();
    expect((await request(database, route, `/?${query}`)).status).toBe(200);
    const status = route === 'admin' ? 'all' : 'published';
    const list = getStatement(database, listPrefix);
    const count = getStatement(database, countPrefix);
    expect(list.bind).toHaveBeenCalledWith(status, status, category, category, search, search, 24, 48);
    expect(count.bind).toHaveBeenCalledWith(status, status, category, category, search, search);
    for (const statement of [list, count]) {
      const sql = normalizeSql(statement.sql);
      expect(sql).toContain("(? = '' OR category = ?)");
      expect(sql).toContain("instr(lower(name || ' ' || category || ' ' || description), lower(?)) > 0");
      expect(sql).not.toContain(search);
      expect(sql).not.toContain(category);
      expect(sql).not.toMatch(/\bLIKE\b/i);
    }
    expect(normalizeSql(list.sql)).toContain('ORDER BY sort_order, name COLLATE NOCASE, id LIMIT ? OFFSET ?');
    expect(list.all).toHaveBeenCalledOnce();
    expect(count.first).toHaveBeenCalledOnce();
    expectNoWrite(database);
  });

  it('returns an empty catalog and a zero count when the count read is null', async () => {
    const database = createDatabase({ total: null });
    const response = await request(database, 'published', '/');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ templates: [], total: 0, categories: [] });
  });

  it.each([
    { route: 'published' as const, query: 'page=0' },
    { route: 'admin' as const, query: 'page=01' },
    { route: 'published' as const, query: 'limit=1000' },
    { route: 'admin' as const, query: 'status=deleted' },
    { route: 'published' as const, query: `search=${'x'.repeat(81)}` },
    { route: 'admin' as const, query: `category=${'x'.repeat(31)}` },
  ])('rejects invalid $route query $query before querying the catalog', async ({ route, query }) => {
    const database = createDatabase();
    const response = await request(database, route, `/?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: validationError });
    expect(database.statements.every(statement => !statement.sql.includes('uniform_templates'))).toBe(true);
    expectNoWrite(database);
  });
});

describe('admin template reads', () => {
  it.each(['draft', 'published', 'hidden'] as const)('allows an admin to read a %s record by its bound ID', async status => {
    const value = template({ status });
    const database = createDatabase({ records: { [templateId]: row(value) } });
    const response = await request(database, 'admin', `/${templateId}`);
    expect(response.status).toBe(200);
    expect(await readTemplate(response)).toEqual(value);
    expect(getStatement(database, 'SELECT * FROM uniform_templates WHERE id = ?').bind).toHaveBeenCalledWith(templateId);
    expectNoWrite(database);
  });

  it('returns 404 for a missing admin record', async () => {
    const database = createDatabase();
    const response = await request(database, 'admin', '/missing-template');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: notFoundError });
    expectNoWrite(database);
  });
});

describe('admin template create and edit writes', () => {
  it.each(['draft', 'published', 'hidden'] as const)('creates a %s template with normalized inputs and an admin-guarded insert', async status => {
    const saved = savedPayload();
    const value = template({ ...saved, id: newId, status, revision: 1 });
    const database = createDatabase({ records: { [newId]: row(value) } });
    const response = await request(database, 'admin', '/', { method: 'POST', body: { ...payload(), status } });
    expect(response.status).toBe(201);
    expect(await readTemplate(response)).toEqual(value);
    const write = getWrite(database);
    expect(normalizeSql(write.sql)).toContain('INSERT INTO uniform_templates (id, name, category, description, status, sort_order, design_json) SELECT ?, ?, ?, ?, ?, ?, ? WHERE');
    expect(write.bind).toHaveBeenCalledWith(newId, saved.name, saved.category, saved.description, status, saved.sort_order, JSON.stringify(saved.design), adminId);
    expectAdminGuard(write);
    expect(getStatement(database, 'SELECT * FROM uniform_templates WHERE id = ?').bind).toHaveBeenCalledWith(newId);
  });

  it('rejects a nonzero initial revision without writing', async () => {
    const database = createDatabase();
    const response = await request(database, 'admin', '/', { method: 'POST', body: { ...payload(), revision: 1 } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '新規テンプレートのリビジョンが不正です。' });
    expectNoWrite(database);
  });

  it.each(['draft', 'published', 'hidden'] as const)('edits status to %s using both revision and admin guards', async status => {
    const saved = savedPayload();
    const value = template({ ...saved, status, revision: 4 });
    const database = createDatabase({ records: { [templateId]: row(value) } });
    const response = await request(database, 'admin', `/${templateId}`, { method: 'PUT', body: { ...payload(), status, revision: 3 } });
    expect(response.status).toBe(200);
    expect(await readTemplate(response)).toEqual(value);
    const write = getWrite(database);
    const sql = normalizeSql(write.sql);
    expect(sql).toContain('UPDATE uniform_templates SET name = ?, category = ?, description = ?, status = ?, sort_order = ?, design_json = ?');
    expect(sql).toContain('revision = revision + 1, updated_at = CURRENT_TIMESTAMP');
    expect(sql).toContain('WHERE id = ? AND revision = ? AND EXISTS');
    expect(write.bind).toHaveBeenCalledWith(saved.name, saved.category, saved.description, status, saved.sort_order, JSON.stringify(saved.design), templateId, 3, adminId);
    expectAdminGuard(write);
  });

  it('can submit a metadata-only edit without changing the bound design snapshot', async () => {
    const original = template();
    const value = template({ name: 'RENAMED', revision: 4 });
    const database = createDatabase({ records: { [templateId]: row(value) } });
    const response = await request(database, 'admin', `/${templateId}`, { method: 'PUT', body: {
      name: 'RENAMED', category: original.category, description: original.description,
      status: original.status, sort_order: original.sort_order, design: original.design, revision: original.revision,
    } });
    expect(response.status).toBe(200);
    expect((await readTemplate(response)).design).toEqual(original.design);
    expect(getWrite(database).bind.mock.calls[0][5]).toBe(JSON.stringify(original.design));
  });

  it.each([
    { name: '  ' }, { category: '' }, { description: 'x'.repeat(161) },
    { status: 'all' }, { sort_order: -1 }, { revision: -1 },
    { design: { ...createDefaultUniform(), pattern_id: 'unknown' } },
    { design: { ...createDefaultUniform(), svg: '<svg/>' } }, { user_id: memberId },
  ])('rejects invalid create/edit inputs without a write (%#)', async invalid => {
    for (const endpoint of [{ path: '/', method: 'POST' }, { path: `/${templateId}`, method: 'PUT' }]) {
      const database = createDatabase();
      const response = await request(database, 'admin', endpoint.path, {
        method: endpoint.method, body: { ...payload(), ...invalid },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: validationError });
      expectNoWrite(database);
    }
  });

  it('returns 409 when a revision-guarded update affects no rows but the record still exists', async () => {
    const value = template({ revision: 8 });
    const database = createDatabase({ changes: 0, records: { [templateId]: row(value) } });
    const response = await request(database, 'admin', `/${templateId}`, { method: 'PUT', body: { ...payload(), revision: 3 } });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: '別の画面で更新されています。未保存の変更を確認し、最新のテンプレートを読み込み直してください。' });
    const write = getWrite(database);
    expect(write.bind.mock.calls[0].slice(-3)).toEqual([templateId, 3, adminId]);
    expect(normalizeSql(write.sql)).toContain('WHERE id = ? AND revision = ?');
    expectAdminGuard(write);
    expect(getStatement(database, 'SELECT * FROM uniform_templates WHERE id = ?').bind).toHaveBeenCalledWith(templateId);
  });

  it('returns 404 rather than a conflict when a zero-row update targets a missing record', async () => {
    const database = createDatabase({ changes: 0 });
    const response = await request(database, 'admin', '/missing-template', { method: 'PUT', body: { ...payload(), revision: 3 } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: notFoundError });
    expect(getWrite(database).bind.mock.calls[0].slice(-3)).toEqual(['missing-template', 3, adminId]);
  });

  it('returns 403 when an admin-guarded create affects no rows, without reading back a record', async () => {
    const database = createDatabase({ changes: 0 });
    const response = await request(database, 'admin', '/', { method: 'POST', body: payload() });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: '管理者権限がありません。' });
    expectAdminGuard(getWrite(database));
    expect(database.statements.some(statement => normalizeSql(statement.sql) === 'SELECT * FROM uniform_templates WHERE id = ?')).toBe(false);
  });
});

describe('admin template duplication', () => {
  it.each(['draft', 'published', 'hidden'] as const)('duplicates a %s source as a new draft, preserving its full design', async status => {
    const source = template({ status, revision: 8, design: {
      ...createDefaultUniform(true), jersey_name: 'TEAM', number: '042',
      colors: { ...createDefaultUniform(true).colors, body: '#ABCDEF' },
    } });
    const copy = template({ ...source, id: newId, name: `${source.name} (複製)`, status: 'draft', revision: 1 });
    const database = createDatabase({ records: { [templateId]: row(source), [newId]: row(copy) } });
    const response = await request(database, 'admin', `/${templateId}/duplicate`, { method: 'POST' });
    expect(response.status).toBe(201);
    expect(await readTemplate(response)).toEqual(copy);
    const write = getWrite(database);
    const sql = normalizeSql(write.sql);
    expect(sql).toContain("SELECT ?, ?, ?, ?, 'draft', ?, ? WHERE");
    expect(sql).not.toContain('UPDATE uniform_templates');
    expect(write.bind).toHaveBeenCalledWith(newId, copy.name, source.category, source.description, source.sort_order, JSON.stringify(source.design), adminId);
    expectAdminGuard(write);
    const reads = database.statements.filter(statement => normalizeSql(statement.sql) === 'SELECT * FROM uniform_templates WHERE id = ?');
    expect(reads).toHaveLength(2);
    expect(reads[0].bind).toHaveBeenCalledWith(templateId);
    expect(reads[1].bind).toHaveBeenCalledWith(newId);
  });

  it('keeps a duplicated maximum-length name within the 50-character schema limit', async () => {
    const source = template({ name: 'あ'.repeat(50) });
    const copy = template({ ...source, id: newId, name: `${'あ'.repeat(45)} (複製)`, status: 'draft', revision: 1 });
    const database = createDatabase({ records: { [templateId]: row(source), [newId]: row(copy) } });
    const response = await request(database, 'admin', `/${templateId}/duplicate`, { method: 'POST' });
    expect(response.status).toBe(201);
    expect((await readTemplate(response)).name).toHaveLength(50);
    expect(getWrite(database).bind.mock.calls[0][1]).toBe(copy.name);
  });

  it('returns 404 and does not insert when the source is missing', async () => {
    const database = createDatabase();
    const response = await request(database, 'admin', '/missing-template/duplicate', { method: 'POST' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: notFoundError });
    expectNoWrite(database);
  });

  it('returns 403 when the guarded duplication affects no rows', async () => {
    const database = createDatabase({ changes: 0, records: { [templateId]: row(template()) } });
    const response = await request(database, 'admin', `/${templateId}/duplicate`, { method: 'POST' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: '管理者権限がありません。' });
    expectAdminGuard(getWrite(database));
    expect(database.statements.filter(statement => normalizeSql(statement.sql) === 'SELECT * FROM uniform_templates WHERE id = ?')).toHaveLength(1);
  });
});
