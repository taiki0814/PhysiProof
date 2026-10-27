import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {createRunningCourseSchema,firstCourseLoop,courseRewardInventorySchema,COURSE_REWARDS,COURSE_REWARD_MIN_LENGTH_M,courseRewardUniform,type RunningCourse,type CourseRewardInventory,type CoursePoint} from '@my-app/shared';
import type {z} from 'zod';
import client from '../lib/hc';
import UniformPreview from './UniformPreview';
import InfoHint from './InfoHint';
import './RunningCoursesPanel.css';
export type CompletedCourseDraft={sessionId:string;route:CoursePoint[]};
export default function RunningCoursesPanel({courses,selected,onSelect,tracking,draft,onDraftSaved,onReload,userId,avatar,onEquipment,onUniformApplied,error:catalogueError}:{
  courses:RunningCourse[];selected:string;onSelect:(id:string)=>void;tracking:boolean;draft:CompletedCourseDraft|null;onDraftSaved:()=>void;onReload:()=>void;userId:string;avatar:string;
  onEquipment:(inventory:CourseRewardInventory)=>void;onUniformApplied:()=>void;error?:string;
}){
  const [inventory,setInventory]=useState<CourseRewardInventory|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const callbacks=useRef({onEquipment});callbacks.current={onEquipment};
  const loop=useMemo(()=>draft?firstCourseLoop(draft.route):null,[draft]);
  const form=useForm<z.infer<typeof createRunningCourseSchema>>({resolver:zodResolver(createRunningCourseSchema),defaultValues:{name:'',route:[],source_session_id:''}});
  useEffect(()=>{form.reset({name:'いつものコース',route:loop??[],source_session_id:draft?.sessionId??''});},[draft,loop]);
  async function reloadRewards(){const res=await client.api.running.rewards.$get();if(!res.ok)throw new Error('装飾報酬を読み込めませんでした。');const value=courseRewardInventorySchema.parse(await res.json());setInventory(value);callbacks.current.onEquipment(value);}
  useEffect(()=>{void reloadRewards().catch(e=>setError(e.message));},[userId,tracking]);
  const save=form.handleSubmit(async values=>{
    setError('');setNotice('');setBusy(true);
    try{const res=await client.api.running.courses.$post({json:values});const result=await res.json();
      if(!res.ok||!('id' in result))throw new Error('error' in result?String(result.error):'コースを保存できませんでした。');
      onSelect(result.id);onDraftSaved();onReload();setNotice('コースを保存しました。次の走行前に選択すると周回を記録します。');
    }catch(e){setError(e instanceof Error?e.message:'保存できませんでした。');}finally{setBusy(false);}
  });
  async function equip(kind:'title'|'frame',enabled:boolean){
    if(!inventory)return;setBusy(true);setError('');
    const equipped={...inventory.equipped,...(kind==='title'?{title_id:enabled?'course-title' as const:null}:{frame_id:enabled?'course-frame' as const:null})};
    try{const res=await client.api.running.rewards.$put({json:equipped});if(!res.ok)throw new Error('装備を保存できませんでした。再読み込みしてください。');await reloadRewards();setNotice('装飾を変更しました。対戦性能は変わりません。');}
    catch(e){setError(e instanceof Error?e.message:'変更できませんでした。');}finally{setBusy(false);}
  }
  async function wearUniform(){
    if(!window.confirm('個人ユニフォームをCIRCUIT CREWに変更します。現在のデザインは先にユニフォーム編集で保存・控えてください。変更しますか？'))return;
    setBusy(true);setError('');
    try{const current=await client.api.uniforms.me.$get();if(!current.ok)throw new Error('ユニフォームを読み込めません。');const value=await current.json();
      const res=await client.api.running.rewards.uniform.$put({json:{revision:value.uniforms.personal.revision}});if(!res.ok)throw new Error('未獲得、または別画面で更新されています。再読み込みしてください。');
      onUniformApplied();setNotice('個人ユニフォームに適用しました。チームユニフォームは変更していません。');
    }catch(e){setError(e instanceof Error?e.message:'適用できませんでした。');}finally{setBusy(false);}
  }
  return <section className="pp-courses" aria-label="マイコースと装飾報酬">
    <header><div><small>MY COURSE / 続けた道の記録</small><h3>マイコース・装飾報酬</h3></div><InfoHint label="コースと周回の判定" text="オンライン走行を一周して終了し、コースとして保存します。次の開始前にコースを選択してください。領域の形ではなく保存済み経路に照合し、約30mまでのGPSずれを許容します。逆回りや途中の地点からの一周も対象です。一部の横切り・往復だけでは増えず、精度不足・圏外・不自然な移動中は周回を確認しません。登録用の過去走行を後付け加算しません。コースはプロフィールマップと同じ公開範囲で、位置統計の同意とは別です。"/></header>
    <label className="pp-course-field">次に走るコース<select aria-label="次に走るコース" value={selected} onChange={e=>onSelect(e.target.value)} disabled={tracking||busy}>
      <option value="">選択しない（通常の走行）</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name} · {c.laps}周</option>)}
    </select></label>
    {!!selected&&<p className="pp-course-note">コース照合のため走行中のGPSを送信します。位置統計への協力がOFFでも周回判定は利用できます。通常ブラウザーでの実測歩数は増えません。</p>}
    {(catalogueError||error)&&<div role="alert">{catalogueError||error}<button type="button" onClick={()=>{onReload();void reloadRewards().catch(e=>setError(e.message));}}>再読み込み</button></div>}
    {draft&&<details open><summary>今回の走行をコースとして保存</summary>{loop?<form onSubmit={save}>
      <label className="pp-course-field">コース名<input {...form.register('name')} maxLength={60}/></label>
      <p className="pp-course-note">最初の一周を保存します。経路はコースとしてサーバーへ保存され、プロフィールの公開設定に従います。コース形状は固定し、GPSのずれで別コースを増やしません。</p>
      {Object.keys(form.formState.errors).length>0&&<p role="alert">コース名と一周の経路を確認してください。</p>}
      <button type="submit" disabled={busy}>コースを保存</button></form>:<p className="pp-course-note">登録には一周200m以上を走り、開始地点の約30m以内に戻った記録が必要です。</p>}</details>}
    <div className="pp-course-list">{courses.length?courses.map(c=><article key={c.id}><strong>{c.name}</strong><span>{(c.length_m/1000).toFixed(2)}km · <b>{c.laps}周</b> · {c.running_days}日</span></article>):<p className="pp-course-note">まだコースはありません。一周した走行を終了した後、ここから保存できます。</p>}</div>
    <details><summary>継続の装飾報酬</summary><p className="pp-course-note">一周{COURSE_REWARD_MIN_LENGTH_M}m以上の同じコースで達成すると獲得。日数は連続でなくても大丈夫です。取得した装飾は領域が消えても残り、得点・速度・防御などの性能差はありません。</p>
      <div className="pp-course-avatar-preview"><img src={avatar} alt="装飾プレビュー" className={inventory?.equipped.frame_id?'pp-course-frame':''}/>{inventory?.equipped.title_id&&<span>いつもの道のランナー</span>}</div>
      <div className="pp-course-rewards">{COURSE_REWARDS.map(reward=>{const unlocked=inventory?.unlocked.some(u=>u.reward_id===reward.id);return <article key={reward.id}><strong>{reward.name}</strong><span>{reward.laps}周・{reward.days}日以上 · {unlocked?'獲得済み':'未獲得'}</span>
        {reward.kind==='uniform'?<><UniformPreview design={courseRewardUniform()} compact label="報酬ユニフォーム"/><button type="button" disabled={!unlocked||busy} onClick={()=>void wearUniform()}>個人ユニフォームに適用</button></>:<button type="button" disabled={!unlocked||busy} onClick={()=>void equip(reward.kind,!(reward.kind==='title'?inventory?.equipped.title_id:inventory?.equipped.frame_id))}>{(reward.kind==='title'?inventory?.equipped.title_id:inventory?.equipped.frame_id)?'装備を外す':'装備する'}</button>}</article>;})}</div>
    </details>{notice&&<p role="status">{notice}</p>}
  </section>;
}
