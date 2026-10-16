// Vite-only synthetic fixture. Built production entry points do not include this.
// ALL /api requests stay in memory: never read or mutate local/production D1/KV/R2.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BUILTIN_UNIFORM_MODELS,createStudioUniform,createDefaultUniform,UNIFORM_STORAGE_BUDGET_BYTES,UNIFORM_DAILY_OBJECT_WRITE_BUDGET} from '@my-app/shared';
import UniformSection from '../src/components/UniformSection';
import AdminUniformAssets from '../src/components/AdminUniformAssets';
import '../src/index.css';

const assets=[...BUILTIN_UNIFORM_MODELS],versions=new Map(),images=new Map(),sources=new Map();
const requests=[];window.uniformQa={requests};
const nativeFetch=window.fetch.bind(window);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let uniformState={personal:{design:createStudioUniform({...createDefaultUniform(),jersey_name:'RUNNER',number:'24'}),revision:0},
  team:{id:'qa-team',name:'QA RUNNERS',design:createStudioUniform(),revision:0,can_edit:true,personalization:{jersey_name:'TEAM RUN',number:'7'},personalization_revision:0}};
const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#f1ef33';ctx.fillRect(0,0,200,200);ctx.fillStyle='#1a3187';ctx.fillRect(40,0,35,200);ctx.fillRect(130,0,35,200);
const samplePng=canvas.toDataURL('image/png');
const sample={id:'qa-pattern',kind:'pattern',name:'サンプル柄',category:'テスト',description:'合成素材',status:'published',sort_order:0,revision:1,builtin:false,width:200,height:200,color_mode:'original',placement:'body',scale:100,model_definition:null,image_path:'/api/uniform-assets/qa-pattern/versions/1/image/full',thumbnail_path:samplePng,drawing_available:false};
assets.push(sample);versions.set('qa-pattern/1',sample);images.set('qa-pattern/1',samplePng);
window.fetch=async(input,options={})=>{
  const url=new URL(String(input),location.origin);
  if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  const path=url.pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;
  requests.push({path,method});
  if(path==='/api/uniforms/templates')return json({templates:[],total:0,categories:[]});
  if(path==='/api/uniforms/me')return json({uniforms:uniformState});
  if(path==='/api/uniforms/personal'&&method==='PUT'){uniformState.personal={design:body.design,revision:body.revision+1};return json({revision:body.revision+1});}
  if(path==='/api/uniforms/team/qa-team'&&method==='PUT'){uniformState.team={...uniformState.team,design:body.design,revision:body.revision+1};return json({revision:body.revision+1});}
  if(path.endsWith('/personalization')&&method==='PUT')return json({revision:body.revision+1});
  if((path==='/api/uniform-assets'||path==='/api/admin/uniform-assets')&&method==='GET'){
    const admin=path.includes('/admin/'),kind=url.searchParams.get('kind')||'model',search=url.searchParams.get('search')||'';
    const list=assets.filter(a=>a.kind===kind&&(admin||a.status==='published')&&a.name.includes(search));return json({items:list,total:list.length,categories:[...new Set(list.map(a=>a.category))],storage_ready:true,
      storage:{provider:'kv',used_bytes:1024,capacity_bytes:UNIFORM_STORAGE_BUDGET_BYTES,writes_reserved_today:3,daily_object_write_budget:UNIFORM_DAILY_OBJECT_WRITE_BUDGET,retry_after_seconds:30}});
  }
  let match=path.match(/^\/api\/uniform-assets\/([^/]+)\/versions\/(\d+)$/);
  if(match){const asset=versions.get(match[1]+'/'+match[2])||assets.find(a=>a.id===match[1]&&String(a.revision)===match[2]);return asset?json({asset}):json({error:'not found'},404);}
  match=path.match(/^\/api\/uniform-assets\/([^/]+)\/versions\/(\d+)\/image\/(full|thumbnail)$/)||path.match(/^\/api\/admin\/uniform-assets\/([^/]+)\/image\/(\d+)\/(full|thumbnail)$/);
  if(match){const png=images.get(match[1]+'/'+match[2]);return png?nativeFetch(png):json({error:'not found'},404);}
  match=path.match(/^\/api\/admin\/uniform-assets\/([^/]+)\/source\/(\d+)$/);
  if(match)return json(sources.get(match[1]+'/'+match[2])||{error:'not found'});
  if(path.startsWith('/api/admin/uniform-assets')&&['POST','PUT'].includes(method)){
    if(path.endsWith('/hide')){const id=path.split('/').at(-2),a=assets.find(a=>a.id===id);if(a)a.status='hidden';return json({success:true});}
    const id=method==='POST'?'qa-'+crypto.randomUUID():path.split('/').at(-1),revision=body.revision+1;
    const a={...body,id,revision,builtin:false,width:body.kind==='model'?600:200,height:body.kind==='model'?640:200,model_definition:body.model_definition||null,drawing_available:!!body.drawing_source,color_mode:body.color_mode||'original',placement:body.placement||'all',scale:body.scale||100,
      image_path:body.kind==='model'?null:`/api/uniform-assets/${id}/versions/${revision}/image/full`,thumbnail_path:body.kind==='model'?null:`/api/uniform-assets/${id}/versions/${revision}/image/thumbnail`};
    delete a.png_data_url;delete a.thumbnail_data_url;delete a.drawing_source;
    const index=assets.findIndex(x=>x.id===id);if(index>=0)assets[index]=a;else assets.push(a);
    versions.set(id+'/'+revision,{...a});if(body.png_data_url)images.set(id+'/'+revision,body.png_data_url);if(body.drawing_source)sources.set(id+'/'+revision,body.drawing_source);
    return json({asset:a},method==='POST'?201:200);
  }
  return json({error:'QA fixture: route not handled'},404);
};
function App(){const [state,setState]=React.useState(uniformState);const admin=new URLSearchParams(location.search).has('admin');
  return <main style={{maxWidth:1100,margin:'24px auto',padding:16}}><h1>ユニフォーム工房 · 検証画面</h1><p>合成データのみ。本番には保存しません。</p><nav><a href="?">個人・チーム</a> · <a href="?admin=1">管理者素材ライブラリ</a></nav>
    {admin?<AdminUniformAssets/>:<UniformSection state={state} error="" onChange={setState} onReload={async()=>true}/>}</main>;
}
createRoot(document.getElementById('root')).render(<App/>);
