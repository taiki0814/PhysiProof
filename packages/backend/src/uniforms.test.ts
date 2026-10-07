import { describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
  createDefaultUniform, memberUniformStateSchema, uniformStateSchema,
} from '@my-app/shared';
import { uniformRoutes } from './routes/uniforms';

const teamId = 'team-123';
const ownerId = 'owner-user';
const memberId = 'member-user';
const outsiderId = 'outsider-user';
const validationError = 'ユニフォームの設定が不正です。入力内容を確認してください。';
const conflictError = '別の画面で更新されています。最新の設定を読み込み直してから保存してください。';
const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

type UserRow = { id: string; name: string; team_id: string | null };
type DesignRow = { design_json: string; revision: number };
type LetteringRow = { personalization_json: string; revision: number };
type DatabaseOptions = {
  changes?: number;
  users?: UserRow[];
  owner_id?: string;
  personal?: Record<string, DesignRow>;
  common?: Record<string, DesignRow>;
  lettering?: Record<string, LetteringRow>;
};

// Each prepared statement retains its own SQL and bind calls. Reads resolve by
// bound identity; changes is controlled explicitly to exercise failed guarded writes.
const createDatabase = (options: DatabaseOptions = {}) => {
  const users = options.users ?? [
    { id: ownerId, name: 'OWNER', team_id: teamId },
    { id: memberId, name: 'MEMBER', team_id: teamId },
    { id: outsiderId, name: 'OUTSIDER', team_id: 'other-team' },
  ];
  const read = (query: string, params: unknown[]): unknown => {
    if (query === 'SELECT id, name, team_id FROM users WHERE id = ?') {
      return users.find(user => user.id === params[0]) ?? null;
    }
    if (query.startsWith('SELECT t.id, t.name, t.owner_id FROM teams t JOIN users u ON u.team_id = t.id')) {
      const user = users.find(user => user.id === params[0]);
      return user?.team_id === teamId && params[1] === teamId
        ? { id: teamId, name: 'TIDE CREW', owner_id: options.owner_id ?? ownerId }
        : null;
    }
    if (query === 'SELECT design_json, revision FROM user_uniforms WHERE user_id = ?') {
      return options.personal?.[String(params[0])] ?? null;
    }
    if (query === 'SELECT design_json, revision FROM team_uniforms WHERE team_id = ?') {
      return options.common?.[String(params[0])] ?? null;
    }
    if (query === 'SELECT personalization_json, revision FROM team_uniform_personalizations WHERE team_id = ? AND user_id = ?') {
      return options.lettering?.[`${params[0]}:${params[1]}`] ?? null;
    }
    throw new Error(`Unexpected uniform read: ${query}`);
  };
  const prepareStatement = (sql: string) => {
    const bind = vi.fn().mockReturnThis();
    return {
      sql,
      bind,
      first: vi.fn(async () => read(normalizeSql(sql), bind.mock.calls[0] ?? [])),
      run: vi.fn(async () => {
        if (!/^INSERT INTO (user_uniforms|team_uniforms|team_uniform_personalizations) /.test(normalizeSql(sql))) {
          throw new Error(`Unexpected uniform write: ${sql}`);
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
const request = (database: Database, path: string, options: {
  userId?: string | null; method?: string; body?: unknown;
} = {}) => {
  const userId = options.userId === undefined ? memberId : options.userId;
  return uniformRoutes.request(path, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'PUT'),
    headers: {
      ...(userId === null ? {} : { Authorization: `Bearer test-token:${userId}` }),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }, { DB: database.db as unknown as D1Database });
};

const readUniformResponse = async (response: Awaited<ReturnType<typeof request>>) => {
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('uniforms' in body)) {
    throw new Error('Expected a uniform state response');
  }
  return body;
};

const expectNoWrite = (database: Database) => {
  expect(database.statements.filter(statement => /^INSERT|^UPDATE|^DELETE/.test(normalizeSql(statement.sql)))).toHaveLength(0);
  for (const statement of database.statements) expect(statement.run).not.toHaveBeenCalled();
};

const getWrite = (database: Database, table: string) => {
  const writes = database.statements.filter(statement => statement.run.mock.calls.length > 0);
  expect(writes).toHaveLength(1);
  const statement = writes[0];
  expect(normalizeSql(statement.sql)).toContain(`INSERT INTO ${table} (`);
  expect(statement.run).toHaveBeenCalledOnce();
  return statement;
};

const expectRevisionGuard = (statement: Database['statements'][number], table: string, keys: string) => {
  const sql = normalizeSql(statement.sql);
  expect(sql).toContain(`ON CONFLICT(${keys}) DO UPDATE`);
  expect(sql).toContain(`revision = ${table}.revision + 1`);
  expect(sql).toContain(`WHERE ${table}.revision = ?`);
  expect(sql).toContain(`? = 0 OR EXISTS (SELECT 1 FROM ${table} WHERE`);
};

describe('uniform authentication and user lookup', () => {
  it.each([
    { path: '/me' },
    { path: '/personal', body: { design: createDefaultUniform(), revision: 0 } },
    { path: `/team/${teamId}`, body: { design: createDefaultUniform(true), revision: 0 } },
    { path: `/team/${teamId}/personalization`, body: { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: 0 } },
    { path: `/members/${ownerId}` },
  ])('requires authentication for $path before touching D1', async ({ path, ...options }) => {
    const database = createDatabase();
    const response = await request(database, path, { ...options, userId: null });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: '認証トークンが不足しています。' });
    expect(database.db.prepare).not.toHaveBeenCalled();
  });

  it.each([
    { path: '/me' },
    { path: '/personal', body: { design: createDefaultUniform(), revision: 0 } },
  ])('returns 404 for an authenticated but missing user at $path', async ({ path, ...options }) => {
    const database = createDatabase();
    const response = await request(database, path, { ...options, userId: 'missing-user' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'ユーザーが見つかりません。' });
    expect(database.statements[0].bind).toHaveBeenCalledWith('missing-user');
    expectNoWrite(database);
  });
});

describe('personal uniform saves', () => {
  it.each([0, 7])('saves for the authenticated identity and increments revision %s', async revision => {
    const database = createDatabase();
    const design = {
      ...createDefaultUniform(), jersey_name: '  RUNNER  ', number: '007',
      colors: { ...createDefaultUniform().colors, body: '#102030', text: '#FEDCBA' },
    };
    const response = await request(database, '/personal', { body: { design, revision } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revision: revision + 1 });
    expect(database.statements[0].bind).toHaveBeenCalledWith(memberId);
    const write = getWrite(database, 'user_uniforms');
    expect(write.bind).toHaveBeenCalledWith(
      memberId, JSON.stringify({ ...design, jersey_name: 'RUNNER' }), revision, memberId, revision,
    );
    expectRevisionGuard(write, 'user_uniforms', 'user_id');
    expect(normalizeSql(write.sql)).toContain('SELECT ?, ?, 1 WHERE');
  });

  it.each([
    { design: { ...createDefaultUniform(), colors: { ...createDefaultUniform().colors, body: 'url(javascript:alert(1))' } }, revision: 0 },
    { design: { ...createDefaultUniform(), emblem_id: 'https://example.com/logo.svg' }, revision: 0 },
    { design: { ...createDefaultUniform(), version: 2 }, revision: 0 },
    { design: { ...createDefaultUniform(), svg: '<svg onload="alert(1)"/>' }, revision: 0 },
    { design: { ...createDefaultUniform(), line_width: 13 }, revision: 0 },
    { design: { ...createDefaultUniform(), emblem_size: 0.6 }, revision: 0 },
    { design: { ...createDefaultUniform(), emblem_offset_x: 9 }, revision: 0 },
    { design: { ...createDefaultUniform(), number: '1000' }, revision: 0 },
    { design: { ...createDefaultUniform(), jersey_name: 'ABCDEFGHIJKLM' }, revision: 0 },
    { design: createDefaultUniform(), revision: -1 },
    { design: createDefaultUniform(), revision: 1.5 },
    { design: createDefaultUniform() },
    { design: createDefaultUniform(), revision: 0, user_id: ownerId },
  ])('rejects invalid designs, revisions, or spoofed identities without a write (%#)', async body => {
    const database = createDatabase();
    const response = await request(database, '/personal', { body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: validationError });
    expectNoWrite(database);
  });
});

describe('team common design authorization and writes', () => {
  it.each([memberId, outsiderId])('denies common design edits by %s without writing', async userId => {
    const database = createDatabase();
    const response = await request(database, `/team/${teamId}`, {
      userId, body: { design: createDefaultUniform(true), revision: 0 },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: '所属チームのリーダーのみ共通デザインを編集できます。' });
    expect(database.statements[0].bind).toHaveBeenCalledWith(userId, teamId);
    expectNoWrite(database);
  });

  it('denies an owner who is no longer a member of the requested team', async () => {
    const database = createDatabase({ users: [{ id: ownerId, name: 'OWNER', team_id: 'other-team' }] });
    const response = await request(database, `/team/${teamId}`, {
      userId: ownerId, body: { design: createDefaultUniform(true), revision: 0 },
    });
    expect(response.status).toBe(403);
    expectNoWrite(database);
  });

  it.each([0, 4])('allows the current owner to save common design at revision %s', async revision => {
    const database = createDatabase();
    const design = createDefaultUniform(true);
    const response = await request(database, `/team/${teamId}`, {
      userId: ownerId, body: { design, revision },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revision: revision + 1 });
    expect(database.statements[0].bind).toHaveBeenCalledWith(ownerId, teamId);
    const write = getWrite(database, 'team_uniforms');
    expect(write.bind).toHaveBeenCalledWith(teamId, JSON.stringify(design), teamId, ownerId, ownerId, revision, teamId, revision);
    expectRevisionGuard(write, 'team_uniforms', 'team_id');
    expect(normalizeSql(write.sql)).toContain(
      'SELECT ?, ?, 1 WHERE EXISTS ( SELECT 1 FROM teams t JOIN users u ON u.team_id = t.id WHERE t.id = ? AND t.owner_id = ? AND u.id = ? )',
    );
  });

  it('rejects an invalid common design even for the owner without writing', async () => {
    const database = createDatabase();
    const response = await request(database, `/team/${teamId}`, {
      userId: ownerId, body: { design: { ...createDefaultUniform(true), pattern_id: 'unknown' }, revision: 0 },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: validationError });
    expectNoWrite(database);
  });
});

describe('team lettering authorization and writes', () => {
  it.each([0, 3])('allows a non-owner member to save only their lettering at revision %s', async revision => {
    const database = createDatabase();
    const personalization = { jersey_name: '  RUNNER  ', number: '007' };
    const response = await request(database, `/team/${teamId}/personalization`, { body: { personalization, revision } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revision: revision + 1 });
    expect(database.statements[0].bind).toHaveBeenCalledWith(memberId, teamId);
    const write = getWrite(database, 'team_uniform_personalizations');
    expect(write.bind).toHaveBeenCalledWith(
      teamId, memberId, JSON.stringify({ jersey_name: 'RUNNER', number: '007' }), memberId, teamId, revision, teamId, memberId, revision,
    );
    expectRevisionGuard(write, 'team_uniform_personalizations', 'team_id, user_id');
    expect(normalizeSql(write.sql)).toContain(
      'SELECT ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND team_id = ?)',
    );
    expect(normalizeSql(write.sql)).toContain('WHERE team_id = ? AND user_id = ?');
  });

  it('denies an outsider a lettering save without writing', async () => {
    const database = createDatabase();
    const response = await request(database, `/team/${teamId}/personalization`, {
      userId: outsiderId, body: { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: 0 },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'このチームに所属していません。' });
    expect(database.statements[0].bind).toHaveBeenCalledWith(outsiderId, teamId);
    expectNoWrite(database);
  });

  it.each([
    { colors: { body: '#000000' } }, { base_id: 'tank' }, { pattern_id: 'grid' },
    { line_id: 'arc' }, { emblem_id: 'flame' }, { emblem_size: 1.5 },
    { font_id: 'mono' }, { svg: '<svg/>' }, { user_id: ownerId },
  ])('rejects arbitrary fields within lettering (%#)', async extra => {
    const database = createDatabase();
    const response = await request(database, `/team/${teamId}/personalization`, {
      body: { personalization: { jersey_name: 'RUNNER', number: '42', ...extra }, revision: 0 },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: validationError });
    expectNoWrite(database);
  });

  it.each([
    { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: 0, design: createDefaultUniform(true) },
    { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: 0, user_id: ownerId },
    { personalization: { jersey_name: 'ABCDEFGHIJKLM', number: '42' }, revision: 0 },
    { personalization: { jersey_name: 'RUNNER', number: '-1' }, revision: 0 },
    { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: -1 },
    { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: 0.5 },
    { personalization: { jersey_name: 'RUNNER', number: '42' } },
  ])('rejects invalid lettering save envelopes without writing (%#)', async body => {
    const database = createDatabase();
    const response = await request(database, `/team/${teamId}/personalization`, { body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: validationError });
    expectNoWrite(database);
  });
});

describe('uniform write conflicts', () => {
  it.each([
    { path: '/personal', userId: memberId, table: 'user_uniforms', body: { design: createDefaultUniform(), revision: 6 } },
    { path: `/team/${teamId}`, userId: ownerId, table: 'team_uniforms', body: { design: createDefaultUniform(true), revision: 6 } },
    { path: `/team/${teamId}/personalization`, userId: memberId, table: 'team_uniform_personalizations', body: { personalization: { jersey_name: 'RUNNER', number: '42' }, revision: 6 } },
  ])('returns 409 when the guarded $table write changes no rows', async ({ path, userId, table, body }) => {
    const database = createDatabase({ changes: 0 });
    const response = await request(database, path, { userId, body });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: conflictError });
    const write = getWrite(database, table);
    expect(write.bind.mock.calls[0].at(-1)).toBe(6);
    expect(normalizeSql(write.sql)).toContain(`WHERE ${table}.revision = ?`);
  });
});

describe('uniform state and member visibility', () => {
  it('returns schema-valid defaults and no team for a user without a membership', async () => {
    const database = createDatabase({ users: [{ id: memberId, name: 'ABCDEFGHIJKLMNO', team_id: null }] });
    const response = await request(database, '/me');
    expect(response.status).toBe(200);
    const body = await readUniformResponse(response);
    expect(body).toEqual({
      uniforms: { personal: { design: { ...createDefaultUniform(), jersey_name: 'ABCDEFGHIJKL' }, revision: 0 }, team: null },
    });
    expect(uniformStateSchema.safeParse(body.uniforms).success).toBe(true);
    expectNoWrite(database);
  });

  it.each([[memberId, false], [ownerId, true]] as const)('reports owner-only common edit permission for %s', async (userId, canEdit) => {
    const personal = { ...createDefaultUniform(), jersey_name: 'PERSONAL', number: '11' };
    const common = { ...createDefaultUniform(true), jersey_name: 'COMMON', number: '22' };
    const personalization = { jersey_name: 'RUNNER', number: '007' };
    const database = createDatabase({
      personal: { [userId]: { design_json: JSON.stringify(personal), revision: 2 } },
      common: { [teamId]: { design_json: JSON.stringify(common), revision: 5 } },
      lettering: { [`${teamId}:${userId}`]: { personalization_json: JSON.stringify(personalization), revision: 3 } },
    });
    const response = await request(database, '/me', { userId });
    expect(response.status).toBe(200);
    const body = await readUniformResponse(response);
    expect(body).toEqual({ uniforms: {
      personal: { design: personal, revision: 2 },
      team: { id: teamId, name: 'TIDE CREW', can_edit: canEdit, design: common, revision: 5, personalization, personalization_revision: 3 },
    } });
    expect(uniformStateSchema.safeParse(body.uniforms).success).toBe(true);
    expectNoWrite(database);
  });

  it.each([
    { viewerId: outsiderId, targetId: memberId },
    { viewerId: memberId, targetId: outsiderId },
    { viewerId: 'missing-user', targetId: memberId },
    { viewerId: memberId, targetId: 'missing-user' },
  ])('denies member view from $viewerId to $targetId before loading designs', async ({ viewerId, targetId }) => {
    const database = createDatabase();
    const response = await request(database, `/members/${targetId}`, { userId: viewerId });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: '同じチームのメンバーのみ参照できます。' });
    expect(database.statements).toHaveLength(2);
    expect(database.statements[0].bind).toHaveBeenCalledWith(viewerId);
    expect(database.statements[1].bind).toHaveBeenCalledWith(targetId);
    expectNoWrite(database);
  });

  it('denies visibility between two users who both have no team', async () => {
    const database = createDatabase({ users: [
      { id: memberId, name: 'MEMBER', team_id: null },
      { id: ownerId, name: 'OWNER', team_id: null },
    ] });
    const response = await request(database, `/members/${ownerId}`);
    expect(response.status).toBe(403);
    expectNoWrite(database);
  });

  it('shows a teammate’s personal design and common artwork with only that teammate’s lettering', async () => {
    const personal = { ...createDefaultUniform(), jersey_name: 'OWNER', number: '8' };
    const common = { ...createDefaultUniform(true), jersey_name: 'COMMON', number: '99' };
    const lettering = { jersey_name: 'TEAMMATE', number: '007' };
    const database = createDatabase({
      personal: { [ownerId]: { design_json: JSON.stringify(personal), revision: 2 } },
      common: { [teamId]: { design_json: JSON.stringify(common), revision: 4 } },
      lettering: {
        [`${teamId}:${ownerId}`]: { personalization_json: JSON.stringify(lettering), revision: 3 },
        [`${teamId}:${memberId}`]: { personalization_json: JSON.stringify({ jersey_name: 'VIEWER', number: '1' }), revision: 1 },
      },
    });
    const response = await request(database, `/members/${ownerId}`);
    expect(response.status).toBe(200);
    const body = await readUniformResponse(response);
    expect(body).toEqual({ uniforms: { personal, team: { ...common, ...lettering } } });
    expect(memberUniformStateSchema.safeParse(body.uniforms).success).toBe(true);
    const personalRead = database.statements.find(statement => normalizeSql(statement.sql).includes('FROM user_uniforms'));
    const letteringRead = database.statements.find(statement => normalizeSql(statement.sql).includes('FROM team_uniform_personalizations'));
    expect(personalRead?.bind).toHaveBeenCalledWith(ownerId);
    expect(letteringRead?.bind).toHaveBeenCalledWith(teamId, ownerId);
    expectNoWrite(database);
  });
});
