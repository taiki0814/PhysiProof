import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { evaluateRunTelemetry, runTelemetrySchema, runStepSummarySchema, ownStepsSchema, placesAtFix,
  type PreviousRunMotion, type RunFix, type RunningPlace } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';
import {advanceCourse,emptyCourseProgress,courseProgressSchema,telemetryDistance,type CoursePoint} from '@my-app/shared';

type Env={Bindings:{DB:D1Database};Variables:{firebaseUser:{sub:string}}};
type MotionRow={sequence:number;recorded_at_ms:number;received_at_ms:number;steps:number|null;source:'android_step_counter'|'unavailable';last_fix_json:string|null;measured_steps:number;eligible_steps:number;state:string};
export const runTelemetryRoutes=new Hono<Env>().use('*',firebaseAuth)
  .get('/steps/me',async c=>{
    const row=await c.env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN date(s.completed_at,'+9 hours')=date('now','+9 hours') THEN m.measured_steps ELSE 0 END),0) today_measured_steps,
      COALESCE(SUM(CASE WHEN date(s.completed_at,'+9 hours')=date('now','+9 hours') THEN m.eligible_steps ELSE 0 END),0) today_eligible_steps,
      COALESCE(SUM(m.measured_steps),0) total_measured_steps,COALESCE(SUM(m.eligible_steps),0) total_eligible_steps,COUNT(*) measured_runs
      FROM running_motion m JOIN running_sessions s ON s.id=m.session_id
      WHERE s.user_id=? AND s.status='completed' AND m.source='android_step_counter' AND m.sequence>=0`)
      .bind(c.get('firebaseUser').sub).first();
    return c.json(ownStepsSchema.parse(row));
  })
  .post('/sessions/:id/telemetry',zValidator('json',runTelemetrySchema),async c=>{
    const db=c.env.DB, user=c.get('firebaseUser').sub,id=c.req.param('id'),p=c.req.valid('json'),now=Date.now();
    if(now-p.recorded_at_ms>15000||p.recorded_at_ms>now+5000)return c.json({error:'古い計測データは後送できません。'},409);
    const session=await db.prepare(`SELECT s.id,u.share_place_trends,s.course_id FROM running_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.status='active'
      AND julianday(s.last_heartbeat_at)>=julianday('now','-90 seconds')`).bind(id,user).first<{id:string;share_place_trends:number;course_id:string|null}>();
    if(!session)return c.json({error:'有効なオンライン走行が見つかりません。'},409);
    if(p.source==='unavailable'&&session.share_place_trends!==1&&!session.course_id)return c.json(runStepSummarySchema.parse({source:'unavailable',measured_steps:0,eligible_steps:0,state:'baseline'}));
    const old=await db.prepare('SELECT * FROM running_motion WHERE session_id=?').bind(id).first<MotionRow>();
    if(old&&p.sequence<=old.sequence)return c.json({error:'重複または順序が逆の計測データです。'},409);
    if(old&&old.sequence>=0&&(p.recorded_at_ms<=old.recorded_at_ms||old.source!==p.source))return c.json({error:'計測時計または取得方法が変わりました。走行を再開してください。'},409);
    if(old&&now-old.received_at_ms<1500)return c.json({error:'計測の送信間隔が短すぎます。'},429);
    const previous:PreviousRunMotion|null=old&&old.sequence>=0?{...old,fix:old.last_fix_json?JSON.parse(old.last_fix_json) as RunFix:null}:null;
    const summary=evaluateRunTelemetry(previous,p,now),nonce=crypto.randomUUID();
    let courseProgress:ReturnType<typeof advanceCourse>|null=null;
    if(session.course_id){
      const course=await db.prepare('SELECT route_json FROM running_courses WHERE id=? AND user_id=?').bind(session.course_id,user).first<{route_json:string}>();
      const stored=await db.prepare('SELECT state_json FROM running_course_progress WHERE session_id=?').bind(id).first<{state_json:string}>();
      const progress=stored?courseProgressSchema.parse(JSON.parse(stored.state_json)):emptyCourseProgress();
      if(course){
        courseProgress=summary.state==='stationary'?{...progress,last_at:now}:advanceCourse(JSON.parse(course.route_json) as CoursePoint[],progress,p.fix,
          summary.state==='moving'||summary.state==='baseline',now,previous?.fix&&p.fix?telemetryDistance(previous.fix,p.fix):0);
        summary.course_laps=courseProgress.laps;
      }
    }
    const places=session.share_place_trends===1&&summary.state==='moving'&&p.fix
      ?placesAtFix((await db.prepare('SELECT * FROM running_places WHERE active=1 LIMIT 100').all<RunningPlace & {revision:number}>()).results.map(place=>({...place,active:true})),p.fix.latitude,p.fix.longitude):[];
    // Bucket at an even hour in Japan time, not even UTC (Japan is UTC+9).
    const japanBucket=new Date(Math.floor((now+32400000)/7200000)*7200000-32400000).toISOString();
    const results=await db.batch([
      db.prepare('INSERT OR IGNORE INTO running_motion(session_id) VALUES(?)').bind(id),
      db.prepare(`UPDATE running_motion SET sequence=?,recorded_at_ms=?,received_at_ms=?,steps=?,source=?,last_fix_json=?,measured_steps=?,eligible_steps=?,state=?,write_token=?
        WHERE session_id=? AND sequence=? AND EXISTS(SELECT 1 FROM running_sessions WHERE id=? AND user_id=? AND status='active'
          AND julianday(last_heartbeat_at)>=julianday('now','-90 seconds'))
          AND (?='android_step_counter' OR EXISTS(SELECT 1 FROM users WHERE id=? AND share_place_trends=1)
            OR EXISTS(SELECT 1 FROM running_sessions WHERE id=? AND course_id IS NOT NULL))`)
        .bind(p.sequence,p.recorded_at_ms,now,p.steps,p.source,p.fix?JSON.stringify(p.fix):null,summary.measured_steps,summary.eligible_steps,summary.state,nonce,id,old?.sequence??-1,id,user,p.source,user,id),
      ...(courseProgress?[db.prepare(`INSERT INTO running_course_progress(session_id,course_id,state_json,laps)
        SELECT s.id,s.course_id,?,? FROM running_sessions s JOIN running_motion m ON m.session_id=s.id
        WHERE s.id=? AND s.user_id=? AND s.status='active' AND s.course_id=? AND m.write_token=?
        ON CONFLICT(session_id) DO UPDATE SET state_json=excluded.state_json,laps=excluded.laps`)
        .bind(JSON.stringify(courseProgress),courseProgress.laps,id,user,session.course_id,nonce)]:[]),
      ...places.map(place=>db.prepare(`INSERT OR IGNORE INTO running_place_passages(session_id,user_id,place_id,bucket_at)
        SELECT s.id,s.user_id,?,? FROM running_sessions s JOIN users u ON u.id=s.user_id JOIN running_motion m ON m.session_id=s.id
        WHERE s.id=? AND s.status='active' AND m.write_token=? AND u.share_place_trends=1
          AND s.place_consent_epoch=u.place_trends_epoch
          AND julianday(s.started_at)>=julianday(u.place_trends_consented_at)
          AND EXISTS(SELECT 1 FROM running_places WHERE id=? AND active=1 AND revision=?)`)
        .bind(place.id,japanBucket,id,nonce,place.id,place.revision)),
    ]);
    if(!results[1].meta.changes)return c.json({error:'別の計測更新が先に完了しました。'},409);
    return c.json(runStepSummarySchema.parse(summary));
  });
