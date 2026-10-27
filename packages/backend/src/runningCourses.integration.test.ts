import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import {courseLength,type CoursePoint} from '@my-app/shared';
import app from './index';
import {issueSession} from './services/authSession';
let SQLite:any;try{SQLite=createRequire(import.meta.url)('node:sqlite').DatabaseSync;}catch{}
const suite=SQLite?describe:describe.skip;
const owner=randomUUID(),friend=randomUUID(),outsider=randomUUID();
let native:any,clock:number,tokens:Record<string,string>,queue:Promise<unknown>;
const sql=(query:string,...args:unknown[])=>native.prepare(query).run(...args);
const one=(query:string,...args:unknown[])=>native.prepare(query).get(...args);
const all=(query:string,...args:unknown[])=>native.prepare(query).all(...args);
const statement=(query:string,args:unknown[]=[]):any=>({bind:(...a:unknown[])=>statement(query,a),first:async()=>one(query,...args)??null,
  all:async()=>({success:true,results:all(query,...args)}),run:async()=>({success:true,meta:{changes:Number(sql(query,...args).changes)}})});
const db={prepare:statement,batch:(items:any[])=>{const work=queue.then(async()=>{native.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}});queue=work.catch(()=>{});return work;}} as unknown as D1Database;
const req=(path:string,method='GET',body?:unknown,user:string|null=owner)=>app.request('/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user]}:{})},body:body===undefined?undefined:JSON.stringify(body)},{DB:db} as any);
const route:CoursePoint[]=Array.from({length:37},(_,i)=>[35.68+Math.sin(i/36*Math.PI*2)*.0018,139.75+Math.cos(i/36*Math.PI*2)*.0022]);route[36]=route[0];
const length=courseLength(route);
function historicalRun(user=owner){const id=randomUUID();sql("INSERT INTO running_sessions(id,user_id,activity_mode,status,distance_m,duration_sec,completed_at) VALUES(?,?,'personal','completed',?,600,CURRENT_TIMESTAMP)",id,user,length);return id;}
async function createCourse(){const source=historicalRun();const r=await req('/running/courses','POST',{name:'Private circuit',source_session_id:source,route});expect(r.status).toBe(201);return (await r.json() as any).id as string;}
async function start(courseId:string){const r=await req('/running/sessions','POST',{activity_mode:'personal',course_id:courseId});expect(r.status).toBe(201);return (await r.json() as any).session_id as string;}
async function walk(session:string,laps=1,points=route){
  const path=[...points];for(let i=1;i<laps;i++)path.push(...points.slice(1));
  let summary:any;
  for(let i=0;i<path.length;i++){
    clock+=10000;const p=path[i];const r=await req('/running/sessions/'+session+'/telemetry','POST',{sequence:i,recorded_at_ms:clock,source:'unavailable',steps:null,fix:{latitude:p[0],longitude:p[1],accuracy_m:8,captured_at_ms:clock,mocked:false}});
    expect(r.status).toBe(200);summary=await r.json();
  }
  return summary;
}
function previousCompletions(courseId:string,laps:number,dayOffset:number){
  const session=historicalRun();sql("INSERT INTO running_course_completions(session_id,course_id,user_id,laps,length_m,completed_at) VALUES(?,?,?,?,?,datetime('now',?))",session,courseId,owner,laps,length,`-${dayOffset} days`);
}
beforeEach(async()=>{
  if(!SQLite)return;native=new SQLite(':memory:');native.exec('PRAGMA foreign_keys=ON');queue=Promise.resolve();
  const dir=new URL('../migrations/',import.meta.url);for(const file of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())native.exec(readFileSync(new URL(file,dir),'utf8'));
  for(const user of [owner,friend,outsider])sql('INSERT INTO users(id,login_id,password_hash,name) VALUES(?,?,?,?)',user,user,'fixture','Private runner');
  tokens={};for(const user of [owner,friend,outsider])tokens[user]=await issueSession(db,user);
  clock=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>clock);
});
afterEach(()=>{native?.close();vi.restoreAllMocks();});
suite('online courses, private loop maps and cosmetic-only unlocks: actual SQL',()=>{
  it('requires an authenticated owner and completed run, rejects malformed/open/oversized/other-owner routes',async()=>{
    expect((await req('/running/courses','GET',undefined,null)).status).toBe(401);
    expect((await req('/running/rewards','GET',undefined,null)).status).toBe(401);
    const source=historicalRun(friend),body={name:'loop',source_session_id:source,route};
    expect((await req('/running/courses','POST',body)).status).toBe(409);
    body.source_session_id=historicalRun();expect((await req('/running/courses','POST',{...body,route:route.slice(0,20)})).status).toBe(400);
    expect((await req('/running/courses','POST',{...body,name:''})).status).toBe(400);
    expect(one('SELECT COUNT(*) n FROM running_courses').n).toBe(0);
  });
  it('recognises shifted same-course registrations, keeps route immutable and prevents foreign start/edit/archive',async()=>{
    const id=await createCourse(),source=historicalRun();
    const duplicate=await req('/running/courses','POST',{name:'GPS offset',source_session_id:source,route:route.map(p=>[p[0]+.0001,p[1]])});
    expect(duplicate.status).toBe(409);expect((await duplicate.json() as any).existing_id).toBe(id);
    expect((await req('/running/courses/'+id,'PUT',{name:'stolen'},friend)).status).toBe(404);
    expect((await req('/running/courses/'+id,'DELETE',undefined,friend)).status).toBe(404);
    expect((await req('/running/sessions','POST',{activity_mode:'personal',course_id:id},friend)).status).toBe(409);
    const before=one('SELECT route_json FROM running_courses WHERE id=?',id).route_json;
    expect((await req('/running/courses/'+id,'PUT',{name:'Renamed'})).status).toBe(200);
    expect(one('SELECT route_json FROM running_courses WHERE id=?',id).route_json).toBe(before);
  });
  it('records browser GPS-confirmed laps without statistics consent or fabricated steps, committing only on run completion',async()=>{
    const id=await createCourse(),session=await start(id),summary=await walk(session,2);
    expect(summary).toMatchObject({course_laps:2,source:'unavailable',measured_steps:0,eligible_steps:0});
    expect(one('SELECT COUNT(*) n FROM running_course_completions').n).toBe(0);
    expect(one('SELECT COUNT(*) n FROM running_place_passages').n).toBe(0);
    expect(one('SELECT share_place_trends FROM users WHERE id=?',owner).share_place_trends).toBe(0);
    const completed=await req('/running/sessions/'+session+'/complete','POST',{distance_m:length*2,duration_sec:720});expect(completed.status).toBe(200);
    expect(one('SELECT laps FROM running_course_completions WHERE session_id=?',session).laps).toBe(2);
    expect(one('SELECT COUNT(*) n FROM running_course_progress').n).toBe(0);
    expect(one('SELECT last_fix_json FROM running_motion WHERE session_id=?',session).last_fix_json).toBeNull();
    const data=await (await req('/profiles/'+owner+'/courses')).json() as any;expect(data.courses[0]).toMatchObject({laps:2,running_days:1});
    expect((await req('/running/sessions/'+session+'/complete','POST',{distance_m:length*2,duration_sec:720})).status).toBe(409);
    expect(one('SELECT COUNT(*) n FROM running_course_completions').n).toBe(1);
  });
  it('does not count partial/crossing routes, abandoned runs, replay or client-supplied lap counts',async()=>{
    const id=await createCourse(),session=await start(id);await walk(session,1,route.slice(0,18));
    expect((await req('/running/sessions/'+session+'/telemetry','POST',{sequence:1,recorded_at_ms:clock,source:'unavailable',steps:null,fix:null,course_laps:999})).status).toBe(400);
    await req('/running/sessions/'+session,'DELETE');expect(one('SELECT COUNT(*) n FROM running_course_progress').n).toBe(0);
    expect(one('SELECT COUNT(*) n FROM running_course_completions').n).toBe(0);
    const second=await start(id);await walk(second,1,[route[0],route[18],route[0]]);
    await req('/running/sessions/'+second+'/complete','POST',{distance_m:length,duration_sec:600});
    expect(one('SELECT COUNT(*) n FROM running_course_completions').n).toBe(0);
  });
  it('uses private/mutual-friend map permission, with no teammate/admin shortcut and no public route export',async()=>{
    await createCourse();
    expect((await req('/profiles/'+owner+'/courses','GET',undefined,friend)).status).toBe(403);
    sql("UPDATE users SET territory_map_visibility='friends' WHERE id=?",owner);sql('INSERT INTO friends(user_id,friend_id) VALUES(?,?)',owner,friend);
    expect((await req('/profiles/'+owner+'/courses','GET',undefined,friend)).status).toBe(403);
    sql('INSERT INTO friends(user_id,friend_id) VALUES(?,?)',friend,owner);
    const allowed=await req('/profiles/'+owner+'/courses','GET',undefined,friend);expect(allowed.status).toBe(200);expect(allowed.headers.get('Cache-Control')).toContain('no-store');
    sql('DELETE FROM friends WHERE user_id=? AND friend_id=?',friend,owner);
    expect((await req('/profiles/'+owner+'/courses','GET',undefined,friend)).status).toBe(403);
    sql("UPDATE users SET role='admin' WHERE id=?",outsider);
    expect((await req('/profiles/'+owner+'/courses','GET',undefined,outsider)).status).toBe(403);
    expect(JSON.stringify(await (await req('/territories?scope=all')).json())).not.toContain('Private circuit');
  });
  it('unlocks once from distinct running dates, forbids unowned equipment and preserves normal run scores',async()=>{
    const id=await createCourse();previousCompletions(id,4,2);const session=await start(id);await walk(session);
    expect((await req('/running/rewards','PUT',{title_id:'course-title',frame_id:null,revision:0})).status).toBe(409);
    expect((await req('/running/rewards/uniform','PUT',{revision:0})).status).toBe(409);
    const stats="SELECT xp,level,(SELECT COALESCE(SUM(distance_m),0) FROM running_sessions WHERE user_id=u.id AND status='completed') personal_total_distance_m FROM users u WHERE id=?";
    const before=one(stats,owner);
    await req('/running/sessions/'+session+'/complete','POST',{distance_m:length,duration_sec:360});
    expect(one("SELECT COUNT(*) n FROM course_cosmetic_unlocks WHERE reward_id='course-title'").n).toBe(1);
    expect(one('SELECT COUNT(*) n FROM course_cosmetic_unlocks').n).toBe(1);
    expect((await req('/running/rewards','PUT',{title_id:'course-title',frame_id:null,revision:0})).status).toBe(200);
    expect((await req('/running/rewards','PUT',{title_id:null,frame_id:null,revision:0})).status).toBe(409);
    const after=one(stats,owner);
    expect(after.xp).toBe(before.xp);expect(after.level).toBe(before.level);expect(after.personal_total_distance_m-before.personal_total_distance_m).toBeCloseTo(length);
  });
  it('does not unlock rare rewards from many laps on one day or sub-500m courses',async()=>{
    const id=await createCourse();previousCompletions(id,100,0);const session=await start(id);await walk(session);
    await req('/running/sessions/'+session+'/complete','POST',{distance_m:length,duration_sec:360});expect(one('SELECT COUNT(*) n FROM course_cosmetic_unlocks').n).toBe(0);
    sql('UPDATE running_course_completions SET length_m=300');previousCompletions(id,100,2);sql('UPDATE running_course_completions SET length_m=300');
    const next=await start(id);await walk(next);sql('UPDATE running_courses SET length_m=300 WHERE id=?',id);
    await req('/running/sessions/'+next+'/complete','POST',{distance_m:length,duration_sec:360});expect(one('SELECT COUNT(*) n FROM course_cosmetic_unlocks').n).toBe(0);
  });
  it('atomically rolls back completion and lap grants when reward saving fails',async()=>{
    const id=await createCourse();previousCompletions(id,4,2);const session=await start(id);await walk(session);
    native.exec("CREATE TRIGGER fixture_reject_unlock BEFORE INSERT ON course_cosmetic_unlocks BEGIN SELECT RAISE(ABORT,'fixture rollback');END");
    expect((await req('/running/sessions/'+session+'/complete','POST',{distance_m:length,duration_sec:360})).status).toBe(500);
    expect(one('SELECT status FROM running_sessions WHERE id=?',session).status).toBe('active');
    expect(one('SELECT COUNT(*) n FROM running_course_completions WHERE session_id=?',session).n).toBe(0);
    expect(one('SELECT laps FROM running_course_progress WHERE session_id=?',session).laps).toBe(1);
  });
  it('unlocks all tiers on seven distinct dates, equips with revision guards, and never changes team uniforms',async()=>{
    const id=await createCourse();previousCompletions(id,24,1);for(let day=2;day<=6;day++)previousCompletions(id,1,day);
    const session=await start(id);await walk(session);await req('/running/sessions/'+session+'/complete','POST',{distance_m:length,duration_sec:360});
    const inventory=await (await req('/running/rewards')).json() as any;expect(inventory.unlocked).toHaveLength(3);
    expect((await req('/running/rewards','PUT',{title_id:'course-title',frame_id:'course-frame',revision:0})).status).toBe(200);
    expect((await req('/running/rewards','PUT',{title_id:null,frame_id:null,revision:1})).status).toBe(200);
    expect((await req('/running/rewards/uniform','PUT',{revision:0})).status).toBe(200);
    expect((await req('/running/rewards/uniform','PUT',{revision:0})).status).toBe(409);
    expect(JSON.parse(one('SELECT design_json FROM user_uniforms WHERE user_id=?',owner).design_json).jersey_name).toBe('CIRCUIT');
    expect(one('SELECT COUNT(*) n FROM team_uniforms').n).toBe(0);
  });
  it('prevents duplicate concurrent registrations and duplicate course-progress packets',async()=>{
    const source=historicalRun(),body={name:'Concurrent loop',source_session_id:source,route};
    const responses=await Promise.all([req('/running/courses','POST',body),req('/running/courses','POST',body)]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
    const id=one('SELECT id FROM running_courses').id,session=await start(id);await walk(session);clock+=10000;
    const point=route[1],packet={sequence:37,recorded_at_ms:clock,source:'unavailable',steps:null,fix:{latitude:point[0],longitude:point[1],accuracy_m:8,captured_at_ms:clock,mocked:false}};
    const r=await Promise.all([req('/running/sessions/'+session+'/telemetry','POST',packet),req('/running/sessions/'+session+'/telemetry','POST',packet)]);expect(r.map(x=>x.status).sort()).toEqual([200,409]);
    expect(one('SELECT laps FROM running_course_progress WHERE session_id=?',session).laps).toBe(1);
  });
  it('cleans up course data with its owner rather than blocking account deletion',async()=>{
    const id=await createCourse(),session=await start(id);await walk(session);await req('/running/sessions/'+session+'/complete','POST',{distance_m:length,duration_sec:360});
    sql('DELETE FROM users WHERE id=?',owner);
    expect(one('SELECT COUNT(*) n FROM running_courses').n).toBe(0);expect(one('SELECT COUNT(*) n FROM running_course_completions').n).toBe(0);
    expect(all('PRAGMA foreign_key_check')).toEqual([]);
  });
});
