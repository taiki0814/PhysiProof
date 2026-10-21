import type {UniformAssetRef,UniformPartPalette} from '@my-app/shared';
import {getUniformAsset,uniformAccountKey} from '../lib/uniformStudio/client';
import {useUniformResource} from '../lib/uniformStudio/useUniformResource';
import './UniformRegions.css';

export default function UniformPartColors({assetRef,label,palette,onChange}:{assetRef:UniformAssetRef;label:string;palette?:UniformPartPalette;onChange:(p:UniformPartPalette)=>void}){
  const {value,error,reload}=useUniformResource(()=>getUniformAsset(assetRef,true),[assetRef.id,assetRef.revision,uniformAccountKey()]);
  if(error)return <div className="pp-region-palette"><p role="status">{error}</p><button type="button" onClick={reload}>部位を再読込</button></div>;
  if(!value)return <p role="status">部位を読み込み中…</p>;
  const regions=value.asset.color_regions;
  if(!regions)return <p className="pp-region-palette">この素材は部位分け未設定です。管理者が部位を設定した新しいバージョンを選ぶと、個別に色を変更できます。</p>;
  return <div className="pp-region-palette"><h4>{label}の部位カラー</h4>
    <div className="pp-region-palette-grid">{regions.parts.map(p=><label key={p.id}><input type="color" aria-label={label+'・'+p.name+'の色'} value={palette?.[p.id]||p.color} onInput={e=>onChange({...palette,[p.id]:e.currentTarget.value})} onChange={e=>onChange({...palette,[p.id]:e.target.value})}/><span>{p.name}</span></label>)}</div>
    <button type="button" disabled={!palette||!Object.keys(palette).length} onClick={()=>onChange({})}>この素材の色を元画像に戻す</button>
  </div>;
}
