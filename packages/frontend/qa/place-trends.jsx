// All API operations below are memory-only. This is NOT sensor/device verification.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {runningTrendWindow} from '@my-app/shared';
import PlaceTrendsSection from '../src/components/PlaceTrendsSection';
import RunningPlaceAdmin from '../src/components/RunningPlaceAdmin';
import MeasuredStepsCard from '../src/components/MeasuredStepsCard';
import '../src/index.css';
import '../src/components/RunningTrendsSection.css';
let sharing=false,insufficient=false,fail=false;
const places=[{id:'imperial-palace-surroundings',name:'皇居外周・周辺エリア',description:'架空の表示例。公式コース境界・現在の混雑ではありません。',south:35.672,north:35.695,west:139.741,east:139.765,active:true}];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin);
  if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  if(fail)return json({error:'架空の通信エラー'},503);
  if(url.pathname==='/api/running/steps/me')return json({today_measured_steps:2400,today_eligible_steps:2100,total_measured_steps:12400,total_eligible_steps:11100,measured_runs:6});
  if(url.pathname==='/api/running/places/preferences'){if(options.method==='PUT')sharing=JSON.parse(options.body).sharing;return json({sharing});}
  if(url.pathname==='/api/running/places/trends'){
    const weeks=Number(url.searchParams.get('weeks')||4);
    return json({...runningTrendWindow(weeks),weeks,place:places[0],timezone:'Asia/Tokyo',method:'place_passages',sharing,min_participants:5,min_dates:3,
      cells:Array.from({length:84},(_,i)=>({weekday:Math.floor(i/12),slot:i%12,count:null,level:insufficient||i%12<3?'insufficient':['low','medium','high'][i%3]}))});
  }
  if(url.pathname==='/api/running/places')return json({places:places.filter(p=>p.active)});
  if(url.pathname.startsWith('/api/admin/running-places')){
    if(options.method==='POST'){const p=JSON.parse(options.body),id=crypto.randomUUID();places.push({...p,id});return json({success:true,id},201);}
    if(options.method==='PUT'){Object.assign(places.find(p=>p.id===url.pathname.split('/').pop()),JSON.parse(options.body));return json({success:true});}
    return json({places});
  }
  return json({error:'テスト画面ではこのAPIは実行しません。'},503);
};
function Fixture(){const [admin,setAdmin]=useState(false),[version,setVersion]=useState(0);return <div style={{padding:16,maxWidth:920,margin:'auto',color:'#fff'}}>
  <aside style={{padding:14,border:'2px solid #e9b341',background:'#30240d',marginBottom:16}}>テスト専用・架空データです。API保存はメモリー内だけで、実DB・実センサーには接続しません。歩数の数値も画面確認用です。</aside>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
    <button style={{minHeight:44}} onClick={()=>setAdmin(v=>!v)}>{admin?'利用者画面へ':'エリア管理へ'}</button>
    <button style={{minHeight:44}} onClick={()=>{insufficient=!insufficient;setVersion(n=>n+1);}}>不足データ切替</button>
    <button style={{minHeight:44}} onClick={()=>{fail=!fail;setVersion(n=>n+1);}}>通信エラー切替</button>
  </div>
  {admin?<RunningPlaceAdmin/>:<><PlaceTrendsSection key={version}/><div style={{marginTop:24}}><MeasuredStepsCard userId="fixture" tracking nativeAvailable live={{measured_steps:2400,eligible_steps:2100,source:'android_step_counter',state:'gps_inaccurate'}}/></div></>}
 </div>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
