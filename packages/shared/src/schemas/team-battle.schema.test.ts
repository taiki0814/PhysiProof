import { describe, expect, it } from 'vitest';
import { createTeamBattleSchema, teamBattleSummarySchema } from './team-battle.schema';

const battleWindow = {
  starts_at: '2026-10-10T09:00:00.000Z',
  ends_at: '2026-10-11T09:00:00.000Z',
};

describe('createTeamBattleSchema', () => {
  it('accepts more than one opposing team', () => {
    const result = createTeamBattleSchema.safeParse({
      ...battleWindow,
      opponent_team_ids: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty opponent list and duplicate team IDs', () => {
    expect(createTeamBattleSchema.safeParse({ ...battleWindow, opponent_team_ids: [] }).success).toBe(false);
    expect(createTeamBattleSchema.safeParse({
      ...battleWindow,
      opponent_team_ids: [
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      ],
    }).success).toBe(false);
  });

  it('limits a single battle to 50 opposing teams', () => {
    const opponentTeamIds = Array.from({ length: 51 }, (_, index) => (
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    ));

    expect(createTeamBattleSchema.safeParse({ ...battleWindow, opponent_team_ids: opponentTeamIds }).success).toBe(false);
  });
});

describe('teamBattleSummarySchema', () => {
  it('represents a raw-score standings list for a multi-team battle', () => {
    const result = teamBattleSummarySchema.safeParse({
      id: '33333333-3333-4333-8333-333333333333',
      participants: [
        {
          team_id: '11111111-1111-4111-8111-111111111111',
          team_name: 'Host',
          role: 'host',
          invitation_status: 'accepted',
          score: 24,
        },
        {
          team_id: '22222222-2222-4222-8222-222222222222',
          team_name: 'Opponent',
          role: 'opponent',
          invitation_status: 'accepted',
          score: 20,
        },
      ],
      ...battleWindow,
      display_status: 'active',
      can_cancel: false,
      can_delete_history: true,
    });

    expect(result.success).toBe(true);
  });

  it('represents a cancelled pending request and whether the current user may cancel it', () => {
    const result = teamBattleSummarySchema.safeParse({
      id: '33333333-3333-4333-8333-333333333333',
      participants: [
        {
          team_id: '11111111-1111-4111-8111-111111111111',
          team_name: 'Host',
          role: 'host',
          invitation_status: 'accepted',
          score: 0,
        },
        {
          team_id: '22222222-2222-4222-8222-222222222222',
          team_name: 'Opponent',
          role: 'opponent',
          invitation_status: 'pending',
          score: 0,
        },
      ],
      ...battleWindow,
      display_status: 'cancelled',
      can_cancel: false,
      can_delete_history: true,
    });

    expect(result.success).toBe(true);
  });
});
