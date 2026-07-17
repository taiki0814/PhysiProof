import { z } from 'zod';

export const teamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'チーム名は1文字以上である必要があります').max(50, 'チーム名は50文字以内である必要があります'),
  owner_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
});

export type Team = z.infer<typeof teamSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1, 'チーム名は1文字以上である必要があります').max(50, 'チーム名は50文字以内である必要があります'),
});

export type CreateTeam = z.infer<typeof createTeamSchema>;

export const joinTeamSchema = z.object({
  team_id: z.string().uuid(),
});

export type JoinTeam = z.infer<typeof joinTeamSchema>;
