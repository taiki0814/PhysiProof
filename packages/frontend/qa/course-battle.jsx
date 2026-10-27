// Memory-only UI QA. No real accounts, invitations, equipment or GPS writes.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {courseLength,equivalentCourses,createDefaultUniform,teamBattleSummarySchema} from '@my-app/shared';
import RunningCoursesPanel from '../src/components/RunningCoursesPanel';
import {TeamBattlesPanel} from '../src/components/TeamBattlesPanel';
import {ProfileTerritoryMap} from '../src/components/ProfileTerritoryMap';
import '../src/index.css';
const owner='11111111-1111-4111-8111-111111111111',team='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',course='44444444-4444-4444-8444-444444444444';
const route=Array.from({length:37},(_,i)=>[35.68+Math.sin(i/36*Math.PI*2)*.0018,139.75+Math.cos(i/36*Math.PI*2)*.0022]);route[36]=route[0];
let courses=[{id:course,name:'皇居周辺・画面確認用の架空コース',route,length_m:courseLength(route),laps:12,running_days:4}],denied=false,fail=false;
let inventory={equipped:{title_id:null,frame_id:null,revision:0},unlocked:[{reward_id:'course-title',unlocked_at:new Date().toISOString()},{reward_id:'course-frame',unlocked_at:new Date().toISOString()}]};
const battle=(p={})=>teamBattleSummarySchema.parse({id:crypto.randomUUID(),starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),display_status:'pending',can_cancel:true,can_delete_history:false,distance_points_per_km:1,territory_points_per_1000_sqm:1,scoring_version:2,map_mode:'isolated',map_rules_version:1,territory_lifetime_hours:5,participants:[{team_id:team,team_name:'試験用RUN CREW',role:'host',invitation_status:'accepted',distance_m:0,distance_points:0,territory_delta_sqm:0,territory_points:0,score:0},{team_id:other,team_name:'試験用CIRCUIT',role:'opponent',invitation_status:'pending',distance_m:0,distance_points:0,territory_delta_sqm:0,territory_points:0,score:0}],...p});
let battles=[battle()];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input),location.origin),method=options.method||'GET';
 if(!url.pathname.startsWith('/api/'))return originalFetch(input,options);
 if(fail)return json({error:'架空の通信エラー'},503);
 if(url.pathname==='/api/running/courses'){
  if(method==='POST'){const value=JSON.parse(options.body),id=crypto.randomUUID();if(courses.some(c=>equivalentCourses(c.route,value.route)))return json({error:'同じコースが既にあります。'},409);courses.push({id,name:value.name,route:value.route,length_m:courseLength(value.route),laps:0,running_days:0});return json({success:true,id},201);}
  return json({owner:{id:owner,name:'画面確認用ランナー'},courses});
 }
 if(url.pathname.includes('/profiles/')&&url.pathname.endsWith('/courses'))return denied?json({error:'非公開のコースです。'},403):json({owner:{id:owner,name:'画面確認用ランナー'},courses});
 if(url.pathname.includes('/territory-map'))return denied?json({error:'非公開です。'},403):json({owner:{id:owner,name:'画面確認用ランナー'},mode:url.searchParams.get('mode')||'current',territories:[],next_before:null});
 if(url.pathname==='/api/running/rewards'){
  if(method==='PUT')inventory={...inventory,equipped:{...JSON.parse(options.body),revision:inventory.equipped.revision+1}};
  return json(method==='PUT'?{success:true,revision:inventory.equipped.revision}:inventory);
 }
 if(url.pathname==='/api/uniforms/me')return json({uniforms:{personal:{design:createDefaultUniform(),revision:0},team:null}});
 if(url.pathname==='/api/running/rewards/uniform')return json({success:true,revision:1});
 if(url.pathname==='/api/teams/battles'){
  if(method==='POST'){const value=JSON.parse(options.body),row=battle({...value,display_status:'pending'});battles.unshift(row);return json({success:true,battle_id:row.id});}
  return json({success:true,battles});
 }
 return json({error:'この確認画面では実行しません。'},503);
};
const avatar='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#29465c"/><text x="40" y="53" fill="#d9f5ff" text-anchor="middle" font-size="42" font-family="sans-serif">R</text></svg>');
function Fixture(){const [view,setView]=useState('courses'),[selected,setSelected]=useState(course),[draft,setDraft]=useState({sessionId:'55555555-5555-4555-8555-555555555555',route:route.map(p=>[p[0]+.004,p[1]])}),[version,setVersion]=useState(0),[map,setMap]=useState(false),[own,setOwn]=useState(true),[equip,setEquip]=useState(null),[message,setMessage]=useState('');
 return <div style={{maxWidth:1000,margin:'auto',padding:16,color:'#fff'}}>
 <aside style={{padding:14,border:'2px solid #efbd48',background:'#30240c',lineHeight:1.7,marginBottom:16}}>テスト専用・架空データです。コース、周回数、対戦、報酬は画面確認用で、保存はメモリー内のみ。実DB・実GPS・本番の相手チームには接続しません。</aside>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>{[['courses','コースと報酬'],['battles','対戦の消滅時間']].map(([id,label])=><button key={id} style={{minHeight:44,padding:10}} onClick={()=>setView(id)}>{label}</button>)}
 <button style={{minHeight:44,padding:10}} onClick={()=>{denied=false;setOwn(true);setMap(true);}}>自分のコースマップ</button>
 <button style={{minHeight:44,padding:10}} onClick={()=>{denied=true;setOwn(false);setMap(true);}}>非公開の表示例</button>
 <button style={{minHeight:44,padding:10}} onClick={()=>{fail=!fail;setVersion(n=>n+1);}}>通信失敗切替</button></div>
 {message&&<p role="status">{message}</p>}
 {view==='courses'?<RunningCoursesPanel key={version} courses={courses} selected={selected} onSelect={setSelected} tracking={false} draft={draft} onDraftSaved={()=>setDraft(null)} onReload={()=>setVersion(n=>n+1)} userId={owner} avatar={avatar} onEquipment={setEquip} onUniformApplied={()=>setMessage('メモリー内でだけ個人ユニフォームを変更しました。')}/>:<TeamBattlesPanel key={version} currentUserId={owner} currentTeam={{id:team,name:'試験用RUN CREW',owner_id:owner}} teams={[{id:team,name:'試験用RUN CREW',owner_id:owner},{id:other,name:'試験用CIRCUIT',owner_id:'other'}]}/>}
 {equip&&<p style={{color:'#b1c7d7',fontSize:12}}>架空の装備状態：称号 {equip.equipped.title_id?'あり':'なし'} ／ 枠 {equip.equipped.frame_id?'あり':'なし'}</p>}
 {map&&<ProfileTerritoryMap ownerId={owner} isOwn={own} onClose={()=>setMap(false)}/>}
 </div>;
}
const root=createRoot(document.getElementById('root'));root.render(<Fixture/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
