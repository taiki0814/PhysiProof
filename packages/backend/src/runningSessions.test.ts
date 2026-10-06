import { describe, expect, it, vi } from 'vitest';
import app from './index';

const auth = (uid: string) => ({ Authorization: `Bearer test-token:${uid}` });

describe('online running session routes', () => {
  it('snapshots personal mode with no team at session start', async () => {
    const statements: Array<{ sql: string; bind: ReturnType<typeof vi.fn> }> = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement: any = {
          sql,
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
          first: vi.fn().mockResolvedValue(null),
        };
        statements.push(statement);
        return statement;
      }),
    };

    const response = await app.request('/api/running/sessions', {
      method: 'POST',
      headers: { ...auth('runner-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_mode: 'personal' }),
    }, { DB: db } as any);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, activity_mode: 'personal', team_id: null });
    const insert = statements.find((statement) => statement.sql.includes('INSERT INTO running_sessions'));
    expect(insert?.bind).toHaveBeenCalledWith(expect.any(String), 'runner-1', 'personal', null);
  });

  it('rejects team activity when the user has no current team', async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
        first: vi.fn().mockResolvedValue(sql.includes('SELECT team_id FROM users') ? { team_id: null } : null),
      })),
    };

    const response = await app.request('/api/running/sessions', {
      method: 'POST',
      headers: { ...auth('runner-2'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_mode: 'team' }),
    }, { DB: db } as any);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('チームへの所属') });
  });

  it('records battle distance only for completed team-mode sessions in an accepted roster and window', async () => {
    const firstStatement: any = { first: vi.fn().mockResolvedValue({ activity_mode: 'team', team_id: 'team-1', status: 'active' }) };
    const batchStatements: any[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        sql,
        bind: vi.fn().mockReturnThis(),
      })),
      batch: vi.fn(async (statements: any[]) => {
        batchStatements.push(...statements);
        return [{ success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 1 } }];
      }),
    };
    (db.prepare as any).mockImplementation((sql: string) => {
      const statement = { sql, bind: vi.fn().mockReturnThis(), first: vi.fn() };
      if (sql.includes('SELECT activity_mode, team_id, status')) statement.first = firstStatement.first;
      return statement;
    });

    const response = await app.request('/api/running/sessions/session-1/complete', {
      method: 'POST',
      headers: { ...auth('runner-3'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ distance_m: 2500, duration_sec: 900 }),
    }, { DB: db } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, activity_mode: 'team', team_id: 'team-1' });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(batchStatements[1].sql).toContain("s.activity_mode = 'team'");
    expect(batchStatements[1].sql).toContain('team_battle_members roster');
    expect(batchStatements[1].sql).toContain('s.started_at');
    expect(batchStatements[1].sql).not.toContain('team_battle_contributions');
  });

  it('rejects legacy offline territory payloads without a session ID', async () => {
    const response = await app.request('/api/territories', {
      method: 'POST',
      headers: { ...auth('runner-4'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'runner-4', latitude: 35, longitude: 139, area_sqm: 50,
        time_period: 'morning', area_polygon: '[]', distance_m: 200,
      }),
    }, { DB: {} } as any);

    expect(response.status).toBe(400);
  });
});
