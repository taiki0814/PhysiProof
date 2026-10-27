import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { publicRunningPlaceSchema,runningPlaceListSchema,placeSharingSchema,placeTrendQuerySchema,
  placeTrendResponseSchema,runningTrendWindow,type RunningTrendCell } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';
type Env={Bindings:{DB:D1Database};Variables:{firebaseUser:{sub:string}}};
const place=(row:Record<string,unknown>)=>({...row,active:row.active===1});
export const runningPlaceRoutes=new Hono<Env>().use('*',firebaseAuth)
  .get('/',async c=>{
    const rows=await c.env.DB.prepare('SELECT * FROM running_places WHERE active=1 ORDER BY name LIMIT 100').all<Record<string,unknown>>();
    return c.json(runningPlaceListSchema.parse({places:rows.results.map(place)}));
  })
  .get('/preferences',async c=>{
    const row=await c.env.DB.prepare('SELECT share_place_trends FROM users WHERE id=?').bind(c.get('firebaseUser').sub).first<{share_place_trends:number}>();
    if(!row)return c.json({error:'ユーザーが見つかりません。'},404);
    return c.json({sharing:row.share_place_trends===1});
  })
  .put('/preferences',zValidator('json',placeSharingSchema),async c=>{
    const {sharing}=c.req.valid('json'),user=c.get('firebaseUser').sub,db=c.env.DB;
    const results=await db.batch([
      db.prepare(`UPDATE users SET place_trends_epoch=place_trends_epoch+CASE WHEN share_place_trends<>? THEN 1 ELSE 0 END,
        place_trends_consented_at=CASE WHEN ?=0 THEN NULL WHEN share_place_trends=0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE place_trends_consented_at END,share_place_trends=? WHERE id=?`).bind(sharing?1:0,sharing?1:0,sharing?1:0,user),
      // Also run this after opt-in: expired records have no useful purpose.
      db.prepare("DELETE FROM running_place_passages WHERE (?=0 AND user_id=?) OR julianday(bucket_at)<julianday('now','-56 days')").bind(sharing?1:0,user),
      // Browser location is needed only for consented statistics, unlike native anti-cheat.
      db.prepare("UPDATE running_motion SET last_fix_json=NULL,steps=NULL WHERE ?=0 AND source='unavailable' AND session_id IN(SELECT id FROM running_sessions WHERE user_id=? AND course_id IS NULL)").bind(sharing?1:0,user),
    ]);
    if(!results[0].meta.changes)return c.json({error:'ユーザーが見つかりません。'},404);
    return c.json({sharing});
  })
  .get('/trends',zValidator('query',placeTrendQuerySchema),async c=>{
    const db=c.env.DB,{place_id,weeks:raw}=c.req.valid('query'),weeks=Number(raw) as 4|8,window=runningTrendWindow(weeks);
    const row=await db.prepare('SELECT * FROM running_places WHERE id=? AND active=1').bind(place_id).first<Record<string,unknown>>();
    if(!row)return c.json({error:'集計場所が見つかりません。'},404);
    const preference=await db.prepare('SELECT share_place_trends FROM users WHERE id=?').bind(c.get('firebaseUser').sub).first<{share_place_trends:number}>();
    const grouped=await db.prepare(`SELECT CAST(strftime('%w',p.bucket_at,'+9 hours') AS INTEGER) weekday,
      CAST(CAST(strftime('%H',p.bucket_at,'+9 hours') AS INTEGER)/2 AS INTEGER) slot,
      COUNT(DISTINCT p.user_id) people,COUNT(DISTINCT date(p.bucket_at,'+9 hours')) dates
      FROM running_place_passages p JOIN running_sessions s ON s.id=p.session_id JOIN users u ON u.id=p.user_id
      WHERE p.place_id=? AND s.status='completed' AND s.distance_m>0 AND s.duration_sec>0
        AND julianday(s.completed_at)<julianday(?) AND julianday(p.bucket_at)>=julianday(?) AND julianday(p.bucket_at)<julianday(?)
        AND u.share_place_trends=1 AND s.place_consent_epoch=u.place_trends_epoch AND julianday(s.started_at)>=julianday(u.place_trends_consented_at)
      GROUP BY weekday,slot`).bind(place_id,window.ends_at,window.starts_at,window.ends_at).all<{weekday:number;slot:number;people:number;dates:number}>();
    const groups=new Map(grouped.results.map(g=>[g.weekday*12+g.slot,g]));
    const cells:RunningTrendCell[]=Array.from({length:84},(_,i)=>{
      const g=groups.get(i);return{weekday:Math.floor(i/12),slot:i%12,count:null,
        level:!g||g.people<5||g.dates<3?'insufficient':g.people<10?'low':g.people<20?'medium':'high'};
    });
    return c.json(placeTrendResponseSchema.parse({...window,weeks,place:place(row),cells,timezone:'Asia/Tokyo',method:'place_passages',sharing:preference?.share_place_trends===1,min_participants:5,min_dates:3}));
  });
export const adminRunningPlaceRoutes=new Hono<Env>().use('*',firebaseAuth).use('*',async(c,next)=>{
  const user=await c.env.DB.prepare('SELECT role FROM users WHERE id=?').bind(c.get('firebaseUser').sub).first<{role:string}>();
  if(user?.role!=='admin')return c.json({error:'管理者権限が必要です。'},403);
  await next();
})
  .get('/',async c=>c.json(runningPlaceListSchema.parse({places:(await c.env.DB.prepare('SELECT * FROM running_places ORDER BY name LIMIT 100').all<Record<string,unknown>>()).results.map(place)})))
  .post('/',zValidator('json',publicRunningPlaceSchema),async c=>{
    const db=c.env.DB;
    const p=c.req.valid('json'),id=crypto.randomUUID();
    const inserted=await db.prepare('INSERT INTO running_places(id,name,description,south,north,west,east,active) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM running_places)<100')
      .bind(id,p.name,p.description,p.south,p.north,p.west,p.east,p.active?1:0).run();
    if(!inserted.meta.changes)return c.json({error:'登録できるエリアは100件までです。'},409);
    return c.json({success:true,id},201);
  })
  .put('/:id',zValidator('json',publicRunningPlaceSchema),async c=>{
    const p=c.req.valid('json');
    // Atomic invalidation and revision guard prevent old geometry being relabelled.
    const results=await c.env.DB.batch([
      c.env.DB.prepare('UPDATE running_places SET name=?,description=?,south=?,north=?,west=?,east=?,active=?,revision=revision+1 WHERE id=?')
        .bind(p.name,p.description,p.south,p.north,p.west,p.east,p.active?1:0,c.req.param('id')),
      c.env.DB.prepare('DELETE FROM running_place_passages WHERE place_id=?').bind(c.req.param('id')),
    ]);
    if(!results[0].meta.changes)return c.json({error:'集計エリアが見つかりません。'},404);
    return c.json({success:true});
  });
