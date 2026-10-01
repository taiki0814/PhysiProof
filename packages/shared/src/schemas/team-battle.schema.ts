import { z } from 'zod';

export const MAX_TEAM_BATTLE_OPPONENTS = 50;

export const createTeamBattleSchema = z.object({
  opponent_team_ids: z.array(z.string().uuid())
    .min(1, '対戦相手を1チーム以上選択してください。')
    .max(MAX_TEAM_BATTLE_OPPONENTS, `対戦相手は${MAX_TEAM_BATTLE_OPPONENTS}チームまで選択できます。`),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
}).superRefine((battle, context) => {
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
  'pending', 'accepted', 'scheduled', 'active', 'completed', 'rejected', 'expired'
]);

export const teamBattleInvitationStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export const teamBattleParticipantRoleSchema = z.enum(['host', 'opponent']);

export const teamBattleParticipantSummarySchema = z.object({
  team_id: z.string().uuid(),
  team_name: z.string(),
  role: teamBattleParticipantRoleSchema,
  invitation_status: teamBattleInvitationStatusSchema,
  score: z.number().nonnegative(),
});

export type TeamBattleParticipantSummary = z.infer<typeof teamBattleParticipantSummarySchema>;

export const teamBattleSummarySchema = z.object({
  id: z.string().uuid(),
  participants: z.array(teamBattleParticipantSummarySchema).min(2),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  display_status: teamBattleStatusSchema,
});

export type TeamBattleSummary = z.infer<typeof teamBattleSummarySchema>;
