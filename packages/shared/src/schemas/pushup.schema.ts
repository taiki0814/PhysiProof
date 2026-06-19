import { z } from 'zod';

export const accelerationDataSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  t: z.number(), // ミリ秒単位のタイムスタンプなどを想定
  gx: z.number().optional(),
  gy: z.number().optional(),
  gz: z.number().optional(),
});

export const pushupMeasurementSchema = z.object({
  user_id: z.string().min(1, 'ユーザーIDは必須です'),
  exercise_type: z.string().min(1, '種目名は必須です'),
  count: z.number().int().nonnegative('回数は0以上である必要があります'),
  timestamp: z.string().datetime('正しい日時形式である必要があります'),
  nonce: z.string().min(1, 'セッションID(Nonce)は必須です'),
  steps: z.number().int().nonnegative().optional(),
  distance: z.number().nonnegative().optional(),
  integrity_token: z.string().optional(), // Play Integrity API トークン
  sensor_log: z.array(accelerationDataSchema),
});

export const bulkPushupMeasurementSchema = z.array(pushupMeasurementSchema);
