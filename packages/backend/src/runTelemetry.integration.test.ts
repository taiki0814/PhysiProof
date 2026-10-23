import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import app from './index';
import {issueSession} from './services/authSession';
import {purgeRunningTelemetry} from './services/runningRetention';
import {runningTrendWindow,placeTrendResponseSchema,type RunTelemetry} from '@my-app/shared';
let DatabaseSync:any;try{DatabaseSync=createRequire(import.meta.url)('node:sqlite').DatabaseSync;}catch{}
const sqlite=DatabaseSync?describe:describe.skip;
const owner=randomUUID(),other=randomUUID();
let native:any,tokens:Record<string,string>,clock:number,queue:Promise<unknown>,beforeBatch:(()=>void)|null;
const sql=(query:string,...args:unknown[])=>native.prepare(query).run(...args);
const one=(query:string,...args:unknown[])=>native.prepare(query).get(...args);
const all=(query:string,...args:unknown[])=>native.prepare(query).all(...args);
const statement=(query:string,args:unknown[]=[]):any=>({bind:(...values:unknown[])=>statement(query,values),first:async()=>one(query,...args)??null,
  all:async()=>({success:true,results:all(query,...args)}),run:async()=>({success:true,meta:{changes:Number(sql(query,...args).changes)}})});
const db={prepare:statement,batch:(items:any[])=>{
  const work=queue.then(async()=>{const hook=beforeBatch;beforeBatch=null;hook?.();native.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());native.exec('COMMIT');return result;}catch(e){native.exec('ROLLBACK');throw e;}});
  queue=work.catch(()=>{});return work;
}} as unknown as D1Database;
const req=(path:string,method='GET',body?:unknown,user:string|null=owner)=>app.request('/api'+path,{
  method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user]}:{})},body:body===undefined?undefined:JSON.stringify(body),
},{DB:db} as any);
const start=(user=owner)=>{const id=randomUUID();sql("INSERT INTO running_sessions(id,user_id,activity_mode,started_at) VALUES(?,?,'personal',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",id,user);return id;};
const packet=(sequence:number,steps=sequence*30,lat=35.68+sequence*.0003):RunTelemetry=>({sequence,recorded_at_ms:clock,source:'android_step_counter',steps,fix:{latitude:lat,longitude:139.75,accuracy_m:5,captured_at_ms:clock,mocked:false}});
async function send(id:string,sequence:number,steps=sequence*30,lat?:number,user=owner){clock+=20000;return req('/running/sessions/'+id+'/telemetry','POST',packet(sequence,steps,lat),user);}
beforeEach(async()=>{
  if(!DatabaseSync)return;native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');queue=Promise.resolve();beforeBatch=null;
  const dir=new URL('../migrations/',import.meta.url);for(const file of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())native.exec(readFileSync(new URL(file,dir),'utf8'));
  for(const id of [owner,other])sql('INSERT INTO users(id,login_id,name,password_hash) VALUES(?,?,?,?)',id,id,'Private fixture','fixture');
  tokens={};for(const id of [owner,other])tokens[id]=await issueSession(db,id);
  clock=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>clock);
});
afterEach(()=>{native?.close();vi.restoreAllMocks();});
sqlite('measured steps and private place passages: real SQL, sessions and migrations',()=>{
  it('defaults location consent off and never changes global consent or historical runs',async()=>{
    expect(one('SELECT share_place_trends,place_trends_consented_at,share_running_trends FROM users WHERE id=?',owner)).toMatchObject({share_place_trends:0,place_trends_consented_at:null,share_running_trends:0});
    const r=await req('/running/places');expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toContain('no-store');
    expect((await r.json() as any).places[0].id).toBe('imperial-palace-surroundings');
    expect(one('SELECT COUNT(*) n FROM running_sessions').n).toBe(0);
  });
  it('requires actual sessions and ownership, rejecting forged IDs or unauthenticated reads/writes',async()=>{
    const id=start();
    for(const path of ['/running/places','/running/places/preferences','/running/steps/me'])expect((await req(path,'GET',undefined,null)).status).toBe(401);
    expect((await req('/running/places/preferences','PUT',{sharing:true},null)).status).toBe(401);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',packet(0),null)).status).toBe(401);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',packet(0),other)).status).toBe(409);
    expect(one('SELECT COUNT(*) n FROM running_motion').n).toBe(0);
  });
  it('accumulates only sensor deltas during the run and separates stationary shaking from eligible movement',async()=>{
    const id=start();await send(id,0,10000,35.68);await send(id,1,10030,35.68);
    expect(one('SELECT measured_steps,eligible_steps,state FROM running_motion')).toMatchObject({measured_steps:30,eligible_steps:0,state:'stationary'});
    const response=await send(id,2,10060,35.6803);
    expect(await response.json()).toMatchObject({measured_steps:60,eligible_steps:30,state:'moving'});
  });
  it.each([
    ['poor GPS',(p:RunTelemetry)=>({...p,fix:{...p.fix!,accuracy_m:100}}),'gps_inaccurate'],
    ['mock position',(p:RunTelemetry)=>({...p,fix:{...p.fix!,mocked:true}}),'mocked'],
    ['teleport',(p:RunTelemetry)=>({...p,fix:{...p.fix!,latitude:36}}),'implausible'],
    ['counter reset',(p:RunTelemetry)=>({...p,steps:0}),'counter_reset'],
    ['cadence jump',(p:RunTelemetry)=>({...p,steps:99999}),'implausible'],
    ['stale fix',(p:RunTelemetry)=>({...p,fix:{...p.fix!,captured_at_ms:clock-60000}}),'gps_unavailable'],
  ])('does not reward %s',async(_name,modify,state)=>{
    const id=start();await send(id,0,100);clock+=20000;
    const r=await req('/running/sessions/'+id+'/telemetry','POST',(modify as (p:RunTelemetry)=>RunTelemetry)(packet(1,130)));
    expect(r.status).toBe(200);expect(await r.json()).toMatchObject({eligible_steps:0,state});
  });
  it('rejects replay, swapped source, future/stale clocks, old heartbeats and malformed steps',async()=>{
    const id=start();await send(id,0);clock+=20000;
    expect((await req('/running/sessions/'+id+'/telemetry','POST',packet(0))).status).toBe(409);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',{...packet(1),source:'unavailable',steps:null})).status).toBe(200); // opted out: no location persistence
    expect((await req('/running/sessions/'+id+'/telemetry','POST',{...packet(1),recorded_at_ms:clock-20000})).status).toBe(409);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',{...packet(1),recorded_at_ms:clock+20000})).status).toBe(409);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',{...packet(1),source:'distance_estimate'})).status).toBe(400);
    sql("UPDATE running_sessions SET last_heartbeat_at=datetime('now','-5 minutes') WHERE id=?",id);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',packet(1))).status).toBe(409);
  });
  it('gaps rebase rather than importing offline steps or a stale GPS segment',async()=>{
    const id=start();await send(id,0,100);clock+=120000;
    const r=await req('/running/sessions/'+id+'/telemetry','POST',packet(1,180));
    expect(await r.json()).toMatchObject({measured_steps:0,eligible_steps:0,state:'gap'});
  });
  it('only one concurrently checked packet can win, and nonce guards prevent duplicate/mismatched place writes',async()=>{
    await req('/running/places/preferences','PUT',{sharing:true});const id=start();await send(id,0);clock+=20000;
    const responses=await Promise.all([req('/running/sessions/'+id+'/telemetry','POST',packet(1)),req('/running/sessions/'+id+'/telemetry','POST',packet(1,60))]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
    const winner=await responses.find(r=>r.status===200)!.json() as any;
    expect([30,60]).toContain(winner.measured_steps);
    expect(one('SELECT measured_steps FROM running_motion').measured_steps).toBe(winner.measured_steps);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(1);
  });
  it('abandonment or completion removes the last raw fix, and only completed real steps enter personal totals',async()=>{
    const id=start();await send(id,0);await send(id,1);
    expect(JSON.stringify(await (await req('/running/steps/me')).json())).not.toContain('last_fix');
    expect((await (await req('/running/steps/me')).json() as any).total_measured_steps).toBe(0);
    const completed=await req('/running/sessions/'+id+'/complete','POST',{distance_m:100,duration_sec:60});expect(completed.status).toBe(200);
    expect(one('SELECT last_fix_json,steps FROM running_motion')).toMatchObject({last_fix_json:null,steps:null});
    expect(await (await req('/running/steps/me')).json()).toMatchObject({total_measured_steps:30,total_eligible_steps:30,measured_runs:1});
    const another=start();await send(another,0);await send(another,1);await req('/running/sessions/'+another,'DELETE');
    expect(one('SELECT last_fix_json FROM running_motion WHERE session_id=?',another).last_fix_json).toBeNull();
    expect((await (await req('/running/steps/me')).json() as any).total_measured_steps).toBe(30);
    expect((await (await req('/running/steps/me','GET',undefined,other)).json() as any).total_measured_steps).toBe(0);
  });
  it('ordinary browsers never store location when place consent is off and never invent steps when on',async()=>{
    const id=start();const p={...packet(0),source:'unavailable',steps:null};
    await req('/running/sessions/'+id+'/telemetry','POST',p);expect(one('SELECT COUNT(*) n FROM running_motion').n).toBe(0);
    await req('/running/sessions/'+id,'DELETE');await req('/running/places/preferences','PUT',{sharing:true});
    const next=start();clock+=20000;await req('/running/sessions/'+next+'/telemetry','POST',{...packet(0),source:'unavailable',steps:null});
    clock+=20000;const result=await req('/running/sessions/'+next+'/telemetry','POST',{...packet(1),source:'unavailable',steps:null});
    expect(await result.json()).toMatchObject({measured_steps:0,eligible_steps:0,state:'moving'});
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(1);
  });
  it('requires consent at the run start; disabling and re-enabling cannot reattach an ongoing old run even at the same timestamp',async()=>{
    const id=start();await req('/running/places/preferences','PUT',{sharing:true});await send(id,0);await send(id,1);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
    await req('/running/sessions/'+id,'DELETE');const after=start();await send(after,0);await send(after,1);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(1);
    await req('/running/places/preferences','PUT',{sharing:false});expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
    await req('/running/places/preferences','PUT',{sharing:true});await send(after,2);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
    expect(one('SELECT share_running_trends,share_place_trends FROM users WHERE id=?',other)).toMatchObject({share_running_trends:0,share_place_trends:0});
  });
  it('retention abandons disconnected runs and removes both stale fixes and expired coarse passages',async()=>{
    await req('/running/places/preferences','PUT',{sharing:true});const id=start();await send(id,0);await send(id,1);
    sql("UPDATE running_sessions SET last_heartbeat_at=datetime('now','-3 minutes') WHERE id=?",id);
    await purgeRunningTelemetry(db);
    expect(one('SELECT status FROM running_sessions').status).toBe('abandoned');expect(one('SELECT last_fix_json FROM running_motion').last_fix_json).toBeNull();
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
  });
  it('limits management to admins and invalidates old geometry atomically on edit',async()=>{
    const body={name:'公共エリア',description:'fixture',south:35.67,north:35.69,west:139.74,east:139.76,active:true,public_area_confirmed:true};
    expect((await req('/admin/running-places','POST',body)).status).toBe(403);
    sql("UPDATE users SET role='admin' WHERE id=?",owner);
    expect((await req('/admin/running-places','POST',{...body,north:36})).status).toBe(400);
    const created=await req('/admin/running-places','POST',body);expect(created.status).toBe(201);
    const id=(await created.json() as any).id;
    expect((await req('/admin/running-places/'+id,'PUT',{...body,active:false})).status).toBe(200);
    expect(one('SELECT active,revision FROM running_places WHERE id=?',id)).toMatchObject({active:0,revision:2});
    expect((await req('/running/places/trends?place_id='+id)).status).toBe(404);
  });
  it('withdrawal clears browser fixes and a concurrently withdrawn consent prevents new browser GPS writes',async()=>{
    await req('/running/places/preferences','PUT',{sharing:true});const id=start();clock+=20000;
    await req('/running/sessions/'+id+'/telemetry','POST',{...packet(0),source:'unavailable',steps:null});
    expect(one('SELECT last_fix_json FROM running_motion').last_fix_json).not.toBeNull();
    await req('/running/places/preferences','PUT',{sharing:false});
    expect(one('SELECT last_fix_json FROM running_motion').last_fix_json).toBeNull();
    await req('/running/places/preferences','PUT',{sharing:true});clock+=20000;
    beforeBatch=()=>sql('UPDATE users SET share_place_trends=0 WHERE id=?',owner);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',{...packet(1),source:'unavailable',steps:null})).status).toBe(409);
    expect(one('SELECT last_fix_json,sequence FROM running_motion')).toMatchObject({last_fix_json:null,sequence:0});
  });
  it('cannot add steps or places after a concurrent session completion',async()=>{
    await req('/running/places/preferences','PUT',{sharing:true});const id=start();await send(id,0);clock+=20000;
    beforeBatch=()=>sql("UPDATE running_sessions SET status='completed' WHERE id=?",id);
    expect((await req('/running/sessions/'+id+'/telemetry','POST',packet(1))).status).toBe(409);
    expect(one('SELECT measured_steps,last_fix_json FROM running_motion')).toMatchObject({measured_steps:0,last_fix_json:null});
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
  });
  it('rolls back both steps and place writes if a passage insert fails',async()=>{
    await req('/running/places/preferences','PUT',{sharing:true});const id=start();await send(id,0);
    native.exec("CREATE TRIGGER reject_fixture_passage BEFORE INSERT ON running_place_passages BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    expect((await send(id,1)).status).toBe(500);
    expect(one('SELECT sequence,measured_steps FROM running_motion')).toMatchObject({sequence:0,measured_steps:0});
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
  });
  it('retains completed totals but deletes expired place buckets',async()=>{
    await req('/running/places/preferences','PUT',{sharing:true});const id=start();await send(id,0);await send(id,1);
    sql("UPDATE running_sessions SET status='completed',completed_at=datetime('now') WHERE id=?",id);
    sql("UPDATE running_place_passages SET bucket_at=datetime('now','-57 days')");
    await purgeRunningTelemetry(db);
    expect(one('SELECT measured_steps FROM running_motion').measured_steps).toBe(30);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
  });
  function historicalPeople(people:number,dates:number){
    const window=runningTrendWindow(4),end=Date.parse(window.ends_at),first=end-3*86400000+8*3600000;
    for(let i=0;i<people;i++){
      const user='historic-'+i;
      sql('INSERT OR IGNORE INTO users(id,login_id,name,password_hash,share_place_trends,place_trends_consented_at) VALUES(?,?,?,?,1,?)',user,user,'Secret runner','fixture',new Date(Date.parse(window.starts_at)-86400000).toISOString());
      for(let day=0;day<dates;day++){
        const started=new Date(first-day*7*86400000),id=randomUUID();
        sql("INSERT INTO running_sessions(id,user_id,activity_mode,status,started_at,completed_at,distance_m,duration_sec) VALUES(?,?,'personal','completed',?,?,1000,600)",id,user,started.toISOString(),new Date(+started+600000).toISOString());
        sql("INSERT INTO running_place_passages(session_id,user_id,place_id,bucket_at) VALUES(?,?,'imperial-palace-surroundings',?)",id,user,started.toISOString());
      }
    }
  }
  it.each([[4,3,false],[5,2,false],[5,3,true],[10,3,true],[20,3,true]])('only publishes sufficiently populated/delayed place cells (%s people, %s days)',async(people,dates,visible)=>{
    historicalPeople(Number(people),Number(dates));
    const response=await req('/running/places/trends?place_id=imperial-palace-surroundings');const data=await response.json() as any;
    expect(placeTrendResponseSchema.safeParse(data).success).toBe(true);
    expect(data.cells.some((c:any)=>c.level!=='insufficient')).toBe(visible);
    expect(data.cells.every((c:any)=>c.count===null)).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/Secret runner|historic-|user_id|latitude|longitude|last_fix|"people"|"dates"/);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('deduplicates repeat laps and immediately removes opted-out users from a previously published cell',async()=>{
    historicalPeople(5,3);
    const before=await (await req('/running/places/trends?place_id=imperial-palace-surroundings')).json() as any;expect(before.cells.some((c:any)=>c.level==='low')).toBe(true);
    sql('UPDATE users SET share_place_trends=0 WHERE id=?','historic-4');
    const after=await (await req('/running/places/trends?place_id=imperial-palace-surroundings')).json() as any;expect(after.cells.every((c:any)=>c.level==='insufficient')).toBe(true);
    expect((await req('/running/places/trends?place_id=imperial-palace-surroundings&latitude=35')).status).toBe(400);
  });
});
