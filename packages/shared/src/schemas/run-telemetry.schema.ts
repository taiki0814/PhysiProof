import { z } from 'zod';

export const stepSourceSchema = z.enum(['android_step_counter', 'unavailable']);
export const runFixSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy_m: z.number().finite().min(0).max(10000),
  captured_at_ms: z.number().int().positive(),
  mocked: z.boolean(),
}).strict();
export const runTelemetrySchema = z.object({
  sequence: z.number().int().min(0).max(1000000),
  recorded_at_ms: z.number().int().positive(),
  source: stepSourceSchema,
  steps: z.number().int().min(0).max(10000000).nullable(),
  fix: runFixSchema.nullable(),
}).strict().refine(p => p.source === 'unavailable' ? p.steps === null : p.steps !== null, '実測値と取得方法が一致しません。');
export const motionStateSchema = z.enum(['baseline','moving','stationary','gps_unavailable','gps_inaccurate','gap','implausible','mocked','counter_reset']);
export const runStepSummarySchema = z.object({
  measured_steps: z.number().int().nonnegative(), eligible_steps: z.number().int().nonnegative(),
  source: stepSourceSchema, state: motionStateSchema,
  course_laps: z.number().int().nonnegative().optional(),
}).strict();
export const ownStepsSchema = z.object({
  today_measured_steps: z.number().int().nonnegative(), today_eligible_steps: z.number().int().nonnegative(),
  total_measured_steps: z.number().int().nonnegative(), total_eligible_steps: z.number().int().nonnegative(),
  measured_runs: z.number().int().nonnegative(),
});
export const nativeRunStateSchema = z.object({
  available: z.boolean(), active: z.boolean(), session_id: z.string().nullable(),
  summary: runStepSummarySchema.nullable(), error: z.string().nullable(),
  route:z.array(z.tuple([z.number().min(-90).max(90),z.number().min(-180).max(180)])).max(20000),
  distance_m:z.number().finite().nonnegative(),
});
export type RunFix = z.infer<typeof runFixSchema>;
export type RunTelemetry = z.infer<typeof runTelemetrySchema>;
export type RunStepSummary = z.infer<typeof runStepSummarySchema>;
export type OwnSteps = z.infer<typeof ownStepsSchema>;
export type NativeRunState = z.infer<typeof nativeRunStateSchema>;

export const MOTION_STATE_LABELS: Record<RunStepSummary['state'],string> = {
  baseline:'移動確認を準備中', moving:'移動を確認', stationary:'移動が確認できない区間',
  gps_unavailable:'GPS待ち', gps_inaccurate:'GPS精度が不足', gap:'計測間隔が空いた区間',
  implausible:'速度・歩数が不自然な区間', mocked:'模擬位置を検出', counter_reset:'歩数計のリセットを検出',
};
