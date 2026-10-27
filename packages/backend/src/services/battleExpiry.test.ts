import {describe,it,expect} from 'vitest';
import {polygon} from '@turf/helpers';
import {area} from '@turf/area';
import {replayBattleMap,type MapRules,type MapEvent} from './battleMapEngine';
const start=Date.parse('2026-10-23T00:00:00Z'),hour=3600000;
const rules:MapRules={starts_at:new Date(start).toISOString(),ends_at:new Date(start+10*hour).toISOString(),map_mode:'isolated',territory_lifetime_hours:5,spot_holding_multiplier:1.2,spot_capture_points:.1,holding_points_per_1000_sqm_full_period:1};
const box=(x:number,w=.002)=>polygon([[[x,35],[x+w,35],[x+w,35.002],[x,35.002],[x,35]]]);
const shape=box(139),spot={id:'s',latitude:35.001,longitude:139.001};
const capture=(id:number,time:number,region=shape,team='a'):MapEvent=>({id,kind:'capture',territory_id:null,team_id:team,user_id:team,geometry_json:JSON.stringify(region.geometry),area_sqm:area(region),recorded_at:new Date(start+time*hour).toISOString()});
const replay=(events:MapEvent[],time=10,r=rules)=>replayBattleMap(r,[],events,[spot],['a','b'],[{user_id:'a',team_id:'a'},{user_id:'b',team_id:'b'}],start+time*hour);
describe('per-footprint isolated battle territory leases',()=>{
  it('stops ownership, holding and buffs exactly at expiry without deleting earned points',()=>{
    const events=[capture(1,0)];expect(replay(events,4.999).territories.length).toBe(1);
    const expired=replay(events,5);expect(expired.territories).toHaveLength(0);expect(expired.spots[0].owner_team_id).toBeNull();
    expect(expired.scores.get('a')).toMatchObject({territory_delta_sqm:0,spot_capture_points:.1});
    expect(expired.scores.get('a')!.holding_points).toBeCloseTo(area(shape)/1000*.5);
    expect(replay(events,9).scores).toEqual(expired.scores);
  });
  it('refreshes only the overlap, never disconnected or connected unvisited parts',()=>{
    const half=box(139,.001),events=[capture(1,0),capture(2,4,half)];
    expect(replay(events,6).scores.get('a')!.territory_delta_sqm).toBeCloseTo(area(half));
    expect(replay(events,9).territories).toHaveLength(0);
    const distant=[capture(1,0),capture(2,4,box(139.01))];expect(replay(distant,6).territories[0].geometry).toEqual(box(139.01).geometry);
  });
  it('does not restore a stolen old owner when the newer team expires, or farm spot bonuses',()=>{
    const events=[capture(1,0),capture(2,1,shape,'b')];
    expect(replay(events,5.5).scores.get('a')!.territory_delta_sqm).toBe(0);
    expect(replay(events,6).territories).toHaveLength(0);
    const retaken=replay([capture(1,0),capture(2,6)],9);expect(retaken.scores.get('a')!.spot_capture_points).toBe(.1);
  });
  it('expires at an exact battle-end tie and freezes results forever afterwards',()=>{
    const events=[capture(1,5),capture(2,10)];
    expect(replay(events).territories).toHaveLength(0);expect(replay(events,100)).toEqual(replay(events));
    expect(replay([capture(1,0)],-1).scores.get('a')!.holding_points).toBe(0);
  });
  it('rejects outsiders and leaves legacy unlimited replay untouched',()=>{
    expect(replay([capture(1,0,shape,'outside')],1).territories).toHaveLength(0);
    const territory:MapEvent={...capture(1,0),kind:'territory',territory_id:'old'};
    expect(replay([territory],9,{...rules,territory_lifetime_hours:null}).territories).toHaveLength(1);
  });
});
