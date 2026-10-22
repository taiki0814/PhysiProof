import { z } from 'zod';

export const RUNNING_TREND_MIN_PARTICIPANTS = 5;
export const runningTrendQuerySchema = z.object({
  scope: z.enum(['personal', 'community']).default('community'),
  weeks: z.enum(['4', '8']).default('4'),
}).strict();
export const runningTrendPreferenceSchema = z.object({ sharing: z.boolean() }).strict();
export const runningTrendCellSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  slot: z.number().int().min(0).max(11),
  level: z.enum(['none', 'low', 'medium', 'high', 'insufficient']),
  count: z.number().int().nonnegative().nullable(),
});
const trendBaseSchema = z.object({
  weeks: z.union([z.literal(4), z.literal(8)]),
  starts_at: z.string().datetime(), ends_at: z.string().datetime(),
  timezone: z.literal('Asia/Tokyo'), method: z.literal('run_starts'),
  sharing: z.boolean(),
  min_participants: z.literal(RUNNING_TREND_MIN_PARTICIPANTS),
});
export const runningTrendResponseSchema = z.discriminatedUnion('scope', [
  trendBaseSchema.extend({ scope: z.literal('personal'),
    cells: z.array(runningTrendCellSchema.extend({ count: z.number().int().nonnegative() })).length(84),
    summary: z.object({ runs: z.number().int().nonnegative(), distance_m: z.number().nonnegative() }),
  }),
  trendBaseSchema.extend({ scope: z.literal('community'),
    cells: z.array(runningTrendCellSchema.extend({ count: z.null(), level: z.enum(['low','medium','high','insufficient']) })).length(84),
    summary: z.null(),
  }),
]).refine(data => new Set(data.cells.map(cell => cell.weekday * 12 + cell.slot)).size === 84, '曜日・時間帯に重複があります。');
export type RunningTrendResponse = z.infer<typeof runningTrendResponseSchema>;
export type RunningTrendCell = z.infer<typeof runningTrendCellSchema>;
export type RunningTrendPreference = z.infer<typeof runningTrendPreferenceSchema>;

/** Whole Japan-time days, with today's records excluded in both scopes. */
export function runningTrendWindow(weeks: 4 | 8, now = Date.now()) {
  const day = 86400000, japanOffset = 9 * 3600000;
  const end = Math.floor((now + japanOffset) / day) * day - japanOffset;
  return { starts_at: new Date(end - weeks * 7 * day).toISOString(), ends_at: new Date(end).toISOString() };
}
