import { z } from 'zod';

export const userMissionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  mission_date: z.string(),
  title: z.string(),
  description: z.string(),
  target_type: z.enum(['exercise', 'meal']),
  target_count: z.number().int().nonnegative(),
  current_count: z.number().int().nonnegative(),
  is_completed: z.number().int().min(0).max(1),
  claimed: z.number().int().min(0).max(1),
});

export const claimMissionRewardRequestSchema = z.object({
  missionId: z.string(),
  territoryId: z.string(),
});

export type UserMission = z.infer<typeof userMissionSchema>;
export type ClaimMissionRewardRequest = z.infer<typeof claimMissionRewardRequestSchema>;
