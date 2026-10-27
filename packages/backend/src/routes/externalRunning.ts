import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {zValidator} from '@hono/zod-validator';
import type {D1Database} from '@cloudflare/workers-types';
import {externalRunningConsentSchema,externalRunningSnapshotSchema,externalRunningViewSchema,EXTERNAL_RUNNING_WINDOW_MS} from '@my-app/shared';
import {firebaseAuth} from '../middleware/auth';
type Env={Bindings:{DB:D1Database};Variables:{firebaseUser:{sub:string}}};
export const externalRunningRoutes=new Hono<Env>()
  .onError((error,c)=>c.json({error:error instanceof HTTPException&&error.status===400?'入力内容を確認してください。':'外部記録を保存できませんでした。時間を置いて再試行してください。'},error instanceof HTTPException&&error.status===400?400:500))
  .use('*',firebaseAuth)
  .use('*',async(c,next)=>{
    // Bound streamed bodies before the JSON validator. Older Hono body-limit loses
    // its overflow error when JSON parsing wraps it as a malformed-body exception.
    const reader=c.req.raw.body?.getReader();
    if(reader){
      const chunks:Uint8Array[]=[],limit=256*1024;let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>limit){void reader.cancel();return c.json({error:'一度に同期できる記録量を超えています。'},413);}chunks.push(value);}}
      catch{return c.json({error:'入力を読み込めませんでした。'},400);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      c.req.raw=new Request(c.req.raw,{body:bytes});
    }
    await next();
  })
  .get('/',async c=>{
    const user=c.get('firebaseUser').sub,db=c.env.DB;
    const state=await db.prepare('SELECT enabled,revision,synced_at_ms,window_start_ms,window_end_ms FROM external_running_links WHERE user_id=?').bind(user).first<{enabled:number;revision:number;synced_at_ms:number|null;window_start_ms:number|null;window_end_ms:number|null}>();
    const rows=await db.prepare(`SELECT r.source_id,r.record_id,r.started_at_ms,r.ended_at_ms,r.distance_m FROM external_running_records r
      JOIN external_running_links l ON l.user_id=r.user_id WHERE r.user_id=? AND l.enabled=1 AND r.started_at_ms>=? ORDER BY r.started_at_ms DESC LIMIT 500`)
      .bind(user,Date.now()-EXTERNAL_RUNNING_WINDOW_MS).all();
    return c.json(externalRunningViewSchema.parse({...state,enabled:!!state?.enabled,revision:state?.revision??0,synced_at_ms:state?.synced_at_ms??null,
      window_start_ms:state?.window_start_ms??null,window_end_ms:state?.window_end_ms??null,records:state?.enabled?rows.results:[]}));
  })
  .put('/consent',zValidator('json',externalRunningConsentSchema),async c=>{
    const user=c.get('firebaseUser').sub,p=c.req.valid('json'),db=c.env.DB,operation=crypto.randomUUID();
    const result=await db.batch([
      db.prepare(`INSERT INTO external_running_links(user_id,enabled,revision,operation_id) SELECT ?,?,1,? WHERE (?=0 OR EXISTS(SELECT 1 FROM external_running_links WHERE user_id=?))
        ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,revision=external_running_links.revision+1,operation_id=excluded.operation_id,
        synced_at_ms=NULL,window_start_ms=NULL,window_end_ms=NULL WHERE external_running_links.revision=?`)
        .bind(user,p.enabled?1:0,operation,p.revision,user,p.revision),
      db.prepare(`DELETE FROM external_running_records WHERE user_id=? AND EXISTS(SELECT 1 FROM external_running_links WHERE user_id=? AND operation_id=?)`).bind(user,user,operation),
    ]);
    return result[0].meta.changes?c.json({success:true,revision:p.revision+1}):c.json({error:'設定が別画面で更新されています。再読み込みしてください。'},409);
  })
  .put('/sync',zValidator('json',externalRunningSnapshotSchema),async c=>{
    const user=c.get('firebaseUser').sub,p=c.req.valid('json'),db=c.env.DB,now=Date.now(),operation=crypto.randomUUID();
    if(Math.abs(now-p.window_end_ms)>5*60*1000)return c.json({error:'取り込みが古くなりました。端末の時刻・権限を確認し、再同期してください。'},400);
    const result=await db.batch([
      db.prepare(`UPDATE external_running_links SET revision=revision+1,operation_id=?,synced_at_ms=?,window_start_ms=?,window_end_ms=? WHERE user_id=? AND enabled=1 AND revision=?`)
        .bind(operation,now,p.window_start_ms,p.window_end_ms,user,p.revision),
      db.prepare(`DELETE FROM external_running_records WHERE user_id=? AND EXISTS(SELECT 1 FROM external_running_links WHERE user_id=? AND operation_id=?)`).bind(user,user,operation),
      db.prepare(`INSERT INTO external_running_records(user_id,source_id,record_id,started_at_ms,ended_at_ms,distance_m)
        SELECT ?,json_extract(value,'$.source_id'),json_extract(value,'$.record_id'),json_extract(value,'$.started_at_ms'),json_extract(value,'$.ended_at_ms'),json_extract(value,'$.distance_m')
        FROM json_each(?) WHERE EXISTS(SELECT 1 FROM external_running_links WHERE user_id=? AND operation_id=? AND enabled=1)`)
        .bind(user,JSON.stringify(p.records),user,operation),
    ]);
    return result[0].meta.changes?c.json({success:true,revision:p.revision+1}):c.json({error:'連携が解除されたか、別画面で更新されています。再読み込みしてください。'},409);
  });
