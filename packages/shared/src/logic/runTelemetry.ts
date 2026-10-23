import type { RunTelemetry, RunFix, RunStepSummary } from '../schemas/run-telemetry.schema';

export type PreviousRunMotion = {
  sequence:number; recorded_at_ms:number; received_at_ms:number; steps:number|null;
  fix:RunFix|null; source:RunTelemetry['source']; measured_steps:number; eligible_steps:number;
};
export function telemetryDistance(a:RunFix,b:RunFix):number{
  const rad=Math.PI/180, dLat=(b.latitude-a.latitude)*rad, dLng=(b.longitude-a.longitude)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}

/** Plausibility, not hardware attestation. Decisions use server receipt time too. */
export function evaluateRunTelemetry(previous:PreviousRunMotion|null,p:RunTelemetry,now:number):RunStepSummary {
  const result:RunStepSummary={source:p.source,measured_steps:previous?.measured_steps??0,eligible_steps:previous?.eligible_steps??0,state:'baseline'};
  const age=now-p.recorded_at_ms;
  if(age>15000||age< -5000){result.state='gap';return result;}
  const seconds=previous?(p.recorded_at_ms-previous.recorded_at_ms)/1000:0;
  const receiptSeconds=previous?(now-previous.received_at_ms)/1000:0;
  let delta=0;
  if(previous&&previous.source!==p.source){result.state='implausible';return result;}
  if(previous&&p.steps!==null&&previous.steps!==null){
    delta=p.steps-previous.steps;
    if(delta<0){result.state='counter_reset';return result;}
    if(seconds<=0||seconds>45||receiptSeconds>45||seconds>receiptSeconds+5){result.state='gap';return result;}
    if(delta>Math.min(seconds,receiptSeconds+3)*4.5+8){result.state='implausible';return result;}
    result.measured_steps+=delta;
  }
  if(!p.fix){result.state='gps_unavailable';return result;}
  if(p.fix.mocked){result.state='mocked';return result;}
  if(now-p.fix.captured_at_ms>15000||p.fix.captured_at_ms>now+5000){result.state='gps_unavailable';return result;}
  if(p.fix.accuracy_m>30||p.fix.accuracy_m<=0){result.state='gps_inaccurate';return result;}
  if(!previous?.fix)return result;
  if(seconds<=0||seconds>45||receiptSeconds>45||seconds>receiptSeconds+5){result.state='gap';return result;}
  if(previous.fix.accuracy_m>30||previous.fix.accuracy_m<=0||previous.fix.mocked
    ||previous.recorded_at_ms-previous.fix.captured_at_ms>15000||previous.fix.captured_at_ms>previous.recorded_at_ms+5000
    ||p.fix.captured_at_ms<=previous.fix.captured_at_ms){result.state='gps_inaccurate';return result;}
  const distance=telemetryDistance(previous.fix,p.fix), speed=distance/seconds;
  if(speed>7){result.state='implausible';return result;}
  // Accuracy-dependent deadband: standing still must not turn sensor shake into points.
  if(distance<Math.max(8,(previous.fix.accuracy_m+p.fix.accuracy_m)/2)){result.state='stationary';return result;}
  if(p.source==='android_step_counter'){
    if(!delta||distance/delta<0.25||distance/delta>2.5){result.state='implausible';return result;}
    result.eligible_steps+=Math.min(delta,Math.floor(distance/0.35));
  }
  result.state='moving';return result;
}
