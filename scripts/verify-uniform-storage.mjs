/**
 * Real workerd/D1/KV (or --r2 legacy fallback) persistence verification.
 * No Cloudflare credentials, real account, real database or remote storage.
 * Run from the repository root: node scripts/verify-uniform-storage.mjs
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';

const root=resolve(import.meta.dirname,'..');
const state=await mkdtemp(join(tmpdir(),'physiproof-uniform-storage-'));
const provider=process.argv.includes('--r2')?'r2':'kv';
const output=await build({absWorkingDir:root,entryPoints:['packages/backend/src/index.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const options={modules:true,script:output.outputFiles[0].text,compatibilityDate:'2024-04-03',host:'127.0.0.1',port:0,
  d1Databases:{DB:'uniform-storage-verification'},d1Persist:join(state,'d1'),
  ...(provider==='kv'?{kvNamespaces:{UNIFORM_ASSETS_KV:'uniform-storage-verification'},kvPersist:join(state,'kv')}:
    {r2Buckets:{UNIFORM_ASSETS:'uniform-storage-verification'},r2Persist:join(state,'r2')}),
  log:new Log(LogLevel.ERROR),outboundService:()=>new Response('External requests are disabled in this fixture',{status:503})};
let runtime=new Miniflare(options);
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const fixtureId=randomUUID(),loginId='uniform-fixture-'+randomUUID(),password=randomUUID();
let adminToken;
const request=async(path,{method='GET',body,proof=true,identity=true}={})=>{
  const headers={'Content-Type':'application/json'};
  if(identity)headers.Authorization='Bearer test-token:'+fixtureId;
  if(proof)headers['X-Uniform-Admin-Token']=adminToken;
  return runtime.dispatchFetch('http://uniform-fixture.invalid/api'+path,{method,headers,body:body?JSON.stringify(body):undefined});
};
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;}return(n^0xffffffff)>>>0;}
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);b.set(data,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function makePng(){
  const width=32,height=32,head=Buffer.alloc(13),pixels=Buffer.alloc((width*4+1)*height);
  head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=6;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*(width*4+1)+1+x*4;pixels[p]=x%16<8?240:30;pixels[p+1]=140;pixels[p+2]=90;pixels[p+3]=255;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const png=makePng(),dataUrl='data:image/png;base64,'+png.toString('base64');
const drawing_source={format:'uniform-studio-drawing',version:1,document:{kind:'pattern',template:'pattern-body',name:'Synthetic persistence check',width:244,height:480,layers:[]}};
const payload={kind:'pattern',name:'Synthetic persistence check',category:'Verification',description:'Temporary local fixture only',
  status:'draft',sort_order:0,revision:0,png_data_url:dataUrl,thumbnail_data_url:dataUrl,color_mode:'original',placement:'body',scale:100,drawing_source};
try{
  const db=await runtime.getD1Database('DB');
  const migrations=join(root,'packages/backend/migrations');
  // D1 exec() splits on newlines and cannot apply multiline triggers. Use the
  // SQLite parser to identify complete statements, then D1's prepared API.
  const parser=new DatabaseSync(':memory:');
  try {
    for(const name of (await readdir(migrations)).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort()){
      let sql='';
      for(const char of await readFile(join(migrations,name),'utf8')){
        sql+=char;if(char!==';')continue;
        let statement;
        try{statement=parser.prepare(sql);}catch(error){
          if(/incomplete input|unrecognized token|did not contain a statement/.test(error.message))continue;
          throw error;
        }
        try{statement.run();}catch(error){
          // A semicolon inside a leading SQL comment yields an empty native
          // statement; keep accumulating until the following real statement.
          if(error.code==='ERR_INVALID_STATE'&&/finalized/.test(error.message))continue;
          throw error;
        }
        await db.prepare(sql).run();sql='';
      }
      check(!sql.replace(/--[^\n]*/g,'').trim(),'Unterminated migration statement: '+name);
    }
  }finally{parser.close();}
  await db.prepare('INSERT INTO users(id,login_id,password_hash,name,role) VALUES(?,?,?,?,?)').bind(fixtureId,loginId,password,'Synthetic administrator','admin').run();
  let response=await request('/auth/login',{method:'POST',body:{loginId,password},proof:false,identity:false});
  check(response.status===200,'Fixture login should succeed');
  const login=await response.json();adminToken=login.uniformAdminToken;
  check(typeof adminToken==='string'&&adminToken.length===64,'Password login should issue administrator proof');
  check((await request('/admin/uniform-assets?kind=pattern',{proof:false})).status===403,'An admin UID alone must not authorize storage');
  const catalog=await(await request('/admin/uniform-assets?kind=pattern')).json();
  check(catalog.storage_ready===true&&catalog.storage.provider===provider,'Runtime must have an actual '+provider+' binding');
  response=await request('/admin/uniform-assets',{method:'POST',body:payload});
  const body=await response.json();
  check(response.status===201,'PNG upload failed: '+(body.error||response.status));
  const asset=body.asset;
  check(asset.revision===1&&asset.width===32,'PNG dimensions and version should be saved');
  check((await request('/uniform-assets/'+asset.id+'/versions/1/image/full',{proof:false,identity:false})).status===404,'Draft must not be publicly readable');
  response=await request('/admin/uniform-assets/'+asset.id+'/image/1/full');
  check(response.status===200,'Administrator should read the stored draft: '+(response.status===200?'OK':await response.clone().text()));
  check(Buffer.from(await response.arrayBuffer()).equals(png),provider+' should return exact PNG bytes');
  response=await request('/admin/uniform-assets/'+asset.id+'/source/1');
  check(JSON.stringify(await response.json())===JSON.stringify(drawing_source),provider+' should retain editable source');

  // Restart the runtime against the same on-disk storage, not a memory mock.
  await runtime.dispose();runtime=new Miniflare(options);
  response=await request('/admin/uniform-assets/'+asset.id+'/image/1/full');
  check(response.status===200&&Buffer.from(await response.arrayBuffer()).equals(png),'PNG and administrator session must survive restart');
  response=await request('/admin/uniform-assets/'+asset.id,{method:'PUT',body:{...payload,status:'published',revision:1}});
  check(response.status===200,'Publishing should append a version');
  response=await request('/uniform-assets/'+asset.id+'/versions/2/image/full',{proof:false,identity:false});
  check(response.status===200&&response.headers.get('Content-Type')==='image/png','Published version should be an image');
  check(Buffer.from(await response.arrayBuffer()).equals(png),'Published image should retain its bytes');
  response=await request('/admin/uniform-assets/'+asset.id,{method:'PUT',body:{...payload,status:'published',revision:1}});
  check(response.status===409,'Stale updates must conflict');
  check((await request('/admin/uniform-assets/'+asset.id+'/hide',{method:'POST'})).status===200,'Hiding should succeed');
  check((await request('/uniform-assets/'+asset.id+'/versions/2/image/full',{proof:false,identity:false})).status===200,'Hiding must not break previously published versions');
  check((await request('/uniform-assets/'+asset.id+'/versions/1/image/full',{proof:false,identity:false})).status===404,'Publishing must not expose the old draft');
  console.log(JSON.stringify({result:'passed',checks,runtime:'workerd with on-disk D1/'+provider,storage:state,externalRequests:false}));
}finally{await runtime.dispose();}
