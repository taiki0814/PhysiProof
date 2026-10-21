import {useEffect,useRef,useState} from 'react';
import {suggestUniformRegions,decodeRegionLabels,encodeRegionLabels,fillUniformRegion,paintUniformRegion,UNIFORM_REGION_LIMIT} from '@my-app/shared';
import type {UniformColorRegions} from '@my-app/shared';
import {regionImagePixels} from '../lib/uniformStudio/regions';
import InfoHint from './InfoHint';
import './UniformRegions.css';

const markers=['#ff6688','#4ed9e7','#f2cf54','#a68cff','#70d59a','#ed9e56','#cd85d5','#a9d2f5','#f789ac','#99c77c','#a4a0ed','#e4bb94','#7cd2c8','#e1a3a3','#c8cc84','#bcadce'];
type Pixels=Awaited<ReturnType<typeof regionImagePixels>>;
export default function UniformRegionEditor({png,value,onChange,disabled=false,onBusyChange}:{png:string;value?:UniformColorRegions;onChange:(v:UniformColorRegions|undefined)=>void;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}){
  const [base,setBase]=useState<Pixels>(),[error,setError]=useState(''),[active,setActive]=useState(1),[tool,setTool]=useState<'fill'|'global'|'brush'|'erase'>('fill'),[tolerance,setTolerance]=useState(28),[radius,setRadius]=useState(12),[count,setCount]=useState(6),[overlay,setOverlay]=useState(true),[busy,setBusy]=useState(false),[undoCount,setUndoCount]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null),current=useRef(value),history=useRef<(UniformColorRegions|undefined)[]>([]),working=useRef<Uint8Array>(),drag=useRef<{id:number;x:number;y:number}|null>(null),raf=useRef<number>(),autoFrame=useRef<number>();
  current.current=value;
  useEffect(()=>{let live=true;setBase(undefined);setError('');history.current=[];setUndoCount(0);
    void regionImagePixels(png).then(v=>{if(live)setBase(v);}).catch(()=>{if(live)setError('部位編集用の画像を読み込めません。');});
    return()=>{live=false;if(raf.current)cancelAnimationFrame(raf.current);};
  },[png]);
  useEffect(()=>()=>{if(autoFrame.current)cancelAnimationFrame(autoFrame.current);onBusyChange?.(false);},[onBusyChange]);
  function draw(labels?:Uint8Array){
    if(!base||!canvas.current)return;
    const context=canvas.current.getContext('2d')!,image=context.createImageData(base.width,base.height);image.data.set(base.image.data);
    const map=labels||(value?decodeRegionLabels(value):new Uint8Array(base.width*base.height));
    if(overlay)for(let i=0;i<map.length;i++)if(map[i]&&image.data[i*4+3]){
      const c=markers[map[i]-1],weight=map[i]===active ? 0.75 : 0.38;
      for(let k=0;k<3;k++)image.data[i*4+k]=image.data[i*4+k]*(1-weight)+parseInt(c.slice(1+k*2,3+k*2),16)*weight;
    }
    context.putImageData(image,0,0);
  }
  useEffect(()=>{if(!drag.current)draw();},[base,value,active,overlay]);
  function remember(){history.current.push(current.current?structuredClone(current.current):undefined);if(history.current.length>12)history.current.shift();setUndoCount(history.current.length);}
  function commit(next:UniformColorRegions|undefined){current.current=next;if(next?.parts.length&&!next.parts.some(p=>p.id==='part-'+active))setActive(Number(next.parts[0].id.slice(5)));onChange(next);setError('');}
  function blank():UniformColorRegions {return {version:1,width:base!.width,height:base!.height,parts:[],labels_base64:encodeRegionLabels(new Uint8Array(base!.width*base!.height))};}
  function addPart(){if(!base)return;const next=structuredClone(value||blank()),id=Array.from({length:UNIFORM_REGION_LIMIT},(_,i)=>i+1).find(n=>!next.parts.some(p=>p.id==='part-'+n));if(!id)return;
    remember();next.parts.push({id:'part-'+id,name:'部位 '+id,color:'#808080'});setActive(id);commit(next);}
  function removePart(){if(!value)return;remember();const next=structuredClone(value),labels=decodeRegionLabels(next);for(let i=0;i<labels.length;i++)if(labels[i]===active)labels[i]=0;
    next.parts=next.parts.filter(p=>p.id!=='part-'+active);next.labels_base64=encodeRegionLabels(labels);setActive(next.parts.length?Number(next.parts[0].id.slice(5)):1);commit(next.parts.length?next:undefined);}
  function point(e:React.PointerEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(base!.width-1,(e.clientX-r.left)*base!.width/r.width)),y:Math.max(0,Math.min(base!.height-1,(e.clientY-r.top)*base!.height/r.height))};}
  function end(e:React.PointerEvent<HTMLCanvasElement>,cancel=false){if(!drag.current||drag.current.id!==e.pointerId)return;drag.current=null;
    if(raf.current)cancelAnimationFrame(raf.current);
    if(cancel){history.current.pop();setUndoCount(history.current.length);draw();}
    else if(value&&working.current)commit({...value,labels_base64:encodeRegionLabels(working.current)});
    working.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
  const selected=value?.parts.find(p=>p.id==='part-'+active);
  return <section className="pp-region-editor" aria-label="部位分けエディター">
    <div className="pp-uniform-heading"><h4>ユーザーが変えられる部位</h4><InfoHint label="部位分け" text="色で自動分けした後、別の部位を追加してつながった範囲をタップすると、同じ色でも別々に変更できます。ブラシで細部を修正できます。未割り当ては元画像を維持し、透明部分は塗りません。処理はこのブラウザ内で行います。"/></div>
    <div className="pp-region-toolbar"><label>自動分けの色数<select aria-label="自動分けの色数" value={count} onChange={e=>setCount(Number(e.target.value))}>{[2,4,6,8,12,16].map(n=><option key={n} value={n}>{n}色まで</option>)}</select></label>
      <button type="button" disabled={!base||busy||disabled} onClick={()=>{if(value&&!window.confirm('現在の部位分けを自動分けで置き換えますか？取り消しで戻せます。'))return;setBusy(true);onBusyChange?.(true);autoFrame.current=requestAnimationFrame(()=>{try{remember();const next=suggestUniformRegions(base!.image.data,base!.width,base!.height,count);setActive(Number(next.parts[0].id.slice(5)));commit(next);}catch(e){setError(e instanceof Error?e.message:'自動分けできません。');}finally{setBusy(false);onBusyChange?.(false);}});}}>{busy?'自動分け中…':'色で自動分け'}</button>
      <button type="button" disabled={!base||(value?.parts.length||0)>=UNIFORM_REGION_LIMIT} onClick={addPart}>部位を追加</button>
      <button type="button" disabled={!undoCount} onClick={()=>{const previous=history.current.pop();setUndoCount(history.current.length);commit(previous);}}>取り消し</button>
    </div>
    {value&&<>
      <div className="pp-region-parts" role="group" aria-label="編集する部位">{value.parts.map(p=><button type="button" key={p.id} aria-pressed={p.id==='part-'+active} onClick={()=>setActive(Number(p.id.slice(5)))}><span style={{background:markers[Number(p.id.slice(5))-1]}}/>{p.name}</button>)}</div>
      {selected&&<div className="pp-region-toolbar"><label>部位の名前<input aria-label="選択中の部位名" value={selected.name} maxLength={30} onChange={e=>commit({...value,parts:value.parts.map(p=>p.id===selected.id?{...p,name:e.target.value}:p)})}/></label><button type="button" onClick={removePart}>選択部位を外す</button></div>}
      <div className="pp-region-tools" role="group" aria-label="部位の選択方法">{([['fill','つながった範囲'],['global','同じ色すべて'],['brush','ブラシ'],['erase','未割り当てに戻す']] as const).map(([id,name])=><button key={id} type="button" aria-pressed={tool===id} onClick={()=>setTool(id)}>{name}</button>)}</div>
      {tool==='fill'||tool==='global'?<label>色の許容範囲 {tolerance}<input type="range" aria-label="色の許容範囲" min="0" max="100" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))}/></label>:<label>ブラシの太さ {radius*2}<input type="range" aria-label="ブラシの太さ" min="2" max="40" value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label>}
    </>}
    {base&&<canvas ref={canvas} width={base.width} height={base.height} role="img" aria-label="画像をタップして部位を指定" className={value?'is-editable':''}
      onPointerDown={e=>{if(!value||!selected||busy||disabled||drag.current||e.button!==0)return;const p=point(e);remember();
        if(tool==='fill'||tool==='global'){
          const labels=fillUniformRegion(base.image.data,base.width,base.height,decodeRegionLabels(value),p.x,p.y,active,tolerance,tool==='global'),i=(Math.floor(p.y)*base.width+Math.floor(p.x))*4;
          const color='#'+Array.from(base.image.data.subarray(i,i+3)).map(n=>n.toString(16).padStart(2,'0')).join('');
          commit({...value,labels_base64:encodeRegionLabels(labels),parts:value.parts.map(part=>part.id===selected.id?{...part,color}:part)});
        }else{working.current=decodeRegionLabels(value);drag.current={id:e.pointerId,...p};e.currentTarget.setPointerCapture(e.pointerId);paintUniformRegion(base.image.data,base.width,base.height,working.current,p.x,p.y,radius,tool==='erase'?0:active);draw(working.current);}}}
      onPointerMove={e=>{if(!drag.current||!working.current||drag.current.id!==e.pointerId)return;const p=point(e),from=drag.current,steps=Math.max(1,Math.ceil(Math.hypot(p.x-from.x,p.y-from.y)/Math.max(1,radius/2)));
        for(let i=1;i<=steps;i++)paintUniformRegion(base.image.data,base.width,base.height,working.current,from.x+(p.x-from.x)*i/steps,from.y+(p.y-from.y)*i/steps,radius,tool==='erase'?0:active);
        drag.current={id:e.pointerId,...p};if(raf.current)cancelAnimationFrame(raf.current);raf.current=requestAnimationFrame(()=>draw(working.current));}}
      onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>end(e,true)}/>}
    <label className="pp-region-check"><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/>部位の目印を重ねて表示（元画像の色は変わりません）</label>
    {!value&&<p>「色で自動分け」か「部位を追加」で開始できます。最大16部位です。</p>}
    {value&&<button type="button" onClick={()=>{remember();commit(undefined);}}>部位分けを解除</button>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
