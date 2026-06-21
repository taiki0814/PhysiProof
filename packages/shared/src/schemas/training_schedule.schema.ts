import { z } from 'zod';

export const trainingScheduleSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string().min(1, '予定内容を入力してください'),
  scheduled_at: z.string().min(1, '予定日時を入力してください'),
  completed: z.number().int().min(0).max(1).default(0),
  created_at: z.string().optional(),
});

export const createTrainingScheduleSchema = trainingScheduleSchema.omit({
  id: true,
  user_id: true,
  completed: true,
  created_at: true,
});

export type TrainingSchedule = z.infer<typeof trainingScheduleSchema>;
export type CreateTrainingSchedule = z.infer<typeof createTrainingScheduleSchema>;
