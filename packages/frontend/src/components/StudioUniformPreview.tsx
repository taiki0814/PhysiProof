import {useEffect, useId, useState} from 'react';
import type {StudioUniformDesign} from '@my-app/shared';
import type {UniformPreviewProps} from './UniformPreview';
import renderer from '../lib/uniformStudio/renderer';
import {studioRendererInput} from '../lib/uniformStudio/client';
import './UniformStudio.css';

export default function StudioUniformPreview({design,view='front',compact=false,label='ユニフォーム',className='',onReady}: Omit<UniformPreviewProps,'design'> & {design:StudioUniformDesign;onReady?:(ready:boolean)=>void}) {
  const id=useId().replace(/[^a-zA-Z0-9]/g,'');
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const key=JSON.stringify(design);
  useEffect(()=>{
    let active=true; setSvg('');setError('');onReady?.(false);
    void studioRendererInput(design,view,compact).then(input=>{
      if(active){setSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${renderer.viewBox}">${renderer.render(input,{prefix:'pp-'+id,thumbnail:compact})}</svg>`);onReady?.(true);}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'素材を読み込めません。');});
    return()=>{active=false;};
  },[key,view,compact,id,retry,onReady]);
  return <div className={`pp-studio-preview ${compact?'is-compact':''} ${className}`} role="img" aria-label={label}>
    {svg?<div dangerouslySetInnerHTML={{__html:svg}}/>:error?<div role="alert"><small>{error}</small><button type="button" onClick={()=>setRetry(n=>n+1)}>再読込</button></div>:<small>読み込み中…</small>}
  </div>;
}
