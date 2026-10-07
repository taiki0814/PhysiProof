import { z } from 'zod';

export const runningTitleSchema = z.object({
  level: z.number().int().positive(),
  name: z.string().min(1),
  required_distance_m: z.number().finite().positive(),
});
export type RunningTitle = z.infer<typeof runningTitleSchema>;

export const runningTitleProgressSchema = z.object({
  total_distance_m: z.number().finite().nonnegative(),
  current_title: runningTitleSchema.nullable(),
  next_title: runningTitleSchema.nullable(),
  remaining_distance_m: z.number().finite().nonnegative(),
  progress_ratio: z.number().min(0).max(1),
});
export type RunningTitleProgress = z.infer<typeof runningTitleProgressSchema>;
