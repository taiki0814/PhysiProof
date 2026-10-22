import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { runningTrendPreferenceSchema, runningTrendResponseSchema, type RunningTrendResponse,
  type RunningTrendPreference, type RunningTrendCell } from '@my-app/shared';
import client from '../lib/hc';
import InfoHint from './InfoHint';
import AppIcon from './AppIcon';
import './RunningTrendsSection.css';

const days = ['日','月','火','水','木','金','土'];
const displayDays = [1,2,3,4,5,6,0];
const levels: Record<RunningTrendCell['level'],string> = { none:'記録なし',insufficient:'データ不足',low:'少なめ',medium:'中程度',high:'多め' };
export function RunningTrendChart({ data }: { data: RunningTrendResponse }) {
  return <div className="pp-trends-chart-wrap"><table className="pp-trends-chart">
    <caption className="pp-trends-sr">曜日と2時間帯ごとの走行開始傾向。{data.scope === 'community' ? '5人未満の区分はデータ不足。' : '数値は自分の走行回数。'}</caption>
    <thead><tr><th scope="col">時刻</th>{displayDays.map(day=><th key={day} scope="col">{days[day]}</th>)}</tr></thead>
    <tbody>{Array.from({length:12},(_,slot)=><tr key={slot}>
      <th scope="row">{slot*2}–{slot*2+2}<span className="pp-trends-sr">時</span></th>
      {displayDays.map(day=>{
        const cell = data.cells.find(c=>c.weekday===day&&c.slot===slot)!;
        const description = `${days[day]}曜日 ${slot*2}〜${slot*2+2}時：${cell.count === null ? levels[cell.level] : `${cell.count}回`}`;
        return <td key={day} title={description} aria-label={description} className={`pp-trends-level-${cell.level}`}>
          {cell.count === null ? <span aria-hidden="true">{cell.level === 'insufficient' ? '—' : ''}</span> : cell.count || <span aria-hidden="true">·</span>}
        </td>;
      })}
    </tr>)}</tbody>
  </table></div>;
}

export default function RunningTrendsSection() {
  const [scope,setScope] = useState<'community'|'personal'>('community');
  const [weeks,setWeeks] = useState<'4'|'8'>('4');
  const [data,setData] = useState<RunningTrendResponse|null>(null);
  const [error,setError] = useState(''),[notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false),[refresh,setRefresh] = useState(0);
  const preferenceKnown = useRef(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const form = useForm<RunningTrendPreference>({resolver:zodResolver(runningTrendPreferenceSchema),defaultValues:{sharing:false}});
  useEffect(()=>{
    const abort = new AbortController(); let active=true;
    const requestedGeneration = generation.current;
    setBusy(true);setError('');setData(null);
    void client.api.running.trends.$get({query:{scope,weeks}},{init:{signal:abort.signal,cache:'no-store'}}).then(async res=>{
      const body = await res.json();
      if (!res.ok) throw new Error('error' in body ? String(body.error) : '走行傾向を読み込めませんでした。');
      const parsed = runningTrendResponseSchema.parse(body);
      if(active && requestedGeneration===generation.current && !saving.current){setData(parsed); if(!form.getFieldState('sharing').isDirty) form.reset({sharing:parsed.sharing});preferenceKnown.current=true;}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'通信に失敗しました。');})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;abort.abort();};
  },[scope,weeks,refresh]);
  useEffect(()=>{
    const recheck=()=>{if(document.visibilityState==='visible'&&!form.formState.isSubmitting)setRefresh(n=>n+1);};
    window.addEventListener('focus',recheck);
    return()=>window.removeEventListener('focus',recheck);
  },[form.formState.isSubmitting]);
  const save = form.handleSubmit(async values=>{
    saving.current=true;generation.current+=1;
    setNotice('');setError('');
    try {
      const res = await client.api.running.trends.preferences.$put({json:values});
      const body = await res.json();
      if(!res.ok || !('sharing' in body))throw new Error('error' in body?String(body.error):'設定を保存できませんでした。');
      const stored=runningTrendPreferenceSchema.parse(body);
      form.reset(stored);setData(null);setNotice(stored.sharing?'匿名統計への協力を有効にしました。設定後に開始した走行から対象になります。':'匿名統計への協力を無効にしました。集計対象から外れます。');setRefresh(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'設定を保存できませんでした。');}
    finally{saving.current=false;}
  });
  return <section className="pp-trends" aria-label="走行傾向">
    <div className="pp-trends-intro"><div className="pp-trends-eyebrow"><AppIcon name="activity"/> RUNNING RHYTHM</div>
      <h3>走る時間を、見つけよう。</h3><p>曜日・時間帯ごとのアプリ内の走行開始傾向です。地域の人出やリアルタイムの混雑ではありません。</p>
    </div>
    <div className="pp-trends-controls">
      <div className="pp-trends-scope" role="group" aria-label="集計の対象">
        <button type="button" aria-pressed={scope==='community'} disabled={form.formState.isSubmitting} onClick={()=>setScope('community')}>みんなの傾向</button>
        <button type="button" aria-pressed={scope==='personal'} disabled={form.formState.isSubmitting} onClick={()=>setScope('personal')}>自分の傾向</button>
      </div>
      <label>集計期間<select value={weeks} disabled={form.formState.isSubmitting} onChange={e=>setWeeks(e.target.value as '4'|'8')}><option value="4">直近4週間</option><option value="8">直近8週間</option></select></label>
      <InfoHint label="走行傾向の集計ルール" text="日本時間の走行開始時刻で、前日までに終了した距離のある記録を集計します。個人・チーム活動を含み、領域を囲わなかった走行も対象です。みんなの傾向は協力設定後の記録だけを使い、同じ人の周回で人数が増えないよう区分ごとの異なる利用者を集計します。氏名・地域・年齢・身体情報・経路・正確な人数は表示しません。"/>
    </div>
    {busy&&<div role="status" className="pp-trends-message">走行記録を集計しています…</div>}
    {error&&<div role="alert" className="pp-trends-error">{error}<button type="button" onClick={()=>setRefresh(n=>n+1)}>再読み込み</button></div>}
    {data&&<>
      <div className="pp-trends-period">{formatDate(data.starts_at)}〜{formatDate(new Date(Date.parse(data.ends_at)-1).toISOString())} · 日本時間 · 今日の走行は翌日反映</div>
      {data.summary&&<div className="pp-trends-summary"><span>完了した走行 <strong>{data.summary.runs} 回</strong></span><span>走行距離 <strong>{(data.summary.distance_m/1000).toFixed(1)} km</strong></span></div>}
      {scope==='community'&&data.cells.every(cell=>cell.level==='insufficient')&&<div className="pp-trends-message">まだ集計に必要な記録がありません。各区分に5人以上の協力者の記録が集まると表示されます。「データ不足」は空いているという意味ではありません。</div>}
      {scope==='personal'&&data.summary?.runs===0&&<div className="pp-trends-message">この期間の完了済み走行はありません。前日までの距離が記録されたランニングが対象です。</div>}
      <RunningTrendChart data={data}/>
      <div className="pp-trends-legend" aria-label="色の凡例">{(scope==='community'?['insufficient','low','medium','high']:['none','low','medium','high']).map(level=><span key={level}><i className={`pp-trends-level-${level}`} aria-hidden="true"/>{levels[level as RunningTrendCell['level']]}</span>)}</div>
      <p className="pp-trends-small">{scope==='community'?'濃さは、各曜日・時間帯に走行を開始した異なる協力者数の段階です。5〜9人／10〜19人／20人以上を3段階で表示し、人数そのものは返しません。':'数値はあなたの走行開始回数です。色の濃さは、この期間で多い時間帯を表します。'}</p>
    </>}
    <form className="pp-trends-consent" onSubmit={save}>
      <h3>匿名統計への協力</h3>
      <label className="pp-trends-consent-label"><input type="checkbox" {...form.register('sharing')} disabled={!preferenceKnown.current||form.formState.isSubmitting}/><span>自分の走行記録を、みんなの傾向に含める</span></label>
      <p>初期設定はオフです。有効化後に開始した走行だけを、名前や位置情報を含めない統計に使います。オフにすると過去の協力分も集計対象から外れます。プロフィール地図の公開設定とは別の設定です。</p>
      <button type="submit" disabled={!preferenceKnown.current||!form.formState.isDirty||form.formState.isSubmitting}>{form.formState.isSubmitting?'保存中…':'協力設定を保存'}</button>
      {notice&&<p role="status">{notice}</p>}
    </form>
  </section>;
}
function formatDate(iso:string){return new Date(iso).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});}
