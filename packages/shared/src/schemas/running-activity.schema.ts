import { z } from 'zod';
import { createTerritorySchema } from './core';

export const activityModeSchema = z.enum(['personal', 'team']);
export type ActivityMode = z.infer<typeof activityModeSchema>;

export const startRunningSessionSchema = z.object({
  activity_mode: activityModeSchema,
  battle_id: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.battle_id && value.activity_mode !== 'team') context.addIssue({ code: z.ZodIssueCode.custom, path: ['battle_id'], message: '対戦マップはチーム活動で利用してください。' });
});
export type StartRunningSession = z.infer<typeof startRunningSessionSchema>;

export const completeRunningSessionSchema = z.object({
  distance_m: z.number().finite().nonnegative(),
  duration_sec: z.number().finite().nonnegative(),
}).superRefine(({ distance_m, duration_sec }, context) => {
  if (distance_m > 0 && duration_sec <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '距離がある場合、走行時間も必要です。', path: ['duration_sec'] });
  }
});
export type CompleteRunningSession = z.infer<typeof completeRunningSessionSchema>;

export const createRunningTerritorySchema = createTerritorySchema.extend({
  activity_session_id: z.string().uuid(),
});
export type CreateRunningTerritory = z.infer<typeof createRunningTerritorySchema>;

export const runningDistanceStatsSchema = z.object({
  personal_total_distance_m: z.number().nonnegative(),
  team_contribution_distance_m: z.number().nonnegative(),
  legacy_distance_is_estimated: z.boolean(),
});
export type RunningDistanceStats = z.infer<typeof runningDistanceStatsSchema>;

export const teamMemberRunningStatsSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  personal_total_distance_m: z.number().nonnegative(),
  team_contribution_distance_m: z.number().nonnegative(),
});
export type TeamMemberRunningStats = z.infer<typeof teamMemberRunningStatsSchema>;
