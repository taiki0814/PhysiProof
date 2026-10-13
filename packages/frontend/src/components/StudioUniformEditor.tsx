import {useEffect,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {studioUniformDesignSchema,createStudioUniform,personalizeUniform} from '@my-app/shared';
import type {UniformDesign,StudioUniformDesign,UniformPersonalization} from '@my-app/shared';
import StudioUniformPreview from './StudioUniformPreview';
import UniformAssetPicker from './UniformAssetPicker';
import InfoHint from './InfoHint';
import renderer from '../lib/uniformStudio/renderer';
import {studioRendererInput} from '../lib/uniformStudio/client';
import './UniformStudio.css';

export type StudioEditorProps = {design:UniformDesign;revision:number;isTeam:boolean;editable:boolean;lettering?:UniformPersonalization;online:boolean;
  onSave:(value:UniformDesign,revision:number)=>Promise<void>;saveLabel?:string;externalDirty?:boolean;onDirtyChange?:(dirty:boolean)=>void;selectedPreset?:UniformDesign;showPresets?:boolean};
const patterns=[['none','なし'],['stripe','ストライプ'],['block','ブロック'],['shoulder','肩切替']] as const;
const emblems=[['none','なし'],['shield','シールド'],['star','スター'],['monogram','モノグラム'],['circle','サークル']] as const;
const fonts=[['athletic','スポーツ'],['serif','セリフ'],['sans','サンセリフ'],['mono','等幅']] as const;
const positions=[['high','上'],['middle','中央'],['low','下']] as const;
function Choices<T extends string>({label,options,value,onChange}:{label:string;options:readonly(readonly[T,string])[];value:unknown;onChange:(v:T)=>void}){
  return <div className="pp-uniform-field"><span>{label}</span><div className="pp-uniform-choices" role="group" aria-label={label}>{options.map(([v,name])=><button type="button" key={v} aria-pressed={v===value} onClick={()=>onChange(v)}>{name}</button>)}</div></div>;
}
export default function StudioUniformEditor({design:saved,revision,isTeam,editable,lettering,online,onSave,saveLabel,externalDirty=false,onDirtyChange,selectedPreset}:StudioEditorProps) {
  const {register,watch,setValue,reset,handleSubmit,formState:{isDirty,isSubmitting,errors}}=useForm<StudioUniformDesign>({resolver:zodResolver(studioUniformDesignSchema),defaultValues:createStudioUniform(saved)});
  const design=watch(),[view,setView]=useState<'front'|'back'>('front'),[message,setMessage]=useState(''),[ready,setReady]=useState(false),[parts,setParts]=useState<'model'|'pattern'|'emblem'>('model');
  useEffect(()=>{reset(createStudioUniform(saved));},[revision,reset]);
  useEffect(()=>{if(selectedPreset?.version===2)reset({...selectedPreset,jersey_name:watch('jersey_name'),number:watch('number')},{keepDefaultValues:true});},[selectedPreset,reset,watch]);
  const dirty=isDirty||externalDirty;
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{if(!dirty||!editable)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,editable]);
  function change<K extends keyof StudioUniformDesign>(key:K,value:StudioUniformDesign[K]) {setValue(key,value as never,{shouldDirty:true,shouldValidate:true});setMessage('');}
  const preview=isTeam&&lettering?personalizeUniform(design,lettering):design;
  const patternKey=view==='front'?'front_pattern':'back_pattern';
  return <form className="pp-uniform-editor pp-studio-editor" onSubmit={handleSubmit(async value=>{
    if(!editable||!online||!ready)return;setMessage('');
    try{await onSave(value,revision);reset(value);setMessage('ユニフォームを保存しました。');}catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした。');}
  })}>
    <div className="pp-uniform-preview-panel"><div className="pp-uniform-preview-top"><span className="pp-uniform-kicker">{isTeam?'TEAM KIT':'PERSONAL KIT'}</span><span>{dirty?'未保存':revision?'保存済み':'初期デザイン'}</span></div>
      <StudioUniformPreview design={preview} view={view} onReady={setReady}/>
      <div className="pp-uniform-view-switch"><button type="button" aria-pressed={view==='front'} onClick={()=>setView('front')}>正面</button><button type="button" aria-pressed={view==='back'} onClick={()=>setView('back')}>背面</button></div>
      {message&&<p role="status">{message}</p>}
      {Object.keys(errors).length>0&&<p role="alert">入力内容を確認してください。名前は12文字、背番号は数字3桁以内です。</p>}
      {editable&&<div className="pp-uniform-actions"><button type="submit" className="pp-uniform-save" disabled={!online||!ready||!(dirty||revision===0)||isSubmitting}>{isSubmitting?'保存中…':saveLabel||(isTeam?'チーム共通デザインを保存':'個人ユニフォームを保存')}</button>
        <button type="button" disabled={isSubmitting||!isDirty} onClick={()=>{if(window.confirm('未保存の変更を破棄しますか？'))reset(createStudioUniform(saved));}}>保存済みに戻す</button></div>}
      <button type="button" disabled={!ready} onClick={()=>{void studioRendererInput(preview,view).then(input=>{
        const blob=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${renderer.viewBox}">${renderer.render(input,{prefix:'uniform-export'})}</svg>`],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=`uniform-${view}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }).catch(e=>setMessage(e.message));}}>この面の画像を保存</button>
    </div>
    <fieldset className="pp-uniform-controls" disabled={!editable||isSubmitting}><legend className="pp-uniform-sr-only">ユニフォーム工房</legend>
      <section><div className="pp-uniform-heading"><h3>素材を組み合わせる</h3><InfoHint label="素材と保存" text="本体・表裏の柄・エンブレムを選んで組み合わせます。追加素材のバージョンは保存時に固定され、後から更新されても自分の服は変わりません。"/></div>
        <div className="pp-uniform-choices">{([['model','服本体'],['pattern','柄'],['emblem','エンブレム']] as const).map(([v,name])=><button type="button" key={v} aria-pressed={parts===v} onClick={()=>setParts(v)}>{name}</button>)}</div>
        {parts==='pattern'&&<Choices label={view==='front'?'正面の基本柄':'背面の基本柄'} options={patterns} value={design[patternKey]} onChange={v=>change(patternKey,v)}/>}
        {parts==='emblem'&&<Choices label="基本エンブレム" options={emblems} value={design.emblem} onChange={v=>change('emblem',v)}/>}
        <UniformAssetPicker key={parts} kind={parts} value={parts==='model'?design.model:parts==='pattern'&&typeof design[patternKey]==='object'?design[patternKey] as {id:string;revision:number}:parts==='emblem'&&typeof design.emblem==='object'?design.emblem:undefined}
          onSelect={ref=>change(parts==='model'?'model':parts==='pattern'?patternKey:'emblem',ref)}/>
      </section>
      <section><h3>生地・色</h3><Choices label="生地" options={[['knit','ニット'],['mesh','メッシュ'],['pique','鹿の子']]} value={design.fabric} onChange={v=>change('fabric',v)}/>
        <div className="pp-uniform-colors">{([['body','本体'],['accent','柄・差し色'],['detail','装飾'],['text','文字']] as const).map(([key,name])=><label key={key}><input type="color" aria-label={name+'の色'} {...register(`colors.${key}`)}/><span>{name}</span></label>)}</div>
        <Choices label="エンブレム位置" options={[['left','左'],['center','中央'],['right','右']]} value={design.emblem_position} onChange={v=>change('emblem_position',v)}/>
      </section>
      <section><h3>{isTeam?'共通の文字スタイル':'名前・背番号'}</h3>
        {!isTeam&&<div className="pp-uniform-input-grid"><label>名前<input {...register('jersey_name')} maxLength={12}/></label><label>背番号<input {...register('number')} maxLength={3} inputMode="numeric"/></label></div>}
        <Choices label="名前の書体" options={fonts} value={design.name_font} onChange={v=>change('name_font',v)}/>
        <Choices label="背番号の書体" options={fonts} value={design.number_font} onChange={v=>change('number_font',v)}/>
        <Choices label="名前の高さ" options={positions} value={design.name_position} onChange={v=>change('name_position',v)}/>
        <Choices label="背番号の高さ" options={positions} value={design.number_position} onChange={v=>change('number_position',v)}/>
        <label className="pp-uniform-range">名前の大きさ <output>{design.name_size}</output><input type="range" min="12" max="32" {...register('name_size',{valueAsNumber:true})}/></label>
        <label className="pp-uniform-range">背番号の大きさ <output>{design.number_size}</output><input type="range" min="60" max="150" {...register('number_size',{valueAsNumber:true})}/></label>
      </section>
    </fieldset>
  </form>;
}
