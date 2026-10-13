import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { bodyLimit } from 'hono/body-limit';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { uniformAssetQuerySchema, adminUniformAssetQuerySchema, saveUniformAssetSchema,
  uniformAssetSchema, BUILTIN_UNIFORM_MODELS } from '@my-app/shared';
import type { UniformAsset, SaveUniformAsset } from '@my-app/shared';
import { firebaseAuth } from '../middleware/auth';
import { assetVersion, validateUniformPng, storageObject, UniformAssetError } from '../services/uniformAssetStorage';
import {verifyUniformAdminSession} from '../services/uniformAdminSession';

type Env = { Bindings:{DB:D1Database;UNIFORM_ASSETS?:R2Bucket};Variables:{firebaseUser:{sub:string}} };
const validation = (result:{success:boolean},c:{json:(value:{error:string},status:400)=>Response}) => !result.success ? c.json({error:'素材の入力内容を確認してください。'},400) : undefined;
const handleError = (e:unknown) => e instanceof UniformAssetError ? e : new UniformAssetError('素材の読み込み・保存に失敗しました。',503);

async function list(db:D1Database,q:{kind:string;search:string;category:string;page:string;limit:string;status?:string},admin:boolean,ready:boolean) {
  const builtin = BUILTIN_UNIFORM_MODELS.filter(a => a.kind===q.kind && (!q.search || (a.name+a.description).toLowerCase().includes(q.search.toLowerCase()))
    && (!q.category || a.category===q.category) && (!admin || q.status==='all' || q.status==='published'));
  const conditions = ['a.kind=?'], args:(string|number)[]=[q.kind];
  if (!admin || q.status!=='all') { conditions.push('a.status=?'); args.push(admin?q.status!:'published'); }
  if (q.search) { conditions.push('(instr(lower(a.name),lower(?))>0 OR instr(lower(a.description),lower(?))>0)'); args.push(q.search,q.search); }
  if (q.category) { conditions.push('a.category=?'); args.push(q.category); }
  const where=conditions.join(' AND '), limit=Number(q.limit), offset=(Number(q.page)-1)*limit;
  const leading=builtin.slice(offset,offset+limit), dbOffset=Math.max(0,offset-builtin.length), remaining=limit-leading.length;
  const count=await db.prepare(`SELECT COUNT(*) AS n FROM uniform_assets a WHERE ${where}`).bind(...args).first<{n:number}>();
  const rows=remaining?await db.prepare(`SELECT v.metadata_json,a.status FROM uniform_assets a JOIN uniform_asset_versions v ON v.asset_id=a.id AND v.revision=a.revision WHERE ${where} ORDER BY a.sort_order,a.name,a.id LIMIT ? OFFSET ?`).bind(...args,remaining,dbOffset).all<{metadata_json:string;status:string}>():{results:[]};
  const categories=await db.prepare(`SELECT DISTINCT category FROM uniform_assets WHERE kind=? ${admin?'':"AND status='published'"} ORDER BY category`).bind(q.kind).all<{category:string}>();
  return {items:[...leading,...rows.results.map(r=>uniformAssetSchema.parse({...JSON.parse(r.metadata_json),status:r.status}))],
    total:(count?.n??0)+builtin.length,categories:[...new Set([...builtin.map(a=>a.category),...categories.results.map(r=>r.category)])],storage_ready:ready};
}

export const uniformAssetRoutes=new Hono<Env>()
  .get('/:id/versions/:revision/image/:size',async c=>{
    try {
      const size=c.req.param('size');if(!['full','thumbnail'].includes(size))return c.json({error:'画像が見つかりません。'},404);
      const version=await assetVersion(c.env.DB,{id:c.req.param('id'),revision:Number(c.req.param('revision'))});
      if(!version?.row || version.asset.status!=='published')return c.json({error:'画像が見つかりません。'},404);
      return await storageObject(c.env.UNIFORM_ASSETS,size==='full'?version.row.image_key:version.row.thumbnail_key,'image/png');
    }catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .use('*',firebaseAuth)
  .get('/',zValidator('query',uniformAssetQuerySchema,validation),async c=>{
    try{return c.json(await list(c.env.DB,c.req.valid('query'),false,!!c.env.UNIFORM_ASSETS));}
    catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .get('/:id/versions/:revision',async c=>{
    try {
      const version=await assetVersion(c.env.DB,{id:c.req.param('id'),revision:Number(c.req.param('revision'))});
      if(!version || (version.asset.status!=='published' && !await verifyUniformAdminSession(c.env.DB,c.get('firebaseUser').sub,c.req.header('X-Uniform-Admin-Token'))))return c.json({error:'素材が見つかりません。'},404);
      return c.json({asset:version.asset});
    }catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  });

export const adminUniformAssetRoutes=new Hono<Env>()
  .use('*',firebaseAuth)
  .use('*',async(c,next)=>{if(!await verifyUniformAdminSession(c.env.DB,c.get('firebaseUser').sub,c.req.header('X-Uniform-Admin-Token')))return c.json({error:'管理者として再ログインしてください。素材操作には有効な管理者セッションが必要です。'},403);await next();})
  .use('*',bodyLimit({maxSize:10*1024*1024,onError:c=>c.json({error:'アップロードは10MB以内です。'},413)}))
  .get('/',zValidator('query',adminUniformAssetQuerySchema,validation),async c=>{
    try{return c.json(await list(c.env.DB,c.req.valid('query'),true,!!c.env.UNIFORM_ASSETS));}
    catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .get('/:id/source/:revision',async c=>{
    try {const version=await assetVersion(c.env.DB,{id:c.req.param('id'),revision:Number(c.req.param('revision'))});
      if(!version?.row?.source_key)return c.json({error:'図形原稿がありません。'},404);
      return await storageObject(c.env.UNIFORM_ASSETS,version.row.source_key,'application/json');
    }catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .get('/:id/image/:revision/:size',async c=>{
    try {const version=await assetVersion(c.env.DB,{id:c.req.param('id'),revision:Number(c.req.param('revision'))});
      if(!version?.row)return c.json({error:'画像がありません。'},404);
      if(!['full','thumbnail'].includes(c.req.param('size')))return c.json({error:'画像がありません。'},404);
      const response=await storageObject(c.env.UNIFORM_ASSETS,c.req.param('size')==='full'?version.row.image_key:version.row.thumbnail_key,'image/png');
      response.headers.set('Cache-Control','private, no-store');return response;
    }catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .post('/',zValidator('json',saveUniformAssetSchema,validation),async c=>{
    const data=c.req.valid('json');if(data.revision!==0)return c.json({error:'新規素材のリビジョンが不正です。'},400);
    try{return c.json({asset:await save(c.env.DB,c.env.UNIFORM_ASSETS,c.get('firebaseUser').sub,crypto.randomUUID(),data)},201);}
    catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .put('/:id',zValidator('json',saveUniformAssetSchema,validation),async c=>{
    try{return c.json({asset:await save(c.env.DB,c.env.UNIFORM_ASSETS,c.get('firebaseUser').sub,c.req.param('id'),c.req.valid('json'))});}
    catch(e){const err=handleError(e);return c.json({error:err.message},err.status);}
  })
  .post('/:id/hide',async c=>{
    const res=await c.env.DB.prepare("UPDATE uniform_assets SET status='hidden',updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin')")
      .bind(c.req.param('id'),c.get('firebaseUser').sub).run();
    return res.meta.changes?c.json({success:true}):c.json({error:'素材が見つかりません。'},404);
  });

async function save(db:D1Database,bucket:R2Bucket|undefined,userId:string,id:string,data:SaveUniformAsset):Promise<UniformAsset> {
  if(!/^[a-f0-9-]{36}$/.test(id))throw new UniformAssetError('追加素材のIDが不正です。');
  const current=await db.prepare('SELECT kind,revision FROM uniform_assets WHERE id=?').bind(id).first<{kind:string;revision:number}>();
  if(current ? current.revision!==data.revision || current.kind!==data.kind : data.revision!==0)throw new UniformAssetError('別の画面で変更されています。最新の素材を読み直してください。',409);
  const usage=await db.prepare("SELECT COALESCE(SUM(byte_size),0) AS bytes,SUM(CASE WHEN created_at>=date('now') THEN 1 ELSE 0 END) AS today FROM uniform_asset_versions").first<{bytes:number;today:number}>();
  if((usage?.today??0)>=300)throw new UniformAssetError('1日の素材更新上限に達しました。翌日に再試行してください。',413);
  if(data.kind!=='model' && (usage?.bytes??0)>1024*1024*1024-7*1024*1024)throw new UniformAssetError('素材保存量の安全上限（1GB）に達しました。管理者へ連絡してください。',413);
  const prefix=`uniform-assets/${id}/${crypto.randomUUID()}`, revision=data.revision+1;
  const keys:{image:string|null;thumbnail:string|null;source:string|null}={image:null,thumbnail:null,source:null};
  let width=600,height=640,bytes=0;
  const uploaded:string[]=[];
  try {
    if(data.kind!=='model'){
      if(!bucket)throw new UniformAssetError('R2保存先が未設定です。モデル定義は登録できますが、画像素材の登録にはR2接続が必要です。',503);
      const image=await validateUniformPng(data.png_data_url,data.kind==='emblem'?1024:2048),thumb=await validateUniformPng(data.thumbnail_data_url,256,true);
      width=image.width;height=image.height;bytes=image.bytes.length+thumb.bytes.length;
      keys.image=prefix+'/image.png';keys.thumbnail=prefix+'/thumbnail.png';
      await bucket.put(keys.image,image.bytes,{httpMetadata:{contentType:'image/png'}});uploaded.push(keys.image);
      await bucket.put(keys.thumbnail,thumb.bytes,{httpMetadata:{contentType:'image/png'}});uploaded.push(keys.thumbnail);
      if(data.drawing_source){keys.source=prefix+'/source.json';const text=JSON.stringify(data.drawing_source);bytes+=new TextEncoder().encode(text).length;
        await bucket.put(keys.source,text,{httpMetadata:{contentType:'application/json'}});uploaded.push(keys.source);}
    }
    const asset:UniformAsset={id,kind:data.kind,name:data.name,category:data.category,description:data.description,status:data.status,sort_order:data.sort_order,revision,builtin:false,width,height,
      color_mode:data.kind==='model'?'original':data.color_mode,placement:data.kind==='model'?'all':data.placement,scale:data.kind==='model'?100:data.scale,
      model_definition:data.kind==='model'?data.model_definition:null,
      image_path:keys.image?`/api/uniform-assets/${id}/versions/${revision}/image/full`:null,
      thumbnail_path:keys.thumbnail?`/api/uniform-assets/${id}/versions/${revision}/image/thumbnail`:null,drawing_available:!!keys.source};
    const role="EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin')";
    const results=await db.batch([
      db.prepare(`INSERT INTO uniform_assets(id,kind,name,category,description,status,sort_order,revision) SELECT ?,?,?,?,?,?,?,0 WHERE ?=0 AND ${role} ON CONFLICT(id) DO NOTHING`)
        .bind(id,data.kind,data.name,data.category,data.description,data.status,data.sort_order,data.revision,userId),
      db.prepare(`INSERT INTO uniform_asset_versions(asset_id,revision,metadata_json,image_key,thumbnail_key,source_key,byte_size) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM uniform_assets WHERE id=? AND revision=? AND kind=?) AND ${role}`)
        .bind(id,revision,JSON.stringify(asset),keys.image,keys.thumbnail,keys.source,bytes,id,data.revision,data.kind,userId),
      db.prepare(`UPDATE uniform_assets SET name=?,category=?,description=?,status=?,sort_order=?,revision=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND ${role}`)
        .bind(data.name,data.category,data.description,data.status,data.sort_order,revision,id,data.revision,userId),
    ]);
    if(!results[1].meta.changes || !results[2].meta.changes)throw new UniformAssetError('別の画面で変更されています。最新の素材を読み直してください。',409);
    return asset;
  }catch(e){for(const key of uploaded){try{await bucket!.delete(key);}catch{/* retain harmless orphan; never delete a saved version */}}throw e;}
}
