import {Hono} from 'hono';
import {zValidator} from '@hono/zod-validator';
import type {D1Database} from '@cloudflare/workers-types';
import {createRunningCourseSchema,renameRunningCourseSchema,prepareCourse,courseLength,equivalentCourses,runningCourseListSchema,
  courseRewardInventorySchema,cosmeticSelectionSchema,courseUniformEquipSchema,courseRewardUniform} from '@my-app/shared';
import type {CoursePoint} from '@my-app/shared';
import {firebaseAuth} from '../middleware/auth';
import {coursePermission} from '../services/runningCourses';
type Env={Bindings:{DB:D1Database};Variables:{firebaseUser:{sub:string}}};
type CourseRow={id:string;name:string;route_json:string;length_m:number;laps:number;running_days:number};
async function listCourses(db:D1Database,ownerId:string,viewer:string){
  const bind=[ownerId,viewer,viewer,viewer];
  const owner=await db.prepare(`SELECT id,name FROM users WHERE id=? AND ${coursePermission}`).bind(ownerId,...bind).first<{id:string;name:string}>();
  if(!owner)return null;
  const rows=await db.prepare(`SELECT c.id,c.name,c.route_json,c.length_m,COALESCE(SUM(p.laps),0) laps,
    COUNT(DISTINCT date(p.completed_at,'+9 hours')) running_days FROM running_courses c
    LEFT JOIN running_course_completions p ON p.course_id=c.id
    WHERE c.user_id=? AND c.archived=0 AND ${coursePermission} GROUP BY c.id ORDER BY c.created_at,c.id LIMIT 50`).bind(ownerId,...bind).all<CourseRow>();
  return runningCourseListSchema.parse({owner,courses:rows.results.map(({route_json,...r})=>({...r,route:JSON.parse(route_json)}))});
}
export const runningCourseRoutes=new Hono<Env>().use('*',firebaseAuth)
  .get('/',async c=>c.json(await listCourses(c.env.DB,c.get('firebaseUser').sub,c.get('firebaseUser').sub)))
  .post('/',zValidator('json',createRunningCourseSchema),async c=>{
    const user=c.get('firebaseUser').sub,db=c.env.DB,p=c.req.valid('json');
    const source=await db.prepare("SELECT distance_m FROM running_sessions WHERE id=? AND user_id=? AND status='completed' AND distance_m>0 AND duration_sec>0").bind(p.source_session_id,user).first<{distance_m:number}>();
    if(!source)return c.json({error:'自分の完了したオンライン走行から保存してください。'},409);
    let route:CoursePoint[];
    try{route=prepareCourse(p.route);}catch(e){return c.json({error:e instanceof Error?e.message:'コースが不正です。'},400);}
    const length=courseLength(route);
    if(length>source.distance_m*1.25+50)return c.json({error:'保存するコースが元の走行距離と一致しません。'},400);
    const existing=await db.prepare('SELECT id,route_json FROM running_courses WHERE user_id=? AND archived=0 LIMIT 50').bind(user).all<{id:string;route_json:string}>();
    const duplicate=existing.results.find(r=>equivalentCourses(route,JSON.parse(r.route_json)));
    if(duplicate)return c.json({error:'GPSのずれを考慮すると、既に保存したコースと同じです。既存のコースを選択してください。',existing_id:duplicate.id},409);
    const id=crypto.randomUUID();
    const result=await db.prepare(`INSERT INTO running_courses(id,user_id,name,route_json,length_m,source_session_id)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM running_courses WHERE user_id=?)<50
        AND EXISTS(SELECT 1 FROM running_sessions WHERE id=? AND user_id=? AND status='completed')
        AND (SELECT COUNT(*) FROM running_courses WHERE user_id=? AND archived=0)=?`)
      .bind(id,user,p.name,JSON.stringify(route),length,p.source_session_id,user,p.source_session_id,user,user,existing.results.length).run();
    if(!result.meta.changes)return c.json({error:'保存上限は50コースです。または元の走行を確認できません。'},409);
    return c.json({success:true,id},201);
  })
  .put('/:id',zValidator('json',renameRunningCourseSchema),async c=>{
    const r=await c.env.DB.prepare('UPDATE running_courses SET name=? WHERE id=? AND user_id=? AND archived=0')
      .bind(c.req.valid('json').name,c.req.param('id'),c.get('firebaseUser').sub).run();
    return r.meta.changes?c.json({success:true}):c.json({error:'コースが見つかりません。'},404);
  })
  .delete('/:id',async c=>{
    const r=await c.env.DB.prepare('UPDATE running_courses SET archived=1 WHERE id=? AND user_id=?')
      .bind(c.req.param('id'),c.get('firebaseUser').sub).run();
    return r.meta.changes?c.json({success:true}):c.json({error:'コースが見つかりません。'},404);
  });
export const profileCourseRoutes=new Hono<Env>().get('/:id/courses',firebaseAuth,async c=>{
  const result=await listCourses(c.env.DB,c.req.param('id'),c.get('firebaseUser').sub);
  return result?c.json(result):c.json({error:'コースと周回記録は非公開、またはフレンド限定です。'},403);
});
export const courseRewardRoutes=new Hono<Env>().use('*',firebaseAuth)
  .get('/',async c=>{
    const user=c.get('firebaseUser').sub,db=c.env.DB;
    const equipped=await db.prepare('SELECT title_id,frame_id,revision FROM course_cosmetic_equipment WHERE user_id=?').bind(user).first();
    const unlocked=await db.prepare('SELECT reward_id,unlocked_at FROM course_cosmetic_unlocks WHERE user_id=? ORDER BY reward_id').bind(user).all();
    return c.json(courseRewardInventorySchema.parse({equipped:equipped??{title_id:null,frame_id:null,revision:0},unlocked:unlocked.results}));
  })
  .put('/',zValidator('json',cosmeticSelectionSchema),async c=>{
    const user=c.get('firebaseUser').sub,p=c.req.valid('json');
    const r=await c.env.DB.prepare(`INSERT INTO course_cosmetic_equipment(user_id,title_id,frame_id,revision)
      SELECT ?,?,?,1 WHERE (? IS NULL OR EXISTS(SELECT 1 FROM course_cosmetic_unlocks WHERE user_id=? AND reward_id=?))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM course_cosmetic_unlocks WHERE user_id=? AND reward_id=?))
        AND (?=0 OR EXISTS(SELECT 1 FROM course_cosmetic_equipment WHERE user_id=?))
      ON CONFLICT(user_id) DO UPDATE SET title_id=excluded.title_id,frame_id=excluded.frame_id,revision=course_cosmetic_equipment.revision+1
      WHERE course_cosmetic_equipment.revision=?`)
      .bind(user,p.title_id,p.frame_id,p.title_id,user,p.title_id,p.frame_id,user,p.frame_id,p.revision,user,p.revision).run();
    return r.meta.changes?c.json({success:true,revision:p.revision+1}):c.json({error:'未獲得の装飾、または別画面で更新されています。再読み込みしてください。'},409);
  })
  .put('/uniform',zValidator('json',courseUniformEquipSchema),async c=>{
    const user=c.get('firebaseUser').sub,{revision}=c.req.valid('json');
    const r=await c.env.DB.prepare(`INSERT INTO user_uniforms(user_id,design_json,revision)
      SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM course_cosmetic_unlocks WHERE user_id=? AND reward_id='course-uniform')
        AND (?=0 OR EXISTS(SELECT 1 FROM user_uniforms WHERE user_id=?))
      ON CONFLICT(user_id) DO UPDATE SET design_json=excluded.design_json,revision=user_uniforms.revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_uniforms.revision=?`)
      .bind(user,JSON.stringify(courseRewardUniform()),user,revision,user,revision).run();
    return r.meta.changes?c.json({success:true,revision:revision+1}):c.json({error:'ユニフォームが未獲得、または別画面で更新されています。'},409);
  });
