import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import {EXTERNAL_RUNNING_WINDOW_MS,externalRunningDisplay,getRunningTitleProgress} from '@my-app/shared';
import app from './index';
import {issueSession} from './services/authSession';
import {purgeExternalRunning} from './services/externalRunningRetention';
let SQLite:any;try{SQLite=createRequire(import.meta.url)('node:sqlite').DatabaseSync;}catch{}
const suite=SQLite?describe:describe.skip,owner=randomUUID(),other=randomUUID();
let native:any,tokens:Record<string,string>,queue:Promise<unknown>,now:number;
const sql=(q:string,...args:unknown[])=>native.prepare(q).run(...args);
const one=(q:string,...args:unknown[])=>native.prepare(q).get(...args);
const all=(q:string,...args:unknown[])=>native.prepare(q).all(...args);
const statement=(q:string,args:unknown[]=[]):any=>({bind:(...a:unknown[])=>statement(q,a),first:async()=>one(q,...args)??null,all:async()=>({success:true,results:all(q,...args)}),run:async()=>({success:true,meta:{changes:Number(sql(q,...args).changes)}})});
const db={prepare:statement,batch:(items:any[])=>{const work=queue.then(async()=>{native.exec('BEGIN');try{const r=[];for(const s of items)r.push(await s.run());native.exec('COMMIT');return r;}catch(e){native.exec('ROLLBACK');throw e;}});queue=work.catch(()=>{});return work;}} as unknown as D1Database;
const req=(path='',method='GET',body?:unknown,user:string|null=owner)=>app.request('/api/running/external'+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user]}:{})},body:body===undefined?undefined:JSON.stringify(body)},{DB:db} as any);
const view=async(user=owner)=>await(await req('','GET',undefined,user)).json() as any;
const record=(p={})=>({record_id:randomUUID(),source_id:'watch.app',started_at_ms:now-3600000,ended_at_ms:now-1800000,distance_m:5000,...p});
const snapshot=(revision:number,records=[record()])=>({provider:'health_connect',revision,window_start_ms:now-EXTERNAL_RUNNING_WINDOW_MS,window_end_ms:now,records});
const enable=async(user=owner)=>{const v=await view(user),r=await req('/consent','PUT',{enabled:true,revision:v.revision},user);expect(r.status).toBe(200);return (await r.json() as any).revision as number;};
beforeEach(async()=>{
  if(!SQLite)return;native=new SQLite(':memory:');native.exec('PRAGMA foreign_keys=ON');queue=Promise.resolve();
  const dir=new URL('../migrations/',import.meta.url);for(const f of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())native.exec(readFileSync(new URL(f,dir),'utf8'));
  for(const id of [owner,other])sql('INSERT INTO users(id,login_id,password_hash,name) VALUES(?,?,?,?)',id,id,'fixture',id===owner?'Private health owner':'Other');
  tokens={};for(const id of [owner,other])tokens[id]=await issueSession(db,id);
  now=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>now);
});
afterEach(()=>{native?.close();vi.restoreAllMocks();});
suite('external health running: private reference-only actual SQL',()=>{
  it('requires real sessions and explicit separate default-off storage consent',async()=>{
    for(const [path,method,body] of [['','GET',undefined],['/consent','PUT',{enabled:true,revision:0}],['/sync','PUT',snapshot(0)]] as const)expect((await req(path,method,body,null)).status).toBe(401);
    expect(await view()).toMatchObject({enabled:false,revision:0,records:[],synced_at_ms:null});
    expect((await req('/sync','PUT',snapshot(0))).status).toBe(409);expect(one('SELECT COUNT(*) n FROM external_running_records').n).toBe(0);
    const revision=await enable();expect((await req('/sync','PUT',snapshot(revision))).status).toBe(200);
    expect(one('SELECT share_place_trends FROM users WHERE id=?',owner).share_place_trends).toBe(0);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
  });
  it('bounds input and rejects forged game eligibility, source injection and old/partial snapshots without deleting saved data',async()=>{
    let revision=await enable();expect((await req('/sync','PUT',snapshot(revision))).status).toBe(200);revision++;
    const before=await view();
    for(const payload of [{...snapshot(revision),team_id:'team'},{...snapshot(revision),records:[record({course_laps:1})]},{...snapshot(revision),records:[record({distance_m:-1})]},{...snapshot(revision),records:[record({source_id:'<script>'})]},
      {...snapshot(revision),window_end_ms:now-3600000,window_start_ms:now-EXTERNAL_RUNNING_WINDOW_MS-3600000},{...snapshot(revision),records:[record({ended_at_ms:now+1})]}])expect((await req('/sync','PUT',payload)).status).toBe(400);
    expect(await view()).toEqual(before);
    expect((await req('/sync','PUT',{...snapshot(revision),records:Array(501).fill(record())})).status).toBe(400);
    expect((await req('/sync','PUT',{padding:'x'.repeat(270000)})).status).toBe(413);
    expect(await view()).toEqual(before);
  });
  it('replaces corrections/deletions, deduplicates repeats and rejects a replay or concurrent stale writer',async()=>{
    let rev=await enable();const a=record(),copy=record({distance_m:4990,source_id:'phone.app'});
    expect((await req('/sync','PUT',snapshot(rev,[a,copy]))).status).toBe(200);rev++;
    expect(externalRunningDisplay((await view()).records)).toMatchObject({distance_m:5000,omitted:1});
    expect((await req('/sync','PUT',snapshot(rev-1,[]))).status).toBe(409);expect((await view()).records).toHaveLength(2);
    const r=await Promise.all([req('/sync','PUT',snapshot(rev,[{...a,distance_m:4500}])),req('/sync','PUT',snapshot(rev,[]))]);expect(r.map(x=>x.status).sort()).toEqual([200,409]);
    expect((await view()).records).toMatchObject([{distance_m:4500}]);rev++;
    expect((await req('/sync','PUT',snapshot(rev,[]))).status).toBe(200);expect((await view()).records).toEqual([]);
  });
  it('withdraws atomically and cannot restore old health data after off/on even with stale sync',async()=>{
    let rev=await enable();await req('/sync','PUT',snapshot(rev));rev++;
    expect((await req('/consent','PUT',{enabled:false,revision:rev})).status).toBe(200);rev++;
    expect(await view()).toMatchObject({enabled:false,records:[],synced_at_ms:null});expect(one('SELECT COUNT(*) n FROM external_running_records').n).toBe(0);
    expect((await req('/sync','PUT',snapshot(rev-1))).status).toBe(409);await enable();rev++;
    expect((await req('/sync','PUT',snapshot(rev-2))).status).toBe(409);expect((await view()).records).toEqual([]);
    expect((await req('/sync','PUT',snapshot(rev))).status).toBe(200);
  });
  it('never resurrects data when withdrawal races a foreground import',async()=>{
    const rev=await enable();
    await Promise.all([req('/consent','PUT',{enabled:false,revision:rev}),req('/sync','PUT',snapshot(rev))]);
    expect(await view()).toMatchObject({enabled:false,records:[]});
    expect(one('SELECT COUNT(*) n FROM external_running_records').n).toBe(0);
    // Reversing arrival order can require a fresh revision to withdraw, never a blind overwrite.
    const next=await enable();const r=await Promise.all([req('/sync','PUT',snapshot(next)),req('/consent','PUT',{enabled:false,revision:next})]);
    expect(r.map(x=>x.status)).toEqual([200,409]);
    const latest=await view();expect((await req('/consent','PUT',{enabled:false,revision:latest.revision})).status).toBe(200);
    expect((await view()).records).toEqual([]);
  });
  it('never exposes owner data to friends, teammates, administrator or query-parameter impersonation',async()=>{
    await req('/sync','PUT',snapshot(await enable()));sql("UPDATE users SET role='admin',territory_map_visibility='friends' WHERE id=?",other);
    sql('INSERT INTO friends(user_id,friend_id) VALUES(?,?),(?,?)',owner,other,other,owner);
    expect((await view(other)).records).toEqual([]);
    const own=await req();expect(own.headers.get('Cache-Control')).toContain('no-store');expect(own.headers.get('Cache-Control')).toContain('private');
    expect((await(await req('?user_id='+owner,'GET',undefined,other)).json() as any).records).toEqual([]);
    expect((await req('/'+owner,'GET',undefined,other)).status).toBe(404);
    expect((await req('/sync','PUT',{...snapshot(0),user_id:owner},other)).status).toBe(400);
    const publicMap=await app.request('/api/territories?scope=all',{}, {DB:db} as any);expect(JSON.stringify(await publicMap.json())).not.toContain('watch.app');
  });
  it('leaves all game/step/mileage/reward data identical even for large imported distances',async()=>{
    const tables=['running_sessions','running_motion','running_course_completions','course_cosmetic_unlocks','territories','exercise_logs','team_battle_run_scores','running_place_passages'];
    const existing=tables.filter(t=>one("SELECT name FROM sqlite_master WHERE type='table' AND name=?",t));
    const state=()=>JSON.stringify([one('SELECT * FROM users WHERE id=?',owner),...existing.map(t=>all('SELECT * FROM '+t))]);const before=state(),title=getRunningTitleProgress(0);
    const records=[record({distance_m:300000}),record({distance_m:200000,started_at_ms:now-80000000,ended_at_ms:now-70000000})];
    await req('/sync','PUT',snapshot(await enable(),records));expect(state()).toBe(before);expect(getRunningTitleProgress(0)).toEqual(title);
    const r=await app.request('/api/running/sessions/'+records[0].record_id+'/complete',{method:'POST',headers:{Authorization:'Bearer '+tokens[owner],'Content-Type':'application/json'},body:JSON.stringify({distance_m:300000,duration_sec:40000})},{DB:db} as any);expect(r.status).toBe(404);expect(state()).toBe(before);
  });
  it('rolls back the full snapshot if storage fails and never reports a partial successful import',async()=>{
    let rev=await enable();await req('/sync','PUT',snapshot(rev));rev++;const before=await view();
    native.exec("CREATE TRIGGER fixture_reject_external BEFORE INSERT ON external_running_records BEGIN SELECT RAISE(ABORT,'fixture failure');END");
    expect((await req('/sync','PUT',snapshot(rev))).status).toBe(500);expect(await view()).toEqual(before);
  });
  it('hides and purges expired records and removes imported data with the account',async()=>{
    await req('/sync','PUT',snapshot(await enable()));now+=EXTERNAL_RUNNING_WINDOW_MS;
    expect((await view()).records).toEqual([]);await purgeExternalRunning(db,now);expect(one('SELECT COUNT(*) n FROM external_running_records').n).toBe(0);
    sql('DELETE FROM users WHERE id=?',owner);expect(one('SELECT COUNT(*) n FROM external_running_links').n).toBe(0);expect(all('PRAGMA foreign_key_check')).toEqual([]);
  });
});
