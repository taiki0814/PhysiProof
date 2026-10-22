import { z } from 'zod';

export const profileAgeSchema = z.number({ required_error: '年齢を入力してください', invalid_type_error: '年齢を整数で入力してください' })
  .int('年齢は整数で入力してください').min(1, '年齢は1〜120で入力してください').max(120, '年齢は1〜120で入力してください');
export const territoryMapVisibilitySchema = z.enum(['private', 'friends']);
export const AGE_BANDS = [
  { value: 'under10', label: '10歳未満' },
  ...[10,20,30,40,50,60,70,80,90].map(n => ({ value: String(n), label: `${n}代` })),
  { value: '100+', label: '100歳以上' }, { value: 'unknown', label: '未設定' },
] as const;
export function ageBand(age: unknown): string {
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 1 || age > 120) return 'unknown';
  return age < 10 ? 'under10' : age >= 100 ? '100+' : String(Math.floor(age / 10) * 10);
}
export const territoryMapQuerySchema = z.object({
  scope: z.enum(['all', 'mine', 'friends']).optional().default('all'),
  age_band: z.string().refine(v => AGE_BANDS.some(b => b.value === v)).optional(),
});
export const profileMapQuerySchema = z.object({
  mode: z.enum(['current', 'history']).optional().default('current'),
  before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});
export const profileMapResponseSchema = z.object({
  owner: z.object({ id: z.string(), name: z.string() }),
  mode: z.enum(['current', 'history']),
  territories: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    area_polygon: z.string(), geometry_json: z.string().nullable(), source: z.string(),
  })),
  next_before: z.number().nullable(),
});
export type ProfileMapResponse = z.infer<typeof profileMapResponseSchema>;
export type TerritoryMapVisibility = z.infer<typeof territoryMapVisibilitySchema>;
