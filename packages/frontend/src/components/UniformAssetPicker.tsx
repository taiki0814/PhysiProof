import {useEffect,useState} from 'react';
import {uniformAssetListSchema,createStudioUniform} from '@my-app/shared';
import type {UniformAsset,UniformAssetRef,UniformAssetList} from '@my-app/shared';
import client from '../lib/hc';
import StudioUniformPreview from './StudioUniformPreview';
import UniformAssetThumbnail from './UniformAssetThumbnail';
import './UniformStudio.css';

export default function UniformAssetPicker({kind,value,onSelect}: {kind:UniformAsset['kind'];value?:UniformAssetRef;onSelect:(ref:UniformAssetRef)=>void}) {
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[category,setCategory]=useState('');
  const [catalog,setCatalog]=useState<UniformAssetList>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);setQuery(search);},250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    let active=true;setCatalog(undefined);setError('');
    void client.api['uniform-assets'].$get({query:{kind,search:query,category,page:String(page),limit:'12'}}).then(async res=>{
      const body=await res.json(); if(!res.ok)throw new Error('error' in body?body.error:'素材一覧を読み込めません。');
      if(active)setCatalog(uniformAssetListSchema.parse(body));
    }).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[kind,query,category,page,refresh]);
  return <div className="pp-studio-picker">
    <div className="pp-studio-search"><input aria-label="素材を検索" placeholder="素材名を検索" maxLength={80} value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="素材カテゴリ" value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">すべてのカテゴリ</option>{catalog?.categories.map(c=><option key={c}>{c}</option>)}</select><button type="button" onClick={()=>setRefresh(n=>n+1)}>再読込</button></div>
    {error?<p role="alert">{error}</p>:!catalog?<p role="status">素材を読み込み中…</p>:<>
      <div className="pp-studio-catalog">{catalog.items.map(a=><button type="button" key={a.id} aria-pressed={value?.id===a.id&&value.revision===a.revision} onClick={()=>onSelect({id:a.id,revision:a.revision})}>
        {a.kind==='model'?<StudioUniformPreview design={{...createStudioUniform(),model:{id:a.id,revision:a.revision}}} compact/>:<UniformAssetThumbnail key={refresh} asset={a}/>}
        <span>{a.name}</span><small>{a.category}</small></button>)}</div>
      {catalog.total===0&&<p>公開中の素材はありません。</p>}
      <div className="pp-studio-pagination"><button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>前へ</button><span>{page} / {Math.max(1,Math.ceil(catalog.total/12))}</span><button type="button" disabled={page*12>=catalog.total} onClick={()=>setPage(p=>p+1)}>次へ</button></div>
    </>}
  </div>;
}
