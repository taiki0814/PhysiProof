import React,{useEffect,useState} from 'react';
import {ownStepsSchema,type OwnSteps,type RunStepSummary,MOTION_STATE_LABELS} from '@my-app/shared';
import client from '../lib/hc';
import InfoHint from './InfoHint';
export default function MeasuredStepsCard({userId,tracking=false,live,nativeAvailable=false}:{userId:string;tracking?:boolean;live?:RunStepSummary|null;nativeAvailable?:boolean}){
  const [data,setData]=useState<OwnSteps|null>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;setError('');void client.api.running.steps.me.$get().then(async res=>{if(!res.ok)throw new Error();const d=ownStepsSchema.parse(await res.json());if(active)setData(d);}).catch(()=>{if(active)setError('歩数記録を読み込めませんでした。');});return()=>{active=false;};},[userId,tracking]);
  return <section className="hud-card" aria-label="実測歩数" style={{minWidth:0,padding:18,border:'1px solid #344b60',borderRadius:14,background:'#101c29',color:'#eef7ff'}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}><h3 style={{fontSize:16,margin:0}}>実測歩数</h3><InfoHint label="実測歩数" text="対応Androidアプリの歩数センサーで、オンライン走行中だけ計測します。距離やカロリーから歩数を推測しません。移動確認歩数はGPS精度・速度・歩数の整合性を確認できた区間です。GPS待ちや精度不足は不正確定ではありません。現在は歩数による対戦加点・報酬はありません。端末改ざんを完全に防ぐ認証ではありません。"/></div>
    {tracking&&<p style={{color:'#bff440',lineHeight:1.7}}>{live?.source==='android_step_counter'?`今回：計測 ${live.measured_steps.toLocaleString()} 歩 ／ 移動確認 ${live.eligible_steps.toLocaleString()} 歩`:'今回の歩数は未計測です。'}</p>}
    {tracking&&live?.course_laps!==undefined&&<p style={{color:'#85efff'}}>今回のコース：{live.course_laps}周（完了時に確定）</p>}
    {tracking&&live&&<p style={{fontSize:13,color:'#b1c5d5'}}>{MOTION_STATE_LABELS[live.state]}</p>}
    {data?<div style={{display:'grid',gap:10,marginTop:14}}>
      <div>本日の実測 <strong style={{fontSize:24,color:'#bff440'}}>{data.today_measured_steps.toLocaleString()}</strong> 歩</div>
      <div style={{color:'#b1c5d5',fontSize:13}}>本日の移動確認 {data.today_eligible_steps.toLocaleString()} 歩</div>
      <div style={{color:'#b1c5d5',fontSize:13}}>累計：実測 {data.total_measured_steps.toLocaleString()} 歩 ／ 移動確認 {data.total_eligible_steps.toLocaleString()} 歩</div>
      <small style={{color:'#b1c5d5'}}>完了したオンライン走行のみ。日付は終了時刻の日本時間です。</small>
    </div>:<p role={error?'alert':'status'}>{error||'記録を読み込み中…'}</p>}
    {!nativeAvailable&&<p style={{fontSize:13,color:'#b1c5d5',lineHeight:1.7}}>このブラウザーでは実測歩数を計測できません。対応Androidアプリで利用できます。距離・領域機能は引き続き使えます。</p>}
  </section>;
}
