// Vite-only synthetic fixture. Built production entry points do not include this.
// ALL /api requests stay in memory: never read or mutate local/production D1/KV/R2.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BUILTIN_UNIFORM_MODELS,createStudioUniform,createDefaultUniform,UNIFORM_STORAGE_BUDGET_BYTES,UNIFORM_DAILY_OBJECT_WRITE_BUDGET,encodeRegionLabels,uniformRegionSummary} from '@my-app/shared';
import UniformSection from '../src/components/UniformSection';
import AdminUniformAssets from '../src/components/AdminUniformAssets';
import PreviewNotice from './PreviewNotice';
import '../src/index.css';

const assets=[...BUILTIN_UNIFORM_MODELS],versions=new Map(),images=new Map(),sources=new Map(),regionMaps=new Map();
const requests=[];window.uniformQa={requests};
const nativeFetch=window.fetch.bind(window);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let uniformState={personal:{design:createStudioUniform({...createDefaultUniform(),jersey_name:'RUNNER',number:'24'}),revision:0},
  team:{id:'qa-team',name:'QA RUNNERS',design:createStudioUniform(),revision:0,can_edit:true,personalization:{jersey_name:'TEAM RUN',number:'7'},personalization_revision:0}};
const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#f1ef33';ctx.fillRect(0,0,200,200);ctx.fillStyle='#1a3187';ctx.fillRect(40,0,35,200);ctx.fillRect(130,0,35,200);
const samplePng=canvas.toDataURL('image/png');
const sampleRegions={version:1,width:200,height:200,parts:[{id:'part-1',name:'左のライン',color:'#1a3187'},{id:'part-2',name:'右のライン',color:'#1a3187'},{id:'part-3',name:'背景',color:'#f1ef33'}],
  labels_base64:encodeRegionLabels(Uint8Array.from({length:40000},(_,i)=>i%200>=40&&i%200<75?1:i%200>=130&&i%200<165?2:3))};
const sample={id:'qa-pattern',kind:'pattern',name:'サンプル柄',category:'テスト',description:'合成素材',status:'published',sort_order:0,revision:1,builtin:false,width:200,height:200,color_mode:'original',placement:'body',scale:100,model_definition:null,image_path:'/api/uniform-assets/qa-pattern/versions/1/image/full',thumbnail_path:samplePng,drawing_available:false};
sample.color_regions=uniformRegionSummary(sampleRegions);regionMaps.set('qa-pattern/1',sampleRegions);
assets.push(sample);versions.set('qa-pattern/1',sample);images.set('qa-pattern/1',samplePng);
ctx.clearRect(0,0,200,200);ctx.fillStyle='#286b5b';ctx.beginPath();ctx.arc(100,100,88,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ef998d';ctx.beginPath();ctx.arc(65,100,20,0,Math.PI*2);ctx.arc(135,100,20,0,Math.PI*2);ctx.fill();
const emblemPixels=ctx.getImageData(0,0,200,200).data,emblemLabels=Uint8Array.from({length:40000},(_,i)=>!emblemPixels[i*4+3]?0:emblemPixels[i*4]>150?(i%200<100?1:2):3);
const emblemRegions={...sampleRegions,parts:[{id:'part-1',name:'左のマーク',color:'#ef998d'},{id:'part-2',name:'右のマーク',color:'#ef998d'},{id:'part-3',name:'外枠',color:'#286b5b'}],labels_base64:encodeRegionLabels(emblemLabels)};
const emblem={...sample,id:'qa-emblem',kind:'emblem',name:'部位別テストエンブレム',color_regions:uniformRegionSummary(emblemRegions),image_path:'/api/uniform-assets/qa-emblem/versions/1/image/full',thumbnail_path:canvas.toDataURL('image/png')};
assets.push(emblem);versions.set('qa-emblem/1',emblem);images.set('qa-emblem/1',emblem.thumbnail_path);regionMaps.set('qa-emblem/1',emblemRegions);
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
  let match=path.match(/^\/api\/uniform-assets\/([^/]+)\/versions\/(\d+)\/regions$/);
  if(match){const regions=regionMaps.get(match[1]+'/'+match[2]);return regions?json({regions}):json({error:'not found'},404);}
  match=path.match(/^\/api\/uniform-assets\/([^/]+)\/versions\/(\d+)$/);
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
    if(body.png_data_url){const img=new Image();img.src=body.png_data_url;await img.decode();a.width=img.naturalWidth;a.height=img.naturalHeight;}
    if(body.color_regions){regionMaps.set(id+'/'+revision,body.color_regions);a.color_regions=uniformRegionSummary(body.color_regions);}
    const index=assets.findIndex(x=>x.id===id);if(index>=0)assets[index]=a;else assets.push(a);
    versions.set(id+'/'+revision,{...a});if(body.png_data_url)images.set(id+'/'+revision,body.png_data_url);if(body.drawing_source)sources.set(id+'/'+revision,body.drawing_source);
    return json({asset:a},method==='POST'?201:200);
  }
  return json({error:'QA fixture: route not handled'},404);
};
function App(){const [state,setState]=React.useState(uniformState),[admin,setAdmin]=React.useState(new URLSearchParams(location.search).has('admin'));
  return <main style={{maxWidth:1100,margin:'24px auto',padding:16}}><PreviewNotice/><h1>ユニフォーム工房 · 部品単体テスト</h1><nav aria-label="部品単体テスト"><button type="button" onClick={()=>setAdmin(false)}>個人・チームの単体テスト</button> · <button type="button" onClick={()=>setAdmin(true)}>素材ライブラリの単体テスト</button></nav>
    {admin?<AdminUniformAssets/>:<UniformSection state={state} error="" onChange={setState} onReload={async()=>true}/>}</main>;
}
createRoot(document.getElementById('root')).render(<App/>);
