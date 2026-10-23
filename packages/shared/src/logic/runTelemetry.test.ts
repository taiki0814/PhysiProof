import {describe,it,expect} from 'vitest';
import {evaluateRunTelemetry,type PreviousRunMotion} from './runTelemetry';
import {runTelemetrySchema,type RunTelemetry} from '../schemas/run-telemetry.schema';
import {placesAtFix,publicRunningPlaceSchema} from '../schemas/running-place.schema';
const now=1800000000000;
const previous:PreviousRunMotion={sequence:1,recorded_at_ms:now-20000,received_at_ms:now-20000,steps:100,source:'android_step_counter',measured_steps:100,eligible_steps:80,
  fix:{latitude:35.68,longitude:139.75,accuracy_m:5,captured_at_ms:now-20000,mocked:false}};
const packet:RunTelemetry={sequence:2,recorded_at_ms:now,source:'android_step_counter',steps:130,
  fix:{latitude:35.6803,longitude:139.75,accuracy_m:5,captured_at_ms:now,mocked:false}};
describe('measured steps plausibility (not hardware attestation)',()=>{
  it('accepts plausible walking and keeps source readings separate from GPS-confirmed readings',()=>{
    expect(evaluateRunTelemetry(previous,packet,now)).toMatchObject({measured_steps:130,eligible_steps:110,state:'moving'});
    expect(evaluateRunTelemetry(previous,{...packet,fix:null},now)).toMatchObject({measured_steps:130,eligible_steps:80,state:'gps_unavailable'});
  });
  it('never counts a pre-session total as new steps',()=>expect(evaluateRunTelemetry(null,{...packet,steps:100000},now)).toMatchObject({measured_steps:0,eligible_steps:0,state:'baseline'}));
  it('does not turn stationary shaking into game steps',()=>expect(evaluateRunTelemetry(previous,{...packet,fix:{...packet.fix!,latitude:35.68}},now)).toMatchObject({measured_steps:130,eligible_steps:80,state:'stationary'}));
  it.each([
    [{...packet,fix:{...packet.fix!,accuracy_m:100}},'gps_inaccurate'],
    [{...packet,fix:{...packet.fix!,mocked:true}},'mocked'],
    [{...packet,steps:99},'counter_reset'],
    [{...packet,steps:50000},'implausible'],
    [{...packet,fix:{...packet.fix!,latitude:36}},'implausible'],
    [{...packet,fix:{...packet.fix!,captured_at_ms:now-60000}},'gps_unavailable'],
    [{...packet,recorded_at_ms:now-60000},'gap'],
  ] as const)('suppresses invalid segment: %s',(input,state)=>{
    const result=evaluateRunTelemetry(previous,input,now);expect(result.state).toBe(state);expect(result.eligible_steps).toBe(80);
  });
  it('does not back-credit a gap, future clock, changed source or an implausible stride',()=>{
    expect(evaluateRunTelemetry({...previous,received_at_ms:now-90000},packet,now).state).toBe('gap');
    expect(evaluateRunTelemetry(previous,{...packet,recorded_at_ms:now+10000},now).state).toBe('gap');
    expect(evaluateRunTelemetry(previous,{...packet,source:'unavailable',steps:null},now).state).toBe('implausible');
    expect(evaluateRunTelemetry(previous,{...packet,steps:101},now).eligible_steps).toBe(80);
  });
  it('supports place passage without inventing steps in browsers',()=>{
    expect(evaluateRunTelemetry({...previous,source:'unavailable',steps:null,measured_steps:0,eligible_steps:0},{...packet,source:'unavailable',steps:null},now))
      .toMatchObject({state:'moving',measured_steps:0,eligible_steps:0});
  });
  it('rejects distance-derived/mismatched/oversized/unknown telemetry inputs',()=>{
    expect(runTelemetrySchema.safeParse(packet).success).toBe(true);
    for(const p of [{...packet,source:'estimated'},{...packet,steps:-1},{...packet,source:'unavailable'},{...packet,user_id:'someone'},{...packet,sequence:1.5}])expect(runTelemetrySchema.safeParse(p).success).toBe(false);
  });
  it('bounds administrator areas and handles exact boundary fixes without location queries',()=>{
    const p={name:'Public park',description:'coarse',south:35.67,north:35.69,west:139.74,east:139.76,active:true,public_area_confirmed:true as const};
    expect(publicRunningPlaceSchema.safeParse(p).success).toBe(true);
    expect(publicRunningPlaceSchema.safeParse({...p,north:36}).success).toBe(false);
    expect(publicRunningPlaceSchema.safeParse({...p,public_area_confirmed:false}).success).toBe(false);
    expect(placesAtFix([{...p,id:'park'}],35.67,139.74)).toHaveLength(1);
    expect(placesAtFix([{...p,id:'park',active:false}],35.68,139.75)).toHaveLength(0);
  });
});
