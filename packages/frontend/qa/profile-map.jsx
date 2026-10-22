// Vite-only, memory-only UI fixture. All /api calls are intercepted here.
// Never signs in, sends credentials, or mutates local/production D1 records.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProfileTerritoryMap} from '../src/components/ProfileTerritoryMap';
import {ProfileModal} from '../src/components/ProfileModal';
import {MapView} from '../src/components/MapViewSection';
import '../src/index.css';
let denied=false;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const nativeFetch=window.fetch.bind(window);
const territories=[['owner','自分',35.68,139.76,'20'],['friend','フレンド',35.682,139.763,'10'],['other','その他の人',35.678,139.757,'30']].map(([id,name,lat,lng,band])=>({id,user_id:id,user_name:name,age_band:band,team_id:null,latitude:lat,longitude:lng,area_polygon:JSON.stringify([[lat,lng],[lat+.001,lng],[lat+.001,lng+.001],[lat,lng+.001]]),geometry_json:null,area_sqm:10000,time_period:'morning',captured_at:'2026-10-22T00:00:00Z',address:'架空の表示用エリア'}));
window.fetch=async(input,options={})=>{
  const url=new URL(String(input),location.origin);
  if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  if(url.pathname.includes('/territory-map')){
    if(denied)return json({error:'このプロフィールマップは非公開、またはフレンド限定です。'},403);
    const mode=url.searchParams.get('mode')||'current';
    return json({owner:{id:'owner',name:'テスト用ランナー'},mode,territories:territories.slice(0,mode==='history'?2:1).map(t=>({...t,source:mode==='history'?'legacy_snapshot':'current'})),next_before:null});
  }
  if(url.pathname==='/api/territories')return json({territories:url.searchParams.get('scope')==='friends'?territories.slice(0,2):territories});
  if(url.pathname.includes('achievements'))return json({achievements:[]});
  if(url.pathname.includes('battles'))return json({battles:[]});
  return json({error:'テスト画面ではこの操作は実行しません'},503);
};
function Fixture(){
 const [modal,setModal]=useState(''),[saved,setSaved]=useState('');
 const [mode,setMode]=useState('personal'),[route,setRoute]=useState([]),[pos,setPos]=useState(null),[distance,setDistance]=useState(0),[elapsed,setElapsed]=useState(0),[heading,setHeading]=useState(null),[speed,setSpeed]=useState(0),[tracking,setTracking]=useState(false),[start,setStart]=useState(null);
 return <div style={{padding:16,maxWidth:900,margin:'auto',color:'#fff'}}>
  <aside style={{padding:14,background:'#38290e',border:'2px solid #f6be4a',marginBottom:14}}>テスト専用・架空データです。通常のユーザー画面ではありません。保存はこの画面のメモリ内のみで、本番・ローカルの実DBには接続しません。</aside>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>{[['settings','年齢・公開範囲の設定'],['self','自分の領域マップ'],['friend','フレンドのマップ'],['private','非公開の表示例']].map(([id,title])=><button key={id} style={{padding:12,minHeight:44}} onClick={()=>{denied=id==='private';setModal(id);}}>{title}</button>)}</div>
  {saved&&<p role="status">{saved}</p>}
  {modal==='settings'&&<ProfileModal currentUser={{name:'テスト用ランナー',avatar_id:'default',login_id:'fixture',age:21,territory_map_visibility:'private'}} onClose={()=>setModal('')} onSave={(_n,_a,_i,_l,_p,age,visibility)=>{setSaved(`メモリ内だけで確認：年齢 ${age} / 公開範囲 ${visibility}`);setModal('');}}/>}
  {['self','friend','private'].includes(modal)&&<ProfileTerritoryMap ownerId="owner" isOwn={modal==='self'} onClose={()=>setModal('')}/>}
  <MapView currentUser={{uid:'owner',name:'テスト用ランナー',avatar_id:'default'}} activityMode={mode} setActivityMode={setMode} runningSessionId={null} runningBattleId={null} startOnlineRun={async()=>null} onClearRunningSession={()=>{}} onRunSaved={()=>{}} isTracking={tracking} setIsTracking={setTracking} route={route} setRoute={setRoute} currentDistance={distance} setCurrentDistance={setDistance} trackingStartTime={start} setTrackingStartTime={setStart} elapsedTime={elapsed} setElapsedTime={setElapsed} currentPos={pos} setCurrentPos={setPos} currentSpeed={speed} setCurrentSpeed={setSpeed} heading={heading} setHeading={setHeading} triggerAchievementUnlock={()=>{}}/>
 </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
