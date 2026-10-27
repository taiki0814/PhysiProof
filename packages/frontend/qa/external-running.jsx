// Fictitious in-memory QA only. Never reads a real health store or writes a real API.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EXTERNAL_RUNNING_WINDOW_MS} from '@my-app/shared';
import ExternalRunningPanel from '../src/components/ExternalRunningPanel';
import '../src/index.css';
if(window.PhysiProofHealth)throw new Error('この架空データ画面は実際のネイティブアプリでは使用しません。');
let fail=false,denied=false;
const makeRecords=()=>{const now=Date.now();return [
 {record_id:'fake-watch-1',source_id:'example.watch',started_at_ms:now-3600000,ended_at_ms:now-1800000,distance_m:11000},
 {record_id:'fake-phone-copy',source_id:'example.phone',started_at_ms:now-3600000,ended_at_ms:now-1800000,distance_m:10900},
 {record_id:'fake-watch-2',source_id:'example.watch',started_at_ms:now-86400000,ended_at_ms:now-85000000,distance_m:4200},
]};
const initial=()=>({enabled:true,revision:1,synced_at_ms:Date.now(),window_start_ms:Date.now()-EXTERNAL_RUNNING_WINDOW_MS,window_end_ms:Date.now(),records:makeRecords()});
let data=initial();
const bridge={onmessage:null,postMessage(json){const c=JSON.parse(json),now=Date.now();queueMicrotask(()=>bridge.onmessage?.({data:JSON.stringify({id:c.id,data:c.command==='read'?{window_start_ms:now-EXTERNAL_RUNNING_WINDOW_MS,window_end_ms:now,records:makeRecords()}:{supported:true,authorized:!denied}})}));}};
window.PhysiProofHealth=bridge;
const original=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input),location.origin);
 if(!url.pathname.startsWith('/api/'))return original(input,options);
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(fail){fail=false;return json({error:'架空の通信エラー'},503);}
 if(url.pathname==='/api/running/external')return json(data);
 if(url.pathname==='/api/running/external/consent'){
  const p=JSON.parse(options.body);data={...data,enabled:p.enabled,revision:data.revision+1,synced_at_ms:null,window_start_ms:null,window_end_ms:null,records:[]};return json({success:true,revision:data.revision});
 }
 if(url.pathname==='/api/running/external/sync'){
  const p=JSON.parse(options.body);if(!data.enabled||p.revision!==data.revision)return json({error:'架空の設定競合'},409);
  data={...data,...p,enabled:true,revision:data.revision+1,synced_at_ms:Date.now()};return json({success:true,revision:data.revision});
 }
 return json({error:'この確認画面では実行しません。'},503);
};
function Fixture(){const [version,setVersion]=useState(0);const reset=(mode)=>{fail=mode==='error';denied=mode==='denied';if(mode==='new'||mode==='denied')data={enabled:false,revision:0,synced_at_ms:null,window_start_ms:null,window_end_ms:null,records:[]};else data=initial();window.PhysiProofHealth=mode==='web'?undefined:bridge;setVersion(n=>n+1);};
 return <main style={{maxWidth:880,margin:'auto',padding:16,color:'#e7edf7'}}><aside style={{padding:14,border:'2px solid #e8bf5d',background:'#2b240e',lineHeight:1.7}}>テスト専用・架空の走行距離です。Health Connect・実DB・本番アカウントには接続しません。許可と保存は画面確認用のメモリー内シミュレーションです。</aside>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>{[['saved','保存済み例'],['new','未連携例'],['denied','権限拒否例'],['web','Web版の例'],['error','通信失敗例']].map(([mode,label])=><button key={mode} style={{minHeight:44,padding:10}} onClick={()=>reset(mode)}>{label}</button>)}</div>
 <ExternalRunningPanel key={version} userId="fixture-only" appDistanceM={42500}/></main>;
}
const root=createRoot(document.getElementById('root'));root.render(<Fixture/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
