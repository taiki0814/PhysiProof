import { describe, expect, it, vi } from 'vitest';
import app from './index';

describe('team battle history deletion route', () => {
  it('hides a visible battle only for the requesting user', async () => {
    const visibilityStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'battle-123' }),
    };
    const insertStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    };
    const db = {
      prepare: vi.fn((query: string) => query.includes('SELECT b.id') ? visibilityStatement : insertStatement),
    };

    const response = await app.request('/api/teams/battles/battle-123/history', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token:history-user' },
    }, { DB: db } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(visibilityStatement.bind).toHaveBeenCalledWith('battle-123', 'history-user', 'history-user');
    expect(insertStatement.bind).toHaveBeenCalledWith('battle-123', 'history-user');
    expect(insertStatement.run).toHaveBeenCalledOnce();
  });

  it('does not hide a battle the requesting user cannot see', async () => {
    const visibilityStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    };
    const db = { prepare: vi.fn(() => visibilityStatement) };

    const response = await app.request('/api/teams/battles/battle-123/history', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token:outsider' },
    }, { DB: db } as any);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: '対戦履歴が見つからないか、削除する権限がありません。' });
    expect(db.prepare).toHaveBeenCalledOnce();
  });
});
