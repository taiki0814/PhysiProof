// Local Vite-only fixture. All API calls are intercepted in memory, never in D1.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {runningTrendWindow} from '@my-app/shared';
import RunningTrendsSection from '../src/components/RunningTrendsSection';
import {ProfileModal} from '../src/components/ProfileModal';
import '../src/index.css';
let sharing=false,empty=false,fail=false;
let vitals={current_weight:65,target_weight:62,height:170,gender:null};
const nativeFetch=window.fetch.bind(window);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin);
  if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  if(url.pathname==='/api/running/places')return json({places:[]});
  if(url.pathname==='/api/running/places/preferences')return json({sharing:false});
  if(url.pathname==='/api/running/trends/preferences'){sharing=JSON.parse(options.body).sharing;return json({sharing});}
  if(url.pathname==='/api/users/me/vitals'){vitals=JSON.parse(options.body);return json({success:true,vitals});}
  if(url.pathname==='/api/running/trends'){
    if(fail)return json({error:'テスト用の通信エラーです。'},503);
    const scope=url.searchParams.get('scope')||'community',weeks=Number(url.searchParams.get('weeks')||4);
    const cells=Array.from({length:84},(_,i)=>{
      const slot=i%12,weekday=Math.floor(i/12),n=empty?0:slot===3?weekday%3+2:slot===9?weekday%4+1:0;
      return {weekday,slot,count:scope==='community'?null:n,level:scope==='community'?(n?['low','medium','high'][n%3]:'insufficient'):n?(n>3?'high':n>1?'medium':'low'):'none'};
    });
    return json({...runningTrendWindow(weeks),scope,weeks,timezone:'Asia/Tokyo',method:'run_starts',sharing,min_participants:5,cells,summary:scope==='community'?null:{runs:cells.reduce((n,c)=>n+c.count,0),distance_m:cells.reduce((n,c)=>n+c.count*3200,0)}});
  }
  if(url.pathname.includes('achievements'))return json({achievements:[]});
  return json({error:'テスト画面ではこのAPIは実行しません。'},503);
};
function Fixture(){
 const [version,setVersion]=useState(0),[profile,setProfile]=useState(false),[saved,setSaved]=useState('');
 return <div style={{padding:16,maxWidth:920,margin:'auto',color:'#fff'}}>
  <aside style={{padding:14,background:'#38290e',border:'2px solid #f6be4a',marginBottom:14}}>テスト専用・架空データです。保存はこの画面のメモリ内だけです。本番・ローカルの実DBには接続しません。</aside>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
   <button style={{minHeight:44}} onClick={()=>setProfile(true)}>プロフィール設定を確認</button>
   <button style={{minHeight:44}} onClick={()=>{empty=!empty;setVersion(n=>n+1);}}>記録あり／データ不足</button>
   <button style={{minHeight:44}} onClick={()=>{fail=!fail;setVersion(n=>n+1);}}>通信エラー切替</button>
  </div>
  {saved&&<p role="status">{saved}</p>}
  <RunningTrendsSection key={version}/>
  {profile&&<ProfileModal currentUser={{name:'テスト用ランナー',avatar_id:'default',login_id:'fixture',age:22,...vitals}} onClose={()=>setProfile(false)} onSave={()=>setProfile(false)} onVitalsSaved={()=>setSaved('メモリ内だけに身体情報を保存しました。')}/>}
 </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
