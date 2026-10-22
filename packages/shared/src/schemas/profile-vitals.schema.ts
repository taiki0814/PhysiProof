import { z } from 'zod';

// Optional self-entered values, not medical targets or public profile fields.
const optionalNumber = (min: number, max: number) => z.preprocess(
  value => value === '' || value === undefined || value === null ? null : typeof value === 'string' ? Number(value) : value,
  z.number().finite().min(min, `${min}以上で入力してください`).max(max, `${max}以下で入力してください`).nullable(),
);
export const profileVitalsSchema = z.object({
  current_weight: optionalNumber(1, 500),
  target_weight: optionalNumber(1, 500),
  height: optionalNumber(30, 300),
  gender: z.enum(['male', 'female', 'other', '']).nullable().transform(v => v || null),
}).strict();
export type ProfileVitals = z.infer<typeof profileVitalsSchema>;
export type ProfileVitalsInput = z.input<typeof profileVitalsSchema>;
