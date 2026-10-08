import { describe, expect, it } from 'vitest';
import {
  createTeamBattleSchema,
  teamBattleAreaEventSchema,
  teamBattleParticipantSummarySchema,
  teamBattleSummarySchema,
} from './team-battle.schema';

const battleWindow = {
  starts_at: '2026-10-10T09:00:00.000Z',
  ends_at: '2026-10-11T09:00:00.000Z',
};

const legacyParticipant = {
  team_id: '11111111-1111-4111-8111-111111111111',
  team_name: 'Host',
  role: 'host',
  invitation_status: 'accepted',
  distance_m: 1200,
  distance_points: 1.2,
  territory_delta_sqm: -500,
  territory_points: -0.5,
  score: 0.7,
};

const legacySummary = {
  id: '33333333-3333-4333-8333-333333333333',
  participants: [
    legacyParticipant,
    {
      ...legacyParticipant,
      team_id: '22222222-2222-4222-8222-222222222222',
      team_name: 'Opponent',
      role: 'opponent',
    },
  ],
  ...battleWindow,
  display_status: 'active',
  can_cancel: false,
  can_delete_history: true,
  distance_points_per_km: 1,
  territory_points_per_1000_sqm: 1,
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
          distance_m: 1200,
          distance_points: 1.2,
          territory_delta_sqm: 400,
          territory_points: 0.4,
          score: 1.6,
        },
        {
          team_id: '22222222-2222-4222-8222-222222222222',
          team_name: 'Opponent',
          role: 'opponent',
          invitation_status: 'accepted',
          distance_m: 800,
          distance_points: 0.8,
          territory_delta_sqm: 200,
          territory_points: 0.2,
          score: 1,
        },
      ],
      ...battleWindow,
      display_status: 'active',
      can_cancel: false,
      can_delete_history: true,
      distance_points_per_km: 1,
      territory_points_per_1000_sqm: 1,
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
          distance_m: 0,
          distance_points: 0,
          territory_delta_sqm: 0,
          territory_points: 0,
          score: 0,
        },
        {
          team_id: '22222222-2222-4222-8222-222222222222',
          team_name: 'Opponent',
          role: 'opponent',
          invitation_status: 'pending',
          distance_m: 0,
          distance_points: 0,
          territory_delta_sqm: 0,
          territory_points: 0,
          score: 0,
        },
      ],
      ...battleWindow,
      display_status: 'cancelled',
      can_cancel: false,
      can_delete_history: true,
      distance_points_per_km: 1,
      territory_points_per_1000_sqm: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe('teamBattleParticipantSummarySchema holding fields', () => {
  it('defaults legacy participants to zero holding values and preserves signed raw scores', () => {
    expect(teamBattleParticipantSummarySchema.parse(legacyParticipant)).toEqual({
      ...legacyParticipant,
      holding_area_sqm_seconds: 0,
      holding_points: 0,
      holding_bonus_points: 0, spot_capture_points: 0, captured_spots: 0,
    });
  });

  it('also applies defaults when holding fields are explicitly undefined', () => {
    expect(teamBattleParticipantSummarySchema.parse({
      ...legacyParticipant, holding_area_sqm_seconds: undefined, holding_points: undefined,
    })).toEqual({ ...legacyParticipant, holding_area_sqm_seconds: 0, holding_points: 0, holding_bonus_points: 0, spot_capture_points: 0, captured_spots: 0 });
  });

  it.each([0, 0.25, Number.MAX_VALUE])('preserves finite nonnegative holding values (%s)', (value) => {
    const result = teamBattleParticipantSummarySchema.parse({
      ...legacyParticipant, holding_area_sqm_seconds: value, holding_points: value,
    });
    expect(result.holding_area_sqm_seconds).toBe(value);
    expect(result.holding_points).toBe(value);
  });

  describe.each(['holding_area_sqm_seconds', 'holding_points'] as const)('%s', (field) => {
    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, '1'])(
      'rejects an invalid holding value (%s)', (value) => {
        expect(teamBattleParticipantSummarySchema.safeParse({
          ...legacyParticipant, [field]: value,
        }).success).toBe(false);
      },
    );
  });
});

describe('teamBattleSummarySchema holding scoring compatibility', () => {
  it('defaults legacy summaries to scoring version 1 and holding rate 1', () => {
    const result = teamBattleSummarySchema.parse(legacySummary);
    expect(result).toEqual({
      ...legacySummary,
      scoring_version: 1,
      holding_points_per_1000_sqm_full_period: 1,
      map_mode: 'shared', map_rules_version: 0, spots_enabled: false, spot_holding_multiplier: 1.2,
      spot_capture_points: 0, map_latitude: null, map_longitude: null, map_radius_m: 2000, spot_count: 0,
      participants: legacySummary.participants.map((participant) => ({
        ...participant, holding_area_sqm_seconds: 0, holding_points: 0, holding_bonus_points: 0, spot_capture_points: 0, captured_spots: 0,
      })),
    });
  });

  it('applies summary defaults to explicitly undefined fields', () => {
    const result = teamBattleSummarySchema.parse({
      ...legacySummary, scoring_version: undefined, holding_points_per_1000_sqm_full_period: undefined,
    });
    expect(result.scoring_version).toBe(1);
    expect(result.holding_points_per_1000_sqm_full_period).toBe(1);
  });

  it.each([1, 2])('preserves explicit scoring version %s and earned holding values', (version) => {
    const result = teamBattleSummarySchema.parse({
      ...legacySummary,
      scoring_version: version,
      holding_points_per_1000_sqm_full_period: 2.5,
      participants: legacySummary.participants.map((participant) => ({
        ...participant, holding_area_sqm_seconds: 60_000, holding_points: 0.75,
      })),
    });
    expect(result.scoring_version).toBe(version);
    expect(result.holding_points_per_1000_sqm_full_period).toBe(2.5);
    for (const participant of result.participants) {
      expect(participant).toMatchObject({
        territory_delta_sqm: -500, territory_points: -0.5, score: 0.7,
        holding_area_sqm_seconds: 60_000, holding_points: 0.75,
      });
    }
  });

  it.each([0, -1, 3, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, '2'])(
    'rejects an unsupported scoring version (%s)', (version) => {
      expect(teamBattleSummarySchema.safeParse({ ...legacySummary, scoring_version: version }).success).toBe(false);
    },
  );

  it.each([Number.MIN_VALUE, 0.25, 1, Number.MAX_VALUE])('preserves a positive finite holding rate (%s)', (rate) => {
    expect(teamBattleSummarySchema.parse({
      ...legacySummary, holding_points_per_1000_sqm_full_period: rate,
    }).holding_points_per_1000_sqm_full_period).toBe(rate);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, '1'])(
    'rejects an invalid holding rate (%s)', (rate) => {
      expect(teamBattleSummarySchema.safeParse({
        ...legacySummary, holding_points_per_1000_sqm_full_period: rate,
      }).success).toBe(false);
    },
  );

  it.each(['holding_area_sqm_seconds', 'holding_points'] as const)(
    'validates nested participant %s instead of silently defaulting invalid data', (field) => {
      expect(teamBattleSummarySchema.safeParse({
        ...legacySummary,
        participants: [legacyParticipant, { ...legacySummary.participants[1], [field]: Number.POSITIVE_INFINITY }],
      }).success).toBe(false);
    },
  );
});

describe('teamBattleAreaEventSchema', () => {
  it.each([-1000, 0, 0.25, 1000])('accepts a signed finite area delta (%s)', (delta) => {
    const event = { recorded_at: '2026-10-10 09:00:00', area_delta_sqm: delta };
    expect(teamBattleAreaEventSchema.parse(event)).toEqual(event);
  });

  it('accepts an ISO event timestamp as well as a SQL timestamp', () => {
    const event = { recorded_at: battleWindow.starts_at, area_delta_sqm: 1000 };
    expect(teamBattleAreaEventSchema.parse(event)).toEqual(event);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, '1000'])(
    'rejects an invalid area delta (%s)', (delta) => {
      expect(teamBattleAreaEventSchema.safeParse({
        recorded_at: battleWindow.starts_at, area_delta_sqm: delta,
      }).success).toBe(false);
    },
  );
});
