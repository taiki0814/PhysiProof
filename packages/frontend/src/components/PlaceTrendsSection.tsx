import React,{useEffect,useRef,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {runningPlaceListSchema,placeSharingSchema,placeTrendResponseSchema,type RunningPlace,type PlaceTrendResponse} from '@my-app/shared';
import client from '../lib/hc';
import RunningTrendChart from './RunningTrendChart';
import InfoHint from './InfoHint';

export default function PlaceTrendsSection(){
  const [places,setPlaces]=useState<RunningPlace[]>([]),[selected,setSelected]=useState(''),[query,setQuery]=useState('');
  const [weeks,setWeeks]=useState<'4'|'8'>('4'),[data,setData]=useState<PlaceTrendResponse|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[known,setKnown]=useState(false),[refresh,setRefresh]=useState(0);
  const generation=useRef(0),saving=useRef(false);
  const form=useForm<{sharing:boolean}>({resolver:zodResolver(placeSharingSchema),defaultValues:{sharing:false}});
  useEffect(()=>{let live=true;void Promise.all([client.api.running.places.$get(),client.api.running.places.preferences.$get()]).then(async([list,pref])=>{
    if(!list.ok||!pref.ok)throw new Error('集計場所・公開協力設定を読み込めませんでした。');
    const catalogue=runningPlaceListSchema.parse(await list.json()),preference=placeSharingSchema.parse(await pref.json());
    if(live){setPlaces(catalogue.places);setSelected(id=>catalogue.places.some(p=>p.id===id)?id:catalogue.places[0]?.id??'');if(!form.getFieldState('sharing').isDirty&&!saving.current)form.reset(preference);setKnown(true);}
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'読み込みに失敗しました。');});return()=>{live=false;};},[refresh]);
  useEffect(()=>{
    if(!selected)return;let live=true;const revision=generation.current;setBusy(true);setError('');setData(null);
    void client.api.running.places.trends.$get({query:{place_id:selected,weeks}},{init:{cache:'no-store'}}).then(async res=>{
      if(!res.ok)throw new Error('この場所の傾向を読み込めませんでした。');
      const parsed=placeTrendResponseSchema.parse(await res.json());if(live&&revision===generation.current)setData(parsed);
    }).catch(e=>{if(live)setError(e instanceof Error?e.message:'読み込みに失敗しました。');}).finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[selected,weeks,refresh]);
  const save=form.handleSubmit(async values=>{
    saving.current=true;generation.current++;setNotice('');setError('');setData(null);
    try{
      const res=await client.api.running.places.preferences.$put({json:values});if(!res.ok)throw new Error('位置情報の統計協力設定を保存できませんでした。');
      const stored=placeSharingSchema.parse(await res.json());form.reset(stored);
      setNotice(stored.sharing?'場所別統計への協力を有効にしました。この設定後に開始する走行だけが対象です。':'場所別統計への協力を無効にし、自分の通過記録を削除しました。');setRefresh(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'設定を保存できませんでした。');}
    finally{saving.current=false;}
  });
  const filtered=places.filter(p=>p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="pp-trends" aria-label="場所別の過去の通過傾向">
    <div className="pp-trends-intro"><div className="pp-trends-eyebrow">PLACE RHYTHM / 過去の記録</div><h3>走る場所と時間を、選ぼう。</h3><p>このアプリの協力者が、その場所を通過した過去の傾向です。現在の混雑や、アプリを使わない人を含む実際の人出ではありません。</p></div>
    <label className="pp-place-search">場所を検索<input type="search" placeholder="例：皇居" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="pp-place-options" role="group" aria-label="集計する公共エリア">{filtered.map(p=><button key={p.id} type="button" aria-pressed={selected===p.id} onClick={()=>setSelected(p.id)}>{p.name}</button>)}</div>
    {known&&!places.length&&<p className="pp-trends-message">集計エリアはまだ登録されていません。管理者が公共のランニングエリアを登録すると利用できます。</p>}
    {!!places.length&&!filtered.length&&<p className="pp-trends-message">検索に一致する場所がありません。</p>}
    <div className="pp-trends-controls"><label>集計期間<select value={weeks} onChange={e=>setWeeks(e.target.value as '4'|'8')}><option value="4">直近4週間</option><option value="8">直近8週間</option></select></label>
      <InfoHint label="場所別の集計ルール" text="登録された公共エリア内で移動を確認した時刻を、日本時間の2時間枠で集計します。前日までに完了した走行のみが対象で、同じ人が周回しても人数は増えません。各曜日・時間帯に5人以上かつ3日以上の記録がある場合だけ段階を表示します。氏名・個人の位置・経路・正確な人数は公開しません。統計の少なさは、実際に空いている保証ではありません。"/>
    </div>
    {busy&&<p role="status">過去の通過記録を集計中…</p>}
    {error&&<div role="alert" className="pp-trends-error">{error}<button type="button" onClick={()=>setRefresh(n=>n+1)}>再読み込み</button></div>}
    {data&&<><h3 style={{margin:0}}>{data.place.name}</h3><p className="pp-trends-small">{data.place.description}</p>
      <p className="pp-trends-period">{new Date(data.starts_at).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}〜{new Date(Date.parse(data.ends_at)-1).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})} · 今日の通過は翌日以降に反映</p>
      {data.cells.every(c=>c.level==='insufficient')&&<p className="pp-trends-message">まだ表示に必要な記録がありません。各曜日・時間帯に5人以上・3日以上の記録が必要です。「データ不足」は空いているという意味ではありません。</p>}
      <RunningTrendChart data={data}/><div className="pp-trends-legend">{[['insufficient','データ不足'],['low','少なめ'],['medium','中程度'],['high','多め']].map(([level,label])=><span key={level}><i className={`pp-trends-level-${level}`}/>{label}</span>)}</div>
      <p className="pp-trends-small">色は過去期間の異なる協力者数の段階です。混雑の予測・安全性の判定ではありません。</p>
    </>}
    <form className="pp-trends-consent" onSubmit={save}><h3>位置情報の統計利用への同意</h3>
      <label className="pp-trends-consent-label"><input type="checkbox" {...form.register('sharing')} disabled={!known||form.formState.isSubmitting}/><span>走行中に通過した公共エリアを、場所別統計に使う</span></label>
      <p>初期設定はオフです。「走行開始の匿名統計」とは別の設定です。同意後に開始した走行について、登録エリアと2時間枠を記録します。細かいGPS経路を統計として保存・公開しません。オフにすると自分の通過記録を削除し、再度オンにしても過去の走行を取り込みません。</p>
      <button type="submit" disabled={!known||!form.formState.isDirty||form.formState.isSubmitting}>{form.formState.isSubmitting?'保存中…':'位置情報の協力設定を保存'}</button>
      {notice&&<p role="status">{notice}</p>}
    </form>
  </section>;
}
