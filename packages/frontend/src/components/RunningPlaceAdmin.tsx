import React,{useEffect,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {publicRunningPlaceSchema,runningPlaceListSchema,type RunningPlace,type PublicRunningPlaceInput} from '@my-app/shared';
import client from '../lib/hc';
import './RunningTrendsSection.css';
const defaults={name:'',description:'',south:35.672,north:35.695,west:139.741,east:139.765,active:true};
export default function RunningPlaceAdmin(){
  const [places,setPlaces]=useState<RunningPlace[]>([]),[id,setId]=useState<string|null>(null),[known,setKnown]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const form=useForm<PublicRunningPlaceInput>({resolver:zodResolver(publicRunningPlaceSchema),defaultValues:defaults});
  async function load(){const res=await client.api.admin['running-places'].$get();if(!res.ok)throw new Error('公共エリアの管理権限を確認できません。');const parsed=runningPlaceListSchema.parse(await res.json());setPlaces(parsed.places);setKnown(true);}
  useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
  const save=form.handleSubmit(async values=>{
    setError('');setNotice('');
    try{
      const res=id?await client.api.admin['running-places'][':id'].$put({param:{id},json:values}):await client.api.admin['running-places'].$post({json:values});
      if(!res.ok)throw new Error('集計エリアを保存できませんでした。管理者のログイン状態と入力を確認してください。');
      await load();setNotice('集計エリアを保存しました。');setId(null);form.reset(defaults);
    }catch(e){setError(e instanceof Error?e.message:'保存に失敗しました。');}
  });
  return <section className="pp-trends" aria-label="場所別統計のエリア管理">
    <div className="pp-trends-intro"><h3>公共ランニングエリア</h3><p>利用者が同意した場合のみ、このエリアの通過を集計します。自宅・個人宅・非公開の場所は登録しないでください。範囲は周辺も含む粗い矩形で、通行許可や正確なコース境界を示すものではありません。</p></div>
    <div className="pp-place-options">{places.map(p=><button key={p.id} type="button" onClick={()=>{setId(p.id);form.reset({...p,public_area_confirmed:undefined});setNotice('');}}>{p.name}{p.active?'':'（非表示）'}</button>)}</div>
    <button type="button" onClick={()=>{setId(null);form.reset(defaults);}}>新しいエリアを登録</button>
    <form className="pp-trends-consent" onSubmit={save}>
      <h3>{id?'エリアを編集':'エリアを追加'}</h3>
      <label className="pp-place-search">名称<input {...form.register('name')} placeholder="例：皇居外周・周辺エリア"/></label>
      <label className="pp-place-search">集計範囲の説明<input {...form.register('description')}/></label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>{([['south','南の緯度'],['north','北の緯度'],['west','西の経度'],['east','東の経度']] as const).map(([key,label])=><label key={key} className="pp-place-search">{label}<input type="number" step="0.0001" inputMode="decimal" {...form.register(key,{valueAsNumber:true})}/></label>)}</div>
      <p>緯度・経度の幅は0.002〜0.05度です。初期値は皇居周辺の例なので、必ず実際の公共エリアに変更・確認してください。編集を保存すると、この場所の過去の集計はリセットされます。</p>
      <label className="pp-trends-consent-label"><input type="checkbox" {...form.register('active')}/><span>利用者の場所一覧に表示する</span></label>
      <label className="pp-trends-consent-label"><input type="checkbox" {...form.register('public_area_confirmed')}/><span>公共のランニングエリアであり、個人宅などを対象にしていないことを確認しました</span></label>
      {Object.values(form.formState.errors).length>0&&<p role="alert">名称、座標の範囲、公共エリアの確認を見直してください。</p>}
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <button type="submit" disabled={!known||form.formState.isSubmitting}>{form.formState.isSubmitting?'保存中…':'集計エリアを保存'}</button>
    </form>
  </section>;
}
