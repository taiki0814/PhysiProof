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
  level: z.number().int().positive().optional(),
  xp: z.number().int().nonnegative().optional(),
  status_points: z.number().int().nonnegative().optional(),
  stat_str: z.number().int().positive().optional(),
  stat_agi: z.number().int().positive().optional(),
  stat_def: z.number().int().positive().optional(),
  stat_vit: z.number().int().positive().optional(),
  team_id: z.string().uuid().optional().nullable(),
  team_name: z.string().optional().nullable(),
  created_at: z.string().datetime().optional(),
});

export type User = z.infer<typeof userSchema>;

export const territorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  owner_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional().nullable(),
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
  address: z.string().optional().nullable(),
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

export const systemSettingsSchema = z.object({
  max_territories: z.string().min(1, '上限数は必須です'),
  battle_distance_points_per_km: z.string().regex(/^\d+(\.\d+)?$/, '距離ポイント係数は正の数値で入力してください').refine((value) => Number(value) > 0),
  battle_territory_points_per_1000_sqm: z.string().regex(/^\d+(\.\d+)?$/, '領域ポイント係数は正の数値で入力してください').refine((value) => Number(value) > 0),
  show_home_menu: z.string().optional(),
  show_map_menu: z.string().optional(),
  show_exercise_menu: z.string().optional(),
  show_ai_predict_menu: z.string().optional(),
  show_meal_menu: z.string().optional(),
  show_friends_menu: z.string().optional(),
  show_team_menu: z.string().optional(),
  show_ranking_menu: z.string().optional(),
  show_chat_menu: z.string().optional(),
});

export type SystemSettings = z.infer<typeof systemSettingsSchema>;

export const allocateStatsSchema = z.object({
  str: z.number().int().nonnegative(),
  agi: z.number().int().nonnegative(),
  def: z.number().int().nonnegative(),
  vit: z.number().int().nonnegative(),
});

export type AllocateStats = z.infer<typeof allocateStatsSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string(),
  is_read: z.number().int().min(0).max(1),
  created_at: z.string().optional().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  role: z.enum(['admin', 'user']).optional(),
  current_weight: z.number().nullable().optional(),
  target_weight: z.number().nullable().optional(),
  target_calories_burned: z.number().nullable().optional(),
  target_calories_consumed: z.number().nullable().optional(),
  gender: z.string().nullable().optional(),
  age: z.number().int().positive().nullable().optional(),
  height: z.number().positive().nullable().optional(),
  level: z.number().int().positive().optional(),
  xp: z.number().int().nonnegative().optional(),
  status_points: z.number().int().nonnegative().optional(),
  stat_str: z.number().int().positive().optional(),
  stat_agi: z.number().int().positive().optional(),
  stat_def: z.number().int().positive().optional(),
  stat_vit: z.number().int().positive().optional(),
});

export type AdminUpdateUser = z.infer<typeof adminUpdateUserSchema>;

export const adminSendNotificationSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  type: z.enum(['level_up', 'territory_lost', 'system', 'admin_alert']),
});

export type AdminSendNotification = z.infer<typeof adminSendNotificationSchema>;

