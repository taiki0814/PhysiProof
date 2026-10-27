import {describe,it,expect} from 'vitest';
import {externalRunningSnapshotSchema,externalRunningDisplay,EXTERNAL_RUNNING_WINDOW_MS} from './external-running.schema';
const end=Date.UTC(2026,9,27),start=end-EXTERNAL_RUNNING_WINDOW_MS;
const run={record_id:'record',source_id:'watch.app',started_at_ms:end-3600000,ended_at_ms:end-1800000,distance_m:5000};
const snapshot={provider:'health_connect',revision:1,window_start_ms:start,window_end_ms:end,records:[run]};
describe('display-only external running contracts',()=>{
  it('accepts only a bounded 30-day reference snapshot with explicit source',()=>{
    expect(externalRunningSnapshotSchema.safeParse(snapshot).success).toBe(true);
    for(const extra of [{provider:'healthkit'},{user_id:'other'},{team_id:'team'},{eligible_steps:100},{records:[{...run,course_laps:1}]}])expect(externalRunningSnapshotSchema.safeParse({...snapshot,...extra}).success).toBe(false);
    expect(externalRunningSnapshotSchema.safeParse({...snapshot,records:[]}).success).toBe(true);
  });
  it('rejects oversized, non-finite, incomplete, unsafe and out-of-window records',()=>{
    for(const r of [{distance_m:-1},{distance_m:NaN},{distance_m:300001},{source_id:'<script>'},{started_at_ms:start-1},{ended_at_ms:end+1},{ended_at_ms:run.started_at_ms}])expect(externalRunningSnapshotSchema.safeParse({...snapshot,records:[{...run,...r}]}).success).toBe(false);
    expect(externalRunningSnapshotSchema.safeParse({...snapshot,records:Array(501).fill(run)}).success).toBe(false);
    expect(externalRunningSnapshotSchema.safeParse({...snapshot,window_start_ms:start+1}).success).toBe(false);
    expect(externalRunningSnapshotSchema.safeParse({...snapshot,records:[run,run]}).success).toBe(false);
  });
  it('does not add overlapping device copies but keeps distinct runs and immutable input',()=>{
    const runs=[run,{...run,record_id:'copy',source_id:'phone.app',distance_m:4900},{...run,record_id:'next',started_at_ms:run.ended_at_ms,ended_at_ms:end,distance_m:3000}];
    const before=JSON.stringify(runs),value=externalRunningDisplay(runs);
    expect(value.distance_m).toBe(8000);expect(value.omitted).toBe(1);expect(value.records.map(r=>r.record_id)).toEqual(['next','record']);expect(JSON.stringify(runs)).toBe(before);
    expect(externalRunningDisplay([])).toEqual({distance_m:0,omitted:0,records:[]});
  });
});
