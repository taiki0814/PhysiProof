import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  current_weight: z.number().positive().optional(),
  target_weight: z.number().positive().optional(),
  target_calories_burned: z.number().nonnegative().optional(),
  target_calories_consumed: z.number().nonnegative().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  age: z.number().int().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  avatar_id: z.string().optional(),
  created_at: z.string().datetime().optional(),
});

export type User = z.infer<typeof userSchema>;

export const territorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  owner_id: z.string().uuid().optional(),
  captured_at: z.string().datetime().optional(),
});

export type Territory = z.infer<typeof territorySchema>;

export const exerciseLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.enum(['pushup', 'running', 'walking']),
  count: z.number().int().nonnegative(),
  heart_rate: z.number().positive().optional(), // ウェアラブル向け心拍数
  timestamp: z.string().datetime(),
});

export type ExerciseLog = z.infer<typeof exerciseLogSchema>;

export const mealSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  calories: z.number().positive(),
  description: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type Meal = z.infer<typeof mealSchema>;

export const createTerritorySchema = z.object({
  user_id: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
  area_sqm: z.number().nonnegative(),
  time_period: z.enum(['morning', 'afternoon', 'night']),
  area_polygon: z.string(), // "[[lat, lng], ...]" の文字列表現
  distance_m: z.number().nonnegative().optional(),
  duration_sec: z.number().nonnegative().optional(),
  avg_speed_kmh: z.number().nonnegative().optional(),
});

export type CreateTerritory = z.infer<typeof createTerritorySchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(50),
  avatar_id: z.string().min(1),
  avatar_image: z.string().optional().nullable(),
  login_id: z.string().min(3, 'ログインIDは3文字以上である必要があります').optional(),
  password: z.string().min(6, 'パスワードは6文字以上である必要があります').optional().or(z.literal('')),
  current_weight: z.number().optional().nullable(),
  target_weight: z.number().optional().nullable(),
  target_calories_burned: z.number().optional().nullable(),
  target_calories_consumed: z.number().optional().nullable(),
  gender: z.string().optional().nullable(),
  age: z.number().int().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
