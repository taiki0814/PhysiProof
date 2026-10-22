import { describe, expect, it } from 'vitest';
import { runningTrendWindow, runningTrendQuerySchema, runningTrendPreferenceSchema, runningTrendResponseSchema } from './running-trends.schema';
import { profileVitalsSchema } from './profile-vitals.schema';

describe('running trend contracts', () => {
  it('cuts off at Japan midnight, not UTC midnight, for 28 or 56 complete days', () => {
    const before = runningTrendWindow(4, Date.parse('2026-10-21T14:59:59Z'));
    const after = runningTrendWindow(4, Date.parse('2026-10-21T15:00:00Z'));
    expect(before.ends_at).toBe('2026-10-20T15:00:00.000Z');
    expect(after.ends_at).toBe('2026-10-21T15:00:00.000Z');
    for (const weeks of [4,8] as const) {
      const period=runningTrendWindow(weeks);
      expect(Date.parse(period.ends_at)-Date.parse(period.starts_at)).toBe(weeks*7*86400000);
    }
  });
  it('bounds queries and requires an explicit boolean for consent', () => {
    expect(runningTrendQuerySchema.parse({})).toEqual({scope:'community',weeks:'4'});
    for (const input of [{scope:'friends'},{weeks:'1'},{weeks:8},{scope:'community',age_band:'20'}]) expect(runningTrendQuerySchema.safeParse(input).success).toBe(false);
    for (const input of [{},{sharing:'true'},{sharing:1},{sharing:true,user_id:'other'}]) expect(runningTrendPreferenceSchema.safeParse(input).success).toBe(false);
  });
  it('prevents exact community counts, summaries or duplicate grid coordinates', () => {
    const response:any={...runningTrendWindow(4),weeks:4,scope:'community',timezone:'Asia/Tokyo',method:'run_starts',sharing:false,min_participants:5,
      cells:Array.from({length:84},(_,i)=>({weekday:Math.floor(i/12),slot:i%12,count:null,level:'insufficient'})),summary:null};
    expect(runningTrendResponseSchema.safeParse(response).success).toBe(true);
    expect(runningTrendResponseSchema.safeParse({...response,summary:{runs:5,distance_m:2000}}).success).toBe(false);
    expect(runningTrendResponseSchema.safeParse({...response,cells:response.cells.map((c:any)=>({...c,count:5}))}).success).toBe(false);
    response.cells[1]=response.cells[0];
    expect(runningTrendResponseSchema.safeParse(response).success).toBe(false);
  });
});
describe('optional private body profile', () => {
  it('accepts decimal form input and explicit clearing', () => {
    expect(profileVitalsSchema.parse({current_weight:'65.5',target_weight:'60',height:'172.5',gender:'male'}))
      .toEqual({current_weight:65.5,target_weight:60,height:172.5,gender:'male'});
    expect(profileVitalsSchema.parse({current_weight:'',target_weight:null,height:'',gender:''}))
      .toEqual({current_weight:null,target_weight:null,height:null,gender:null});
  });
  it.each([0,-1,501,Infinity,NaN,true,'abc'])('rejects invalid weights: %s', value => {
    expect(profileVitalsSchema.safeParse({current_weight:value,target_weight:null,height:null,gender:null}).success).toBe(false);
  });
  it.each([0,29,301,Infinity])('rejects invalid heights: %s', height => {
    expect(profileVitalsSchema.safeParse({height,gender:null}).success).toBe(false);
  });
});
