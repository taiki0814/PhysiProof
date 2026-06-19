import { z } from 'zod';

export const predictionSchema = z.object({
  daysToTarget: z.number().int().nonnegative('目標達成までの日数は0以上である必要があります'),
  advice: z.string().min(1, 'アドバイスは必須です'),
  dailyCalorieDeficit: z.number(), // 1日あたりの推定カロリー不足量
  confidenceScore: z.number().min(0).max(1).optional(),
  source: z.enum(['ai', 'fallback']).default('ai'), // 予測ソース
  debugPrompt: z.string().optional(), // デバッグ用プロンプト (開発者メニュー用)
});

export type Prediction = z.infer<typeof predictionSchema>;

export const predictionRequestSchema = z.object({
  totalCaloriesBurned: z.number().nonnegative(),
  mealCaloriesConsumed: z.number().nonnegative(),
  currentWeight: z.number().positive(),
  targetWeight: z.number().positive(),
});

export type PredictionRequest = z.infer<typeof predictionRequestSchema>;

export const weightPredictionRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  current_weight: z.number().positive(),
  target_weight: z.number().positive(),
  total_calories_burned: z.number().nonnegative(),
  meal_calories_consumed: z.number().nonnegative(),
  days_to_target: z.number().int().nonnegative(),
  advice: z.string(),
  daily_calorie_deficit: z.number(),
  created_at: z.string().optional(),
});

export type WeightPredictionRecord = z.infer<typeof weightPredictionRecordSchema>;

