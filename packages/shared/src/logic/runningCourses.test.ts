import {describe,it,expect} from 'vitest';
import {advanceCourse,emptyCourseProgress,courseLength,equivalentCourses,prepareCourse,courseRewardUniform} from './runningCourses';
import {createTeamBattleSchema} from '../schemas/team-battle.schema';
import {uniformDesignSchema} from '../schemas/uniform.schema';
import type {CoursePoint} from '../schemas/running-course.schema';
const route:CoursePoint[]=Array.from({length:37},(_,i)=>[35.68+Math.sin(i/36*Math.PI*2)*.0018,139.75+Math.cos(i/36*Math.PI*2)*.0022]);route[36]=route[0];
const fix=(p:CoursePoint,t:number)=>({latitude:p[0],longitude:p[1],accuracy_m:10,captured_at_ms:t,mocked:false});
function walk(points:CoursePoint[]){let state=emptyCourseProgress();for(let i=0;i<points.length;i++)state=advanceCourse(route,state,fix(points[i],i*10000),true,i*10000,45);return state;}
describe('stable course matching with metre tolerance',()=>{
  it('counts repeated complete loops, not exact polygon equality',()=>{
    const points=[...route,...route.slice(1)];expect(walk(points).laps).toBe(2);
    expect(walk(points.map((p,i)=>[p[0]+Math.sin(i)*.00005,p[1]+Math.cos(i)*.00005])).laps).toBe(2);
  });
  it('supports reverse direction and starting at a different point of the same loop',()=>{
    expect(walk([...route].reverse()).laps).toBe(1);
    const rotated=[...route.slice(12,36),...route.slice(0,13)];expect(walk(rotated).laps).toBe(1);
  });
  it('does not count partial runs, backtracking, crossing or stationary jitter',()=>{
    expect(walk(route.slice(0,20)).laps).toBe(0);
    expect(walk([...route.slice(0,20),...route.slice(0,20).reverse()]).laps).toBe(0);
    expect(walk([route[0],route[18],route[0]]).laps).toBe(0);
    expect(walk(Array.from({length:100},(_,i)=>[route[0][0]+Math.sin(i)*.00004,route[0][1]+Math.cos(i)*.00004])).laps).toBe(0);
  });
  it('never imports progress across GPS loss or unverified movement, but keeps completed laps',()=>{
    const state=walk(route);expect(state.laps).toBe(1);
    expect(advanceCourse(route,state,null,false,500000,0)).toMatchObject({arc:null,travelled:0,laps:1});
    expect(advanceCourse(route,walk(route.slice(0,20)),fix(route[20],900000),true,900000,45).travelled).toBe(0);
    expect(advanceCourse(route,state,{...fix(route[0],500000),mocked:true},true,500000,45).arc).toBeNull();
  });
  it('detects ordinary GPS offsets/reversed/rotated duplicates without merging clearly different routes',()=>{
    expect(equivalentCourses(route,route.map(p=>[p[0]+.0001,p[1]]))).toBe(true);
    expect(equivalentCourses(route,[...route].reverse())).toBe(true);
    expect(equivalentCourses(route,route.map(p=>[p[0]+.001,p[1]]))).toBe(false);
    expect(courseLength(prepareCourse(route))).toBeGreaterThan(500);
    expect(()=>prepareCourse(route.slice(0,20))).toThrow();
  });
  it('keeps reward uniforms valid and purely cosmetic',()=>expect(uniformDesignSchema.safeParse(courseRewardUniform()).success).toBe(true));
  it('snapshots arbitrary numeric lifetime only for new isolated invitations',()=>{
    const base={opponent_team_ids:['11111111-1111-4111-8111-111111111111'],starts_at:'2026-10-24T00:00:00Z',ends_at:'2026-10-25T00:00:00Z',map_mode:'isolated'};
    for(const hours of [null,1/60,.5,5,37.25,8760])expect(createTeamBattleSchema.safeParse({...base,territory_lifetime_hours:hours}).success).toBe(true);
    for(const hours of [0,-5,Infinity,8761,'5'])expect(createTeamBattleSchema.safeParse({...base,territory_lifetime_hours:hours}).success).toBe(false);
    expect(createTeamBattleSchema.safeParse({...base,map_mode:'shared',territory_lifetime_hours:5}).success).toBe(false);
  });
});
