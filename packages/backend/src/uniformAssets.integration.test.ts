import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {Hono} from 'hono';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import {BUILTIN_UNIFORM_MODELS,createStudioUniform,createDefaultUniform,saveUniformAssetSchema,uniformDesignSchema,uniformModelDefinitionSchema} from '@my-app/shared';
import {uniformAssetRoutes,adminUniformAssetRoutes} from './routes/uniformAssets';
import {uniformRoutes} from './routes/uniforms';
import {issueUniformAdminSession,verifyUniformAdminSession} from './services/uniformAdminSession';
import {validateUniformPng} from './services/uniformAssetStorage';

type NativeDB={exec:(sql:string)=>void;prepare:(sql:string)=>{get:(...v:unknown[])=>Record<string,unknown>|undefined;all:(...v:unknown[])=>Record<string,unknown>[];run:(...v:unknown[])=>{changes:number}};close:()=>void};
let SQLite:(new(path:string)=>NativeDB)|undefined;
try{SQLite=createRequire(import.meta.url)('node:sqlite').DatabaseSync;}catch{}
class Statement{
  constructor(readonly db:MemoryDB,readonly sql:string,readonly values:unknown[]=[]){}
  bind(...values:unknown[]){return new Statement(this.db,this.sql,values);}
  async first<T>(){return this.db.native.prepare(this.sql).get(...this.values) as T||null;}
  async all<T>(){return {success:true,results:this.db.native.prepare(this.sql).all(...this.values) as T[],meta:{changes:0}};}
  execute(){return {success:true,results:[],meta:this.db.native.prepare(this.sql).run(...this.values)};}
  async run(){return this.execute();}
}
class MemoryDB{
  constructor(readonly native:NativeDB){}
  prepare(sql:string){return new Statement(this,sql);}
  async batch(statements:Statement[]){this.native.exec('BEGIN');try{const results=statements.map(s=>s.execute());this.native.exec('COMMIT');return results;}catch(e){this.native.exec('ROLLBACK');throw e;}}
}
class MemoryBucket{
  objects=new Map<string,Uint8Array>();failAt=0;puts=0;
  async put(key:string,data:Uint8Array|string){if(++this.puts===this.failAt)throw new Error('synthetic storage failure');this.objects.set(key,typeof data==='string'?new TextEncoder().encode(data):data);}
  async get(key:string){const b=this.objects.get(key);return b?{body:new Blob([new Uint8Array(b).buffer]).stream()}:null;}
  async delete(key:string){this.objects.delete(key);}
}
function crc(bytes:Uint8Array){let value=0xffffffff;for(const b of bytes){value^=b;for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;}return(value^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);b.set(data,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function png(width=2,height=2,raw?:Uint8Array){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw||Buffer.alloc((width*4+1)*height))),chunk('IEND',Buffer.alloc(0))]).toString('base64');}
const model=BUILTIN_UNIFORM_MODELS[0].model_definition!;
const metadata={name:'fixture-model',category:'fixture',description:'synthetic only',status:'published' as const,sort_order:0,revision:0};
const modelPayload={...metadata,kind:'model' as const,model_definition:model};
const imagePayload={...metadata,kind:'pattern' as const,png_data_url:png(),thumbnail_data_url:png(),color_mode:'original' as const,placement:'body' as const,scale:100};
let native:NativeDB,db:MemoryDB,bucket:MemoryBucket,token:string;
const app=new Hono<{Bindings:{DB:D1Database;UNIFORM_ASSETS?:R2Bucket}}>().route('/api/uniform-assets',uniformAssetRoutes).route('/api/admin/uniform-assets',adminUniformAssetRoutes).route('/api/uniforms',uniformRoutes);
async function request(path:string,method='GET',body?:unknown,uid:string|null='admin',withToken=true,storage=true){
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(uid)headers.Authorization='Bearer test-token:'+uid;
  if(withToken)headers['X-Uniform-Admin-Token']=token;
  return app.request(path,{method,headers,body:body?JSON.stringify(body):undefined},{DB:db as unknown as D1Database,UNIFORM_ASSETS:storage?bucket as unknown as R2Bucket:undefined});
}
async function create(payload:unknown=modelPayload){const res=await request('/api/admin/uniform-assets','POST',payload);expect(res.status).toBe(201);return(await res.json()).asset;}
(SQLite?describe:describe.skip)('uniform component storage with real migrations and transactions',()=>{
  beforeEach(async()=>{
    native=new SQLite!(':memory:');native.exec('PRAGMA foreign_keys=ON');
    const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
    for(const file of readdirSync(dir).filter(f=>/^\d{4}.*\.sql$/.test(f)&&Number(f.slice(0,4))<=34).sort())native.exec(readFileSync(dir+'/'+file,'utf8'));
    native.exec("INSERT INTO users(id,login_id,password_hash,name,role) VALUES('admin','fixture-admin','fixture-password','Admin','admin'),('user','fixture-user','fixture-password','User','user'),('leader','fixture-leader','fixture-password','Leader','user'); INSERT INTO teams(id,name,owner_id) VALUES('team','fixture team','leader'); UPDATE users SET team_id='team' WHERE id IN ('leader','user')");
    db=new MemoryDB(native);bucket=new MemoryBucket();token=await issueUniformAdminSession(db as unknown as D1Database,'admin');
  });
  afterEach(()=>native.close());
  it('applies additive migration without modifying legacy JSON',async()=>{
    const design=createDefaultUniform();native.prepare('INSERT INTO user_uniforms(user_id,design_json,revision) VALUES(?,?,?)').run('user',JSON.stringify(design),8);
    const res=await request('/api/uniforms/me','GET',undefined,'user');const result=await res.json();expect(result.uniforms.personal).toEqual({design,revision:8});
  });
  it('requires password-issued proof even if an admin UID is forged',async()=>{
    expect((await request('/api/admin/uniform-assets','POST',modelPayload,'admin',false)).status).toBe(403);
    expect((await request('/api/admin/uniform-assets','GET',undefined,'user')).status).toBe(403);
    expect((await request('/api/admin/uniform-assets','GET',undefined,null)).status).toBe(401);
  });
  it('expires and rotates admin proof and rejects revoked roles',async()=>{
    expect(await verifyUniformAdminSession(db as unknown as D1Database,'admin',token)).toBe(true);
    native.exec("UPDATE uniform_admin_sessions SET expires_at=datetime('now','-1 second')");
    expect((await request('/api/admin/uniform-assets')).status).toBe(403);
    token=await issueUniformAdminSession(db as unknown as D1Database,'admin');
    native.exec("UPDATE users SET role='user' WHERE id='admin'");
    expect((await request('/api/admin/uniform-assets')).status).toBe(403);
  });
  it('registers models without R2, and publishes paginated metadata only',async()=>{
    const res=await request('/api/admin/uniform-assets','POST',modelPayload,'admin',true,false);expect(res.status).toBe(201);
    const list=await(await request('/api/uniform-assets?kind=model&limit=12&page=1','GET',undefined,'user')).json();
    expect(list.total).toBe(4);expect(list.items[3].name).toBe(metadata.name);expect(JSON.stringify(list)).not.toContain('base64');
  });
  it('keeps append-only versions and returns conflicts for stale edits',async()=>{
    const a=await create();
    expect((await request('/api/admin/uniform-assets/'+a.id,'PUT',{...modelPayload,revision:1,name:'Updated'})).status).toBe(200);
    expect((await request('/api/admin/uniform-assets/'+a.id,'PUT',{...modelPayload,revision:1,name:'Stale'})).status).toBe(409);
    const old=await(await request('/api/uniform-assets/'+a.id+'/versions/1','GET',undefined,'user')).json();
    expect(old.asset.name).toBe(metadata.name);
    expect(()=>native.exec("UPDATE uniform_asset_versions SET metadata_json='{}'")).toThrow(/immutable/);
    expect(()=>native.exec('DELETE FROM uniform_asset_versions')).toThrow(/retained/);
  });
  it('hides from new selections without breaking existing pinned references',async()=>{
    const a=await create(imagePayload);await request('/api/admin/uniform-assets/'+a.id+'/hide','POST');
    const list=await(await request('/api/uniform-assets?kind=pattern','GET',undefined,'user')).json();expect(list.total).toBe(0);
    const admin=await(await request('/api/admin/uniform-assets?kind=pattern')).json();expect(admin.items[0].status).toBe('hidden');
    expect((await request('/api/uniform-assets/'+a.id+'/versions/1/image/full','GET',undefined,null,false)).status).toBe(200);
    const design={...createStudioUniform(),front_pattern:{id:a.id,revision:1}};
    expect((await request('/api/uniforms/personal','PUT',{design,revision:0},'user')).status).toBe(200);
  });
  it('private draft cannot leak via metadata/image or become a user uniform',async()=>{
    const a=await create({...imagePayload,status:'draft'});
    expect((await request('/api/uniform-assets/'+a.id+'/versions/1','GET',undefined,'user')).status).toBe(404);
    expect((await request('/api/uniform-assets/'+a.id+'/versions/1/image/full','GET',undefined,null,false)).status).toBe(404);
    expect((await request('/api/uniform-assets/'+a.id+'/versions/1','GET',undefined,'admin',false)).status).toBe(404);
    expect((await request('/api/uniforms/personal','PUT',{design:{...createStudioUniform(),front_pattern:{id:a.id,revision:1}},revision:0},'user')).status).toBe(400);
  });
  it('publishing a draft creates a new revision without making old drafts public',async()=>{
    const a=await create({...imagePayload,status:'draft'});
    await request('/api/admin/uniform-assets/'+a.id,'PUT',{...imagePayload,revision:1});
    expect((await request('/api/uniform-assets/'+a.id+'/versions/1','GET',undefined,'user')).status).toBe(404);
    expect((await request('/api/uniform-assets/'+a.id+'/versions/2','GET',undefined,'user')).status).toBe(200);
  });
  it('validates missing refs and kind mismatches before saving a uniform',async()=>{
    const a=await create();
    for(const ref of [{id:'missing',revision:1},{id:a.id,revision:1},{id:a.id,revision:999}])
      expect((await request('/api/uniforms/personal','PUT',{design:{...createStudioUniform(),front_pattern:ref},revision:0},'user')).status).toBe(400);
    expect(native.prepare("SELECT COUNT(*) AS n FROM user_uniforms WHERE user_id='user'").get()!.n).toBe(0);
  });
  it('keeps leader-only team editing and each member own lettering',async()=>{
    const design=createStudioUniform();
    expect((await request('/api/uniforms/team/team','PUT',{design,revision:0},'user')).status).toBe(403);
    expect((await request('/api/uniforms/team/team','PUT',{design,revision:0},'leader')).status).toBe(200);
    expect((await request('/api/uniforms/team/team/personalization','PUT',{personalization:{jersey_name:'Me',number:'9'},revision:0},'user')).status).toBe(200);
    const result=await(await request('/api/uniforms/me','GET',undefined,'user')).json();expect(result.uniforms.team.design.version).toBe(2);expect(result.uniforms.team.personalization.number).toBe('9');
  });
  it('keeps editable drawing source private and persists it across immutable versions',async()=>{
    const drawing_source={format:'uniform-studio-drawing',version:1,document:{kind:'pattern',template:'pattern-body',name:'Fixture',width:244,height:480,layers:[]}};
    const a=await create({...imagePayload,drawing_source});
    expect((await request('/api/admin/uniform-assets/'+a.id+'/source/1','GET',undefined,'user')).status).toBe(403);
    const source=await request('/api/admin/uniform-assets/'+a.id+'/source/1');
    expect(source.headers.get('Cache-Control')).toBe('private, no-store');expect(await source.json()).toEqual(drawing_source);
    expect((await request('/api/admin/uniform-assets/'+a.id,'PUT',{...imagePayload,drawing_source,revision:1})).status).toBe(200);
    expect(await(await request('/api/admin/uniform-assets/'+a.id+'/source/1')).json()).toEqual(drawing_source);
  });
  it('handles concurrent updates without replacing or deleting the winning version',async()=>{
    const a=await create(imagePayload);
    const results=await Promise.all([request('/api/admin/uniform-assets/'+a.id,'PUT',{...imagePayload,revision:1,name:'First'}),request('/api/admin/uniform-assets/'+a.id,'PUT',{...imagePayload,revision:1,name:'Second'})]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(bucket.objects.size).toBe(4);
    expect(native.prepare('SELECT COUNT(*) AS n FROM uniform_asset_versions WHERE asset_id=?').get(a.id)!.n).toBe(2);
    expect((await request('/api/uniform-assets/'+a.id+'/versions/2/image/full','GET',undefined,null,false)).status).toBe(200);
  });
  it('does not write DB on unavailable/failed storage and cleans only its own uploads',async()=>{
    expect((await request('/api/admin/uniform-assets','POST',imagePayload,'admin',true,false)).status).toBe(503);
    bucket.objects.set('existing.png',new Uint8Array([1]));bucket.failAt=2;
    expect((await request('/api/admin/uniform-assets','POST',imagePayload)).status).toBe(503);
    expect([...bucket.objects.keys()]).toEqual(['existing.png']);
    expect(native.prepare('SELECT COUNT(*) AS n FROM uniform_assets').get()!.n).toBe(0);
  });
  it('rejects malicious uploads and unknown body properties before any R2 writes',async()=>{
    for(const payload of [{...imagePayload,png_data_url:'data:image/svg+xml;base64,PHN2Zz4='},{...modelPayload,admin:true}])
      expect((await request('/api/admin/uniform-assets','POST',payload)).status).toBe(400);
    expect(bucket.puts).toBe(0);
  });
});
describe('studio contract and PNG storage boundary',()=>{
  it('accepts all built-in models and both supported saved versions',()=>{
    for(const a of BUILTIN_UNIFORM_MODELS)expect(uniformModelDefinitionSchema.safeParse(a.model_definition).success).toBe(true);
    expect(uniformDesignSchema.safeParse(createStudioUniform()).success).toBe(true);expect(uniformDesignSchema.safeParse(createDefaultUniform()).success).toBe(true);
  });
  it.each(['M0 0" onload="alert(1)','url(https://external.invalid)','<script>','javascript:alert(1)'])('rejects markup in custom geometry: %s',path=>{
    expect(uniformModelDefinitionSchema.safeParse({...model,front:{...model.front,outer:path}}).success).toBe(false);
  });
  it('rejects unversioned/custom keys and oversized metadata',()=>{
    expect(uniformDesignSchema.safeParse({...createStudioUniform(),model:{id:'custom'}}).success).toBe(false);
    expect(saveUniformAssetSchema.safeParse({...modelPayload,name:'a'.repeat(61)}).success).toBe(false);
  });
  it('validates a real PNG stream and rejects CRC, suffix, size and decompression bombs',async()=>{
    expect(await validateUniformPng(png(),2048)).toMatchObject({width:2,height:2});
    const data=Buffer.from(png().slice(22),'base64');data[40]^=1;
    await expect(validateUniformPng('data:image/png;base64,'+data.toString('base64'),2048)).rejects.toThrow();
    await expect(validateUniformPng(png()+'AAAA',2048)).rejects.toThrow();
    await expect(validateUniformPng(png(3,3),2)).rejects.toThrow();
    await expect(validateUniformPng(png(1,1,Buffer.alloc(100000)),2048)).rejects.toThrow();
    await expect(validateUniformPng(png(1,1,Buffer.from([5,0,0,0,0])),2048)).rejects.toThrow();
  });
});
