import { describe, expect, it, vi } from 'vitest';
import app from './index';

const createDatabase = (changes: number) => {
  const statement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes } }),
  };
  return {
    db: { prepare: vi.fn((_query: string) => statement) },
    statement,
  };
};

describe('team battle cancellation route', () => {
  it('cancels only the creator’s pending battle before its start time', async () => {
    const { db, statement } = createDatabase(1);

    const response = await app.request('/api/teams/battles/battle-123', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token:creator-user' },
    }, { DB: db } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const cancellationSql = db.prepare.mock.calls[0][0];
    expect(cancellationSql).toContain('created_by = ?');
    expect(cancellationSql).toContain("status = 'pending'");
    expect(cancellationSql).toContain('julianday(starts_at) >');
    expect(statement.bind).toHaveBeenCalledWith('battle-123', 'creator-user');
  });

  it('rejects cancellation when the battle is no longer cancellable', async () => {
    const { db } = createDatabase(0);

    const response = await app.request('/api/teams/battles/battle-123', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token:another-user' },
    }, { DB: db } as any);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: '承認待ちで開始前の対戦申請のみ、申込者本人が取り消せます。' });
  });
});
