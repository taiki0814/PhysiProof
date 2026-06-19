import { z } from 'zod';

/**
 * AIによる食事解析リクエストのスキーマ
 */
export const mealAnalysisRequestSchema = z.object({
  image: z.string(), // Base64 encoded image data
});

/**
 * AIによる食事解析結果のスキーマ
 */
export const mealAnalysisResponseSchema = z.object({
  name: z.string(),
  calories: z.number(),
  pfc: z.object({
    protein: z.number(),
    fat: z.number(),
    carbs: z.number(),
  }),
  advice: z.string(),
});

export type MealAnalysisRequest = z.infer<typeof mealAnalysisRequestSchema>;
export type MealAnalysisResponse = z.infer<typeof mealAnalysisResponseSchema>;

/**
 * D1 データベース保存用の食事記録スキーマ
 */
export const mealRecordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  fat: z.number(),
  carbs: z.number(),
  advice: z.string(),
  created_at: z.string(),
});

export type MealRecord = z.infer<typeof mealRecordSchema>;

