import React,{useEffect,useRef,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {externalRunningConsentSchema,externalRunningViewSchema,externalRunningSnapshotSchema,externalRunningDisplay,type ExternalRunningView} from '@my-app/shared';
import type {z} from 'zod';
import client from '../lib/hc';
import {hasNativeHealthBridge,nativeHealthStatus,authorizeNativeHealth,readNativeHealth,openNativeHealthSettings} from '../lib/nativeHealth';
import InfoHint from './InfoHint';
import './ExternalRunningPanel.css';
const empty:ExternalRunningView={enabled:false,revision:0,synced_at_ms:null,window_start_ms:null,window_end_ms:null,records:[]};
const date=(ms:number)=>new Date(ms).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export default function ExternalRunningPanel({userId,appDistanceM}:{userId:string;appDistanceM:number}){
  const [data,setData]=useState<ExternalRunningView|null>(null),[capability,setCapability]=useState({supported:false,authorized:false});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [confirming,setConfirming]=useState(false);
  const mounted=useRef(false),token=useRef<string|null>(null);
  const form=useForm<z.infer<typeof externalRunningConsentSchema>>({resolver:zodResolver(externalRunningConsentSchema),defaultValues:{enabled:false,revision:0}});
  function assertAccount(){if(!mounted.current||token.current!==localStorage.getItem('physiproof_access_token'))throw new Error('ログインが変更されました。画面を開き直してください。');}
  async function reload(){assertAccount();const res=await client.api.running.external.$get();if(!res.ok)throw new Error('外部連携の記録を読み込めませんでした。');const value=externalRunningViewSchema.parse(await res.json());assertAccount();setData(value);form.setValue('revision',value.revision);}
  useEffect(()=>{
    mounted.current=true;token.current=localStorage.getItem('physiproof_access_token');setData(null);setError('');
    void reload().catch(e=>{if(mounted.current)setError(e.message);});
    if(hasNativeHealthBridge())void nativeHealthStatus().then(v=>{assertAccount();setCapability(v);}).catch(e=>{if(mounted.current)setError(e.message);});
    return ()=>{mounted.current=false;};
  },[userId]);
  async function action(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{assertAccount();await work();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'外部連携に失敗しました。');}finally{if(mounted.current)setBusy(false);}}
  const connect=form.handleSubmit(async values=>{
    if(!values.enabled){form.setError('enabled',{message:'保存・表示への同意が必要です。'});return;}
    await action(async()=>{
      const state=await authorizeNativeHealth();assertAccount();setCapability(state);
      if(!state.authorized)throw new Error('読み取りが許可されていません。拒否しても通常の機能は利用できます。');
      const res=await client.api.running.external.consent.$put({json:values});if(!res.ok)throw new Error('連携設定を保存できませんでした。再読み込みしてください。');
      await reload();setNotice('連携を有効にしました。「外部記録を同期」で読み込みます。');form.setValue('enabled',false);
    });
  });
  function sync(){void action(async()=>{
    if(!data?.enabled)return;
    const permission=await nativeHealthStatus();assertAccount();setCapability(permission);
    if(!permission.authorized)throw new Error('端末の読み取り権限がありません。「端末の権限設定」で確認してください。保存済み記録も消す場合は連携を解除してください。');
    const snapshot=await readNativeHealth();assertAccount();
    const payload=externalRunningSnapshotSchema.parse({...snapshot,provider:'health_connect',revision:data.revision});
    const res=await client.api.running.external.sync.$put({json:payload});if(!res.ok)throw new Error('外部記録を保存できませんでした。再読み込みしてから同期してください。');
    await reload();setNotice('外部記録を同期しました。ゲーム成績には加算していません。');
  });}
  function disconnect(){if(!data)return;
    void action(async()=>{const res=await client.api.running.external.consent.$put({json:{enabled:false,revision:data.revision}});if(!res.ok)throw new Error('解除できませんでした。再読み込みしてお試しください。');await reload();form.reset({enabled:false,revision:data.revision+1});setConfirming(false);setNotice('外部の保存記録を削除しました。端末の読み取り権限はHealth Connect設定から撤回できます。');});
  }
  const display=externalRunningDisplay(data?.records??[]);
  return <section className="pp-external-running" aria-label="走行距離・外部連携">
    <header><div><small>MY RUNNING / 記録の出どころ</small><h3>走行距離・外部連携</h3></div><InfoHint label="外部連携とゲーム成績" text="外部連携は本人だけの参考記録です。対戦得点・チーム貢献・領域・周回・ミッション・ランキング・距離称号には反映しません。アプリ計測との合算はせず、両方で測った同じ運動も二重加算しません。外部記録内で時刻が重なる運動は距離が長い方を代表として表示します。提供元による計測誤差や同期遅れがあります。"/></header>
    <div className="pp-distance-sources"><article className="pp-distance-app"><span>アプリ計測</span><strong>{(Math.max(0,appDistanceM)/1000).toFixed(2)} <small>km</small></strong><p>これまでの個人走行距離<br/>距離称号の対象</p></article>
      <article className="pp-distance-external"><span>外部連携 · 参考記録</span><strong>{data?.enabled&&data.synced_at_ms!==null?(display.distance_m/1000).toFixed(2):'—'} <small>km</small></strong><p>直近30日の取り込み分<br/>ゲーム成績への加算なし</p></article></div>
    <p className="pp-external-note">本人だけに表示。外部とアプリの距離は合算しません。</p>
    {error&&<div role="alert">{error}<button type="button" disabled={busy} onClick={()=>void action(reload)}>再読み込み</button></div>}
    {!data&&!error&&<p role="status">連携状態を確認しています…</p>}
    {data?.enabled?<>
      <div className="pp-external-actions"><button type="button" disabled={busy||confirming||!capability.supported} onClick={sync}>{busy?'処理中…':'外部記録を同期'}</button><button type="button" disabled={busy||confirming} onClick={()=>setConfirming(true)}>外部連携を解除・記録を削除</button></div>
      {confirming&&<div role="group" aria-label="外部記録の削除確認" className="pp-external-delete-confirm"><p>このアカウントに保存した外部記録を削除し、連携を解除します。アプリ計測・提供元の記録は消えません。</p><div className="pp-external-actions"><button type="button" disabled={busy} onClick={disconnect}>削除して解除する</button><button type="button" disabled={busy} onClick={()=>setConfirming(false)}>やめる</button></div></div>}
      {data.synced_at_ms!==null&&<p className="pp-external-note">最終同期：{date(data.synced_at_ms)} · Health Connect<br/>現在から直近30日の記録を表示。最新の同期端末の内容に置き換わります。</p>}
      <details><summary>外部のランニング履歴（{display.records.length}件）</summary><div className="pp-external-history">{display.records.length?display.records.map(r=><article key={r.source_id+':'+r.record_id}><span className="pp-external-badge">外部連携</span><time dateTime={new Date(r.started_at_ms).toISOString()}>{date(r.started_at_ms)}</time><strong>{(r.distance_m/1000).toFixed(2)} km</strong><small>提供元：{r.source_id}</small></article>):<p>取り込めるランニングはありません。提供元アプリで運動と距離の共有を確認してください。歩行・歩数からは推定しません。</p>}</div></details>
      {display.omitted>0&&<p className="pp-external-note">時間が重なる外部記録{display.omitted}件を二重計上から除外しました。</p>}
    </>:data&&capability.supported?<form onSubmit={connect}>
      <label className="pp-external-consent"><input type="checkbox" {...form.register('enabled')} disabled={busy}/><span>外部ランニングの日時・距離・提供元・記録IDを自分のアカウントに保存し、本人向けに表示することに同意します。</span></label>
      <p className="pp-external-note">位置情報の統計利用とは別の同意です。GPS経路・心拍・睡眠は読み取りません。解除すると保存した外部記録を削除できます。</p>
      {form.formState.errors.enabled&&<p role="alert">{form.formState.errors.enabled.message}</p>}<button type="submit" disabled={busy}>同意してHealth Connectを連携</button>
    </form>:null}
    {!capability.supported&&<p className="pp-external-note">取り込みは外部連携に対応したAndroid 14以降のPhysiProofアプリから行ってください。Web・iPhone版では取り込みできませんが、保存済みの記録は表示できます。</p>}
    {capability.supported&&<button type="button" className="pp-external-settings" disabled={busy} onClick={()=>void action(async()=>{await openNativeHealthSettings();})}>端末の権限設定</button>}
    <details><summary>取り込める記録と保存期間</summary><p className="pp-external-note">Health Connectに共有された直近30日の完了したランニングと、同じ提供元が保存した運動時間内の距離を読み取ります。手入力の運動や距離のない記録は対象外です。時計の機種・提供元アプリによって取得できない場合があります。同期時に対象期間の記録を入れ替えるため、修正・削除も次回同期で反映します。古い保存記録は表示せず、サーバーでも定期削除します。提供元の記録そのものには書き込みません。</p></details>
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
