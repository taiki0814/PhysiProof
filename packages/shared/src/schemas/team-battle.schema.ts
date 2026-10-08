import { z } from 'zod';

export const MAX_TEAM_BATTLE_OPPONENTS = 50;
export const battleMapModeSchema = z.enum(['isolated', 'shared']);
export const BATTLE_SPOT_SPACING_M = 800;
export const BATTLE_SPOT_MULTIPLIER = 1.2;
// A capture is worth 100m of distance, not a full kilometre or an entire held area.
export const BATTLE_SPOT_DISTANCE_EQUIVALENT_KM = 0.1;

export const createTeamBattleSchema = z.object({
  opponent_team_ids: z.array(z.string().uuid())
    .min(1, '対戦相手を1チーム以上選択してください。')
    .max(MAX_TEAM_BATTLE_OPPONENTS, `対戦相手は${MAX_TEAM_BATTLE_OPPONENTS}チームまで選択できます。`),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  // Missing mode preserves compatibility with invitations from older clients.
  map_mode: battleMapModeSchema.optional(),
  spots_enabled: z.boolean().default(false),
  map_latitude: z.number().finite().min(-80).max(80).optional(),
  map_longitude: z.number().finite().min(-180).max(180).optional(),
  map_radius_m: z.number().int().min(1000).max(3000).default(2000),
}).superRefine((battle, context) => {
  if (battle.spots_enabled && (!battle.map_mode || battle.map_latitude === undefined || battle.map_longitude === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['map_latitude'], message: 'スポット配置の中心位置と対戦マップ形式を指定してください。' });
  }
  if (new Set(battle.opponent_team_ids).size !== battle.opponent_team_ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '同じチームを重複して選択できません。',
      path: ['opponent_team_ids'],
    });
  }
  if (Date.parse(battle.ends_at) <= Date.parse(battle.starts_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '終了日時は開始日時より後にしてください。',
      path: ['ends_at'],
    });
  }
});

export type CreateTeamBattle = z.infer<typeof createTeamBattleSchema>;

export const teamBattleStatusSchema = z.enum([
  'pending', 'accepted', 'scheduled', 'active', 'completed', 'rejected', 'expired', 'cancelled'
]);

export const teamBattleInvitationStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export const teamBattleParticipantRoleSchema = z.enum(['host', 'opponent']);

export const teamBattleParticipantSummarySchema = z.object({
  team_id: z.string().uuid(),
  team_name: z.string(),
  role: teamBattleParticipantRoleSchema,
  invitation_status: teamBattleInvitationStatusSchema,
  distance_m: z.number().nonnegative(),
  distance_points: z.number().nonnegative(),
  territory_delta_sqm: z.number(),
  territory_points: z.number(),
  holding_area_sqm_seconds: z.number().finite().nonnegative().default(0),
  holding_points: z.number().finite().nonnegative().default(0),
  holding_bonus_points: z.number().finite().nonnegative().default(0),
  spot_capture_points: z.number().finite().nonnegative().default(0),
  captured_spots: z.number().int().nonnegative().default(0),
  score: z.number(),
});

export type TeamBattleParticipantSummary = z.infer<typeof teamBattleParticipantSummarySchema>;

export const teamBattleSummarySchema = z.object({
  id: z.string().uuid(),
  participants: z.array(teamBattleParticipantSummarySchema).min(2),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  display_status: teamBattleStatusSchema,
  can_cancel: z.boolean(),
  can_delete_history: z.boolean(),
  distance_points_per_km: z.number().positive(),
  territory_points_per_1000_sqm: z.number().positive(),
  scoring_version: z.union([z.literal(1), z.literal(2)]).default(1),
  holding_points_per_1000_sqm_full_period: z.number().finite().positive().default(1),
  map_mode: battleMapModeSchema.default('shared'),
  map_rules_version: z.number().int().nonnegative().default(0),
  spots_enabled: z.boolean().default(false),
  spot_holding_multiplier: z.number().finite().min(1).default(1.2),
  spot_capture_points: z.number().finite().nonnegative().default(0),
  map_latitude: z.number().nullable().default(null),
  map_longitude: z.number().nullable().default(null),
  map_radius_m: z.number().default(2000),
  spot_count: z.number().int().nonnegative().default(0),
});

export type TeamBattleSummary = z.infer<typeof teamBattleSummarySchema>;

export const teamBattleAreaEventSchema = z.object({
  recorded_at: z.string(),
  area_delta_sqm: z.number().finite(),
});
export type TeamBattleAreaEvent = z.infer<typeof teamBattleAreaEventSchema>;

export const battleSpotSchema = z.object({
  id: z.string(), latitude: z.number(), longitude: z.number(),
  owner_team_id: z.string().nullable(),
  first_capture_team_ids: z.array(z.string()),
});
export type BattleSpot = z.infer<typeof battleSpotSchema>;

const geoPositionSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const geoRingSchema = z.array(geoPositionSchema).min(4).refine(ring => ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], '領域のリングは閉じている必要があります。');
export const territoryGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(geoRingSchema).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(geoRingSchema).min(1)).min(1) }),
]);

export const battleMapTerritorySchema = z.object({
  id: z.string(), team_id: z.string(), team_name: z.string(),
  geometry: territoryGeometrySchema,
  area_sqm: z.number().nonnegative(), buffed: z.boolean(),
});
export const battleMapResponseSchema = z.object({
  success: z.literal(true), battle: teamBattleSummarySchema,
  territories: z.array(battleMapTerritorySchema), spots: z.array(battleSpotSchema),
  can_run: z.boolean(),
});
export type BattleMapResponse = z.infer<typeof battleMapResponseSchema>;
