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
    const preparedStatements: any[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        sql,
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      })),
      batch: vi.fn(async (statements: any[]) => {
        batchStatements.push(...statements);
        return [{ success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 1 } }];
      }),
    };
    (db.prepare as any).mockImplementation((sql: string) => {
      const statement = {
        sql,
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      preparedStatements.push(statement);
      if (sql.includes('SELECT activity_mode, team_id, status')) statement.first = firstStatement.first;
      if (sql.includes('SELECT id, target_count, current_count FROM user_missions')) {
        statement.first = vi.fn().mockResolvedValue({ id: 'mission-1', target_count: 1, current_count: 0 });
      }
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
    const missionUpdate = preparedStatements.find((statement) => statement.sql.includes('UPDATE user_missions SET current_count'));
    expect(missionUpdate?.bind).toHaveBeenCalledWith(1, 1, 'mission-1');
  });

  it('creates a running-only daily mission from completed online runs', async () => {
    const preparedStatements: any[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement = {
          sql,
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        };
        preparedStatements.push(statement);
        if (sql.includes('SELECT id, user_id, mission_date')) statement.first = vi.fn().mockResolvedValue(null);
        if (sql.includes("FROM running_sessions WHERE user_id = ? AND status = 'completed'")) {
          statement.first = vi.fn().mockResolvedValue({ cnt: 0 });
        }
        return statement;
      }),
    };

    const response = await app.request('/api/missions/today', {
      headers: auth('runner-mission'),
    }, { DB: db } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mission: { target_type: 'running', target_count: 1, current_count: 0 } });
    const runCountQuery = preparedStatements.find((statement) => statement.sql.includes('FROM running_sessions WHERE user_id = ?'));
    expect(runCountQuery?.sql).toContain("status = 'completed'");
    expect(runCountQuery?.sql).toContain('distance_m > 0');
  });

  it('rejects reward claims for legacy exercise and meal missions', async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        sql,
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: 'legacy-mission', user_id: 'runner-legacy', target_type: 'meal', is_completed: 1, claimed: 0,
        }),
        run: vi.fn(),
      })),
    };

    const response = await app.request('/api/missions/claim', {
      method: 'POST',
      headers: { ...auth('runner-legacy'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId: 'legacy-mission' }),
    }, { DB: db } as any);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('ランニングミッション以外') });
    expect(db.prepare).toHaveBeenCalledOnce();
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
