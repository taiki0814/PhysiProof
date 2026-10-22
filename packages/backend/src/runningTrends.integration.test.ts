import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from './index';
import { issueSession } from './services/authSession';
import { runningTrendWindow, runningTrendResponseSchema } from '@my-app/shared';

let DatabaseSync: any;
try { DatabaseSync=createRequire(import.meta.url)('node:sqlite').DatabaseSync; } catch {}
const sqlite=DatabaseSync?describe:describe.skip;
let native:any, token:string;
const viewer=randomUUID(), other=randomUUID();
const sql=(query:string,...args:unknown[])=>native.prepare(query).run(...args);
const row=(query:string,...args:unknown[])=>native.prepare(query).get(...args);
const statement=(query:string,args:unknown[]=[]):any=>({
  bind:(...values:unknown[])=>statement(query,values),
  first:async()=>row(query,...args)??null,
  all:async()=>({success:true,results:native.prepare(query).all(...args)}),
  run:async()=>({success:true,meta:{changes:Number(sql(query,...args).changes)}}),
});
const db={prepare:statement,batch:async(items:any[])=>{
  native.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());native.exec('COMMIT');return results;}
  catch(error){native.exec('ROLLBACK');throw error;}
}} as unknown as D1Database;
const request=(path:string,method='GET',body?:unknown,auth=token)=>app.request('/api'+path,{
  method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},
  body:body===undefined?undefined:JSON.stringify(body),
},{DB:db} as any);
const period=()=>runningTrendWindow(4);
const timestamp=(daysAgo:number,hours=0)=>Date.parse(period().ends_at)-daysAgo*86400000+hours*3600000;
function run(user:string=viewer,start=timestamp(3,8),options:{distance?:number;duration?:number;status?:string;end?:number;team?:boolean;sqliteTime?:boolean}={}){
  const iso=(time:number)=>new Date(time).toISOString();
  const format=(time:number)=>options.sqliteTime?iso(time).replace('T',' ').replace('.000Z',''):iso(time);
  if(options.team)sql("INSERT OR IGNORE INTO teams(id,name,owner_id) VALUES('fixture-team','fixture',?)",viewer);
  sql(`INSERT INTO running_sessions(id,user_id,activity_mode,team_id,status,started_at,completed_at,distance_m,duration_sec)
    VALUES(?,?,?,?,?,?,?,?,?)`,randomUUID(),user,options.team?'team':'personal',options.team?'fixture-team':null,options.status??'completed',format(start),format(options.end??start+600000),options.distance??1000,options.duration??600);
}
function participant(index:number){
  const id='participant-'+index;
  sql('INSERT OR IGNORE INTO users(id,login_id,password_hash,name,share_running_trends,running_trends_consented_at) VALUES(?,?,?,?,1,?)',id,id,'fixture','Secret name '+index,period().starts_at);
  return id;
}
beforeEach(async()=>{
  if(!DatabaseSync)return;
  native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())native.exec(readFileSync(new URL(file,dir),'utf8'));
  for(const id of [viewer,other])sql('INSERT INTO users(id,login_id,password_hash,name,age,current_weight,height) VALUES(?,?,?,?,22,65,170)',id,id,'fixture','Private name');
  token=await issueSession(db,viewer);
});
afterEach(()=>native?.close());

sqlite('real SQL running trends, consent and private body profile',()=>{
  it('migration defaults to no participation and preserves existing profile values',async()=>{
    expect(row('SELECT share_running_trends,running_trends_consented_at,current_weight,height FROM users WHERE id=?',viewer))
      .toMatchObject({share_running_trends:0,running_trends_consented_at:null,current_weight:65,height:170});
    expect(row("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_running_trends_start'")).toBeTruthy();
    expect(row("SELECT value FROM system_settings WHERE key='show_running_trends_menu'").value).toBe('true');
  });
  it('requires real sessions for reads, preferences and body writes',async()=>{
    for(const auth of ['', 'test-token:'+viewer,'e30.fake.fake','0'.repeat(64)]){
      expect((await request('/running/trends','GET',undefined,auth)).status).toBe(401);
      expect((await request('/running/trends/preferences','PUT',{sharing:true},auth)).status).toBe(401);
      expect((await request('/users/me/vitals','PUT',{gender:null},auth)).status).toBe(401);
    }
    expect((await request('/running/trends?weeks=100')).status).toBe(400);
    expect((await request('/running/trends?scope=friends')).status).toBe(400);
  });
  it('counts only own completed positive runs and classifies Japan-time start, including team runs',async()=>{
    const start=timestamp(3,23)+30*60000;
    run(viewer,start,{end:start+3600000});run(viewer,start,{team:true,sqliteTime:true});run(other,start);
    run(viewer,start,{status:'active'});run(viewer,start,{status:'abandoned'});run(viewer,start,{distance:0});run(viewer,start,{duration:0});
    run(viewer,start,{end:start-1});run(viewer,start,{end:Date.parse(period().ends_at)});
    run(viewer,timestamp(0,1));run(viewer,timestamp(29,8));
    const response=await request('/running/trends?scope=personal');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const data=await response.json() as any;expect(runningTrendResponseSchema.safeParse(data).success).toBe(true);
    expect(data.summary).toEqual({runs:2,distance_m:2000});
    const weekday=new Date(start+9*3600000).getUTCDay();
    expect(data.cells.find((c:any)=>c.weekday===weekday&&c.slot===11)).toMatchObject({count:2,level:'high'});
    expect(data.cells.filter((c:any)=>c.count>0)).toHaveLength(1);
  });
  it('uses inclusive window start and exclusive end; the eight-week option includes older runs',async()=>{
    run(viewer,Date.parse(period().starts_at));run(viewer,Date.parse(period().starts_at)-1);
    const four=await (await request('/running/trends?scope=personal')).json() as any;
    const eight=await (await request('/running/trends?scope=personal&weeks=8')).json() as any;
    expect(four.summary.runs).toBe(1);expect(eight.summary.runs).toBe(2);
  });
  it('suppresses empty/under-five cells and counts distinct people, not repeated runs',async()=>{
    for(let i=0;i<4;i++)run(participant(i));
    for(let i=0;i<30;i++)run('participant-0');
    const data=await (await request('/running/trends')).json() as any;
    expect(data.cells.every((c:any)=>c.level==='insufficient'&&c.count===null)).toBe(true);
    expect(data.summary).toBeNull();
  });
  it.each([[5,'low'],[10,'medium'],[20,'high']])('exposes only a coarse level for %s participants',async(count,level)=>{
    for(let i=0;i<Number(count);i++)run(participant(i));
    const data=await (await request('/running/trends')).json() as any;
    expect(data.cells.filter((c:any)=>c.level!=='insufficient')).toEqual([expect.objectContaining({level,count:null})]);
    expect(JSON.stringify(data)).not.toMatch(/participant-|Private name|Secret name|user_id|latitude|longitude|current_weight|"age"|"participants"|distance_m/);
    expect(data.summary).toBeNull();
  });
  it('never retroactively includes pre-consent or opted-out runs, and opt-out takes effect immediately',async()=>{
    for(let i=0;i<5;i++)run(participant(i));
    const before=await (await request('/running/trends')).json() as any;
    expect(before.cells.some((c:any)=>c.level==='low')).toBe(true);
    sql('UPDATE users SET share_running_trends=0 WHERE id=?','participant-4');
    const after=await (await request('/running/trends')).json() as any;
    expect(after.cells.every((c:any)=>c.level==='insufficient')).toBe(true);
    sql('UPDATE users SET share_running_trends=1,running_trends_consented_at=? WHERE id=?',new Date(timestamp(2)).toISOString(),'participant-4');
    const preConsent=await (await request('/running/trends')).json() as any;
    expect(preConsent.cells.every((c:any)=>c.level==='insufficient')).toBe(true);
  });
  it('enables only the caller, preserves repeat consent, clears on opt-out, starts anew on re-enable',async()=>{
    run();const before=row('SELECT * FROM running_sessions');
    expect((await request('/running/trends/preferences','PUT',{sharing:'true'})).status).toBe(400);
    expect((await request('/running/trends/preferences','PUT',{sharing:true,user_id:other})).status).toBe(400);
    expect((await request('/running/trends/preferences','PUT',{sharing:true})).status).toBe(200);
    const consent=row('SELECT running_trends_consented_at AS t FROM users WHERE id=?',viewer).t;
    expect(Date.parse(consent)).toBeGreaterThan(Date.now()-10000);
    await request('/running/trends/preferences','PUT',{sharing:true});
    expect(row('SELECT running_trends_consented_at AS t FROM users WHERE id=?',viewer).t).toBe(consent);
    await request('/running/trends/preferences','PUT',{sharing:false});
    expect(row('SELECT running_trends_consented_at AS t FROM users WHERE id=?',viewer).t).toBeNull();
    sql('UPDATE users SET running_trends_consented_at=? WHERE id=?',period().starts_at,viewer);
    await request('/running/trends/preferences','PUT',{sharing:true});
    expect(row('SELECT running_trends_consented_at AS t FROM users WHERE id=?',viewer).t).not.toBe(period().starts_at);
    expect(row('SELECT share_running_trends AS s FROM users WHERE id=?',other).s).toBe(0);
    expect(row('SELECT * FROM running_sessions')).toEqual(before);
    expect(row('SELECT territory_map_visibility AS v FROM users WHERE id=?',viewer).v).toBe('private');
  });
  it('round-trips private body values without touching identity, age, map settings, calorie targets or others',async()=>{
    sql('UPDATE users SET target_calories_burned=500,territory_map_visibility=? WHERE id=?','friends',viewer);
    const original=row('SELECT * FROM users WHERE id=?',viewer);
    const values={current_weight:66.5,target_weight:62,height:172.5,gender:'other'};
    const response=await request('/users/me/vitals','PUT',values);expect(response.status).toBe(200);
    expect(await response.json()).toEqual({success:true,vitals:values});
    const me=await (await request('/users/me')).json() as any;expect(me.user).toMatchObject(values);
    const saved=row('SELECT * FROM users WHERE id=?',viewer);
    expect(saved).toEqual({...original,...values});
    expect(row('SELECT current_weight,height FROM users WHERE id=?',other)).toMatchObject({current_weight:65,height:170});
    expect((await request('/users/me/vitals','PUT',{...values,height:999})).status).toBe(400);
    expect(row('SELECT * FROM users WHERE id=?',viewer)).toEqual(saved);
    await request('/users/me/vitals','PUT',{current_weight:null,target_weight:null,height:null,gender:null});
    expect(row('SELECT current_weight,height,gender FROM users WHERE id=?',viewer)).toMatchObject({current_weight:null,height:null,gender:null});
  });
  it('administrator menu saves add trends and cannot revive retired menus; non-admin cannot change settings',async()=>{
    const payload={max_territories:'100',battle_distance_points_per_km:'1',battle_territory_points_per_1000_sqm:'1',battle_holding_points_per_1000_sqm_full_period:'1',show_running_trends_menu:'false',show_ai_predict_menu:'true',show_chat_menu:'true'};
    expect((await request('/admin/settings','POST',payload)).status).toBe(403);
    sql("UPDATE users SET role='admin' WHERE id=?",viewer);
    expect((await request('/admin/settings','POST',payload)).status).toBe(200);
    expect(row("SELECT value FROM system_settings WHERE key='show_running_trends_menu'").value).toBe('false');
    for(const key of ['show_ai_predict_menu','show_chat_menu'])expect(row('SELECT value FROM system_settings WHERE key=?',key).value).toBe('false');
  });
});
