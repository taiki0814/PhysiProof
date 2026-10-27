import {z} from 'zod';

export const EXTERNAL_RUNNING_WINDOW_MS=30*24*60*60*1000;
export const externalRunningRecordSchema=z.object({
  record_id:z.string().min(1).max(128),
  source_id:z.string().regex(/^[A-Za-z0-9_.]+$/).min(1).max(255),
  started_at_ms:z.number().int().positive().safe(),
  ended_at_ms:z.number().int().positive().safe(),
  distance_m:z.number().finite().positive().max(300000),
}).strict().refine(r=>r.ended_at_ms>r.started_at_ms&&r.ended_at_ms-r.started_at_ms<=48*60*60*1000,'走行時間が不正です。');
export const externalRunningConsentSchema=z.object({enabled:z.boolean(),revision:z.number().int().nonnegative()}).strict();
export const externalRunningSnapshotSchema=z.object({
  provider:z.literal('health_connect'),revision:z.number().int().nonnegative(),
  window_start_ms:z.number().int().positive().safe(),window_end_ms:z.number().int().positive().safe(),
  records:z.array(externalRunningRecordSchema).max(500),
}).strict().superRefine((p,c)=>{
  if(p.window_end_ms-p.window_start_ms!==EXTERNAL_RUNNING_WINDOW_MS)c.addIssue({code:'custom',message:'取り込み期間は直近30日です。'});
  const ids=new Set<string>();
  for(const r of p.records){
    if(r.started_at_ms<p.window_start_ms||r.ended_at_ms>p.window_end_ms)c.addIssue({code:'custom',message:'取り込み期間外の走行です。'});
    const id=JSON.stringify([r.source_id,r.record_id]);
    if(ids.has(id))c.addIssue({code:'custom',message:'同じ外部記録が重複しています。'});ids.add(id);
  }
});
export const externalRunningViewSchema=z.object({
  enabled:z.boolean(),revision:z.number().int().nonnegative(),synced_at_ms:z.number().int().nullable(),
  window_start_ms:z.number().int().nullable(),window_end_ms:z.number().int().nullable(),
  records:z.array(externalRunningRecordSchema).max(500),
});
export const nativeHealthStateSchema=z.object({supported:z.boolean(),authorized:z.boolean()});
export const nativeHealthSnapshotSchema=externalRunningSnapshotSchema.innerType().omit({provider:true,revision:true});
export type ExternalRunningRecord=z.infer<typeof externalRunningRecordSchema>;
export type ExternalRunningView=z.infer<typeof externalRunningViewSchema>;

/** Display-only deduplication. No output is eligible for game scoring. */
export function externalRunningDisplay(records:ExternalRunningRecord[]){
  const accepted:ExternalRunningRecord[]=[];
  const sorted=[...records].sort((a,b)=>b.distance_m-a.distance_m||a.started_at_ms-b.started_at_ms||a.source_id.localeCompare(b.source_id)||a.record_id.localeCompare(b.record_id));
  for(const r of sorted){
    // Conservative: overlapping imported workouts are one activity, never an inflated sum.
    if(!accepted.some(a=>r.started_at_ms<a.ended_at_ms&&r.ended_at_ms>a.started_at_ms))accepted.push(r);
  }
  return {records:accepted.sort((a,b)=>b.started_at_ms-a.started_at_ms),distance_m:accepted.reduce((n,r)=>n+r.distance_m,0),omitted:records.length-accepted.length};
}
