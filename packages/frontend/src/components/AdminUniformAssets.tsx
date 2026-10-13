import {useEffect,useId,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {uniformAssetMetadataSchema,uniformAssetListSchema,uniformAssetSchema,saveUniformAssetSchema,uniformModelDefinitionSchema,uniformDrawingSourceSchema,
  createStudioUniform,BUILTIN_UNIFORM_MODELS,modelFile} from '@my-app/shared';
import type {UniformAsset,UniformAssetList,UniformDrawingSource} from '@my-app/shared';
import type {z} from 'zod';
import client from '../lib/hc';
import {getUniformAsset,makeThumbnail,studioRendererInput} from '../lib/uniformStudio/client';
import converter from '../lib/uniformStudio/imageConverter';
import drawing from '../lib/uniformStudio/drawingStudio';
import renderer from '../lib/uniformStudio/renderer';
import InfoHint from './InfoHint';
import StudioUniformPreview from './StudioUniformPreview';
import './UniformStudio.css';
import '../lib/uniformStudio/drawingStudio.css';

type Metadata=z.infer<typeof uniformAssetMetadataSchema>;
const empty:Metadata={name:'',category:'カスタム',description:'',status:'draft',sort_order:0,revision:0};
function AssetThumbnail({asset}:{asset:UniformAsset}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{let live=true;if(asset.kind!=='model')void getUniformAsset(asset,true).then(r=>{if(live)setUrl(r.dataUrl||'');}).catch(()=>{});return()=>{live=false;};},[asset.id,asset.revision]);
  return asset.kind==='model'?<StudioUniformPreview design={{...createStudioUniform(),model:{id:asset.id,revision:asset.revision}}} compact/>:url?<img src={url} alt=""/>:<span>画像を読み込み中…</span>;
}
function LocalPreview({kind,json,png,colorMode,placement,scale}:{kind:UniformAsset['kind'];json:string;png:string;colorMode:'original'|'tint';placement:'body'|'all'|'repeat';scale:number}) {
  const id=useId().replace(/[^a-zA-Z0-9]/g,''),[svg,setSvg]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let live=true;setError('');
    void studioRendererInput(createStudioUniform(),'front').then(async input=>{
      if(kind==='model')input.modelProfile=uniformModelDefinitionSchema.parse(JSON.parse(json)).front;
      else if(png){const img=new Image();img.src=png;await img.decode();const asset={kind,dataUrl:png,width:img.naturalWidth,height:img.naturalHeight,colorMode,placement,scale};
        if(kind==='pattern')input.frontPatternAsset=asset;else input.emblemAsset=asset;}
      if(live)setSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${renderer.viewBox}">${renderer.render(input,{prefix:'admin-'+id})}</svg>`);
    }).catch(e=>{if(live){setSvg('');setError(e instanceof SyntaxError?'モデルJSONを確認してください。':'プレビューを生成できません。');}});
    return()=>{live=false;};
  },[kind,json,png,colorMode,placement,scale,id]);
  return <div className="pp-studio-preview">{svg?<div dangerouslySetInnerHTML={{__html:svg}}/>:<p role="status">{error||'読み込み中…'}</p>}</div>;
}
export default function AdminUniformAssets(){
  const [kind,setKind]=useState<UniformAsset['kind']>('model'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[catalog,setCatalog]=useState<UniformAssetList>(),[reload,setReload]=useState(0),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
  const [editing,setEditing]=useState<UniformAsset>(),[open,setOpen]=useState(false),[modelJson,setModelJson]=useState(modelFile(BUILTIN_UNIFORM_MODELS[0].model_definition!));
  const [png,setPng]=useState(''),[source,setSource]=useState<UniformDrawingSource>(),[colorMode,setColorMode]=useState<'original'|'tint'>('original'),[placement,setPlacement]=useState<'body'|'all'|'repeat'>('body'),[scale,setScale]=useState(100),[dirty,setDirty]=useState(false);
  const {register,reset,setValue,handleSubmit,formState:{errors,isDirty,isSubmitting}}=useForm<Metadata>({resolver:zodResolver(uniformAssetMetadataSchema),defaultValues:empty});
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);setQuery(search);},250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{let live=true;
    void client.api.admin['uniform-assets'].$get({query:{kind,search:query,page:String(page),limit:'12',status:'all'}}).then(async res=>{
      const body=await res.json();if(!res.ok)throw new Error('error' in body?body.error:'素材一覧を読み込めません。');if(live)setCatalog(uniformAssetListSchema.parse(body));
    }).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};
  },[kind,query,page,reload]);
  useEffect(()=>{if(!open||!(dirty||isDirty))return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[open,dirty,isDirty]);
  const mayDiscard=()=>!open||!(dirty||isDirty)||window.confirm('未保存の素材変更を破棄しますか？');
  async function begin(asset?:UniformAsset,clone=false) {
    if(!mayDiscard())return;setMessage('');setLoading(true);setOpen(true);setPng('');setSource(undefined);setDirty(false);
    setEditing(asset&&!clone&&!asset.builtin?asset:undefined);
    reset(asset?{name:clone||asset.builtin?asset.name+' コピー':asset.name,category:asset.category,description:asset.description,status:clone||asset.builtin?'draft':asset.status,sort_order:asset.sort_order,revision:clone||asset.builtin?0:asset.revision}:empty);
    setColorMode(asset?.color_mode||'original');setPlacement(asset?.placement||'body');setScale(asset?.scale||100);
    setModelJson(modelFile(asset?.model_definition||BUILTIN_UNIFORM_MODELS[0].model_definition!));
    try{
      if(asset&&asset.kind!=='model'){
        const result=await getUniformAsset(asset);setPng(result.dataUrl||'');
        if(asset.drawing_available){
          const res=await client.api.admin['uniform-assets'][':id'].source[':revision'].$get({param:{id:asset.id,revision:String(asset.revision)}});
          if(!res.ok)throw new Error('図形原稿を読み込めません。');setSource(uniformDrawingSourceSchema.parse(await res.json()));
        }
      }
    }catch(e){setMessage(e instanceof Error?e.message:'読み込めませんでした。');setOpen(false);}finally{setLoading(false);}
  }
  async function convert(file:File,document?:UniformDrawingSource){
    if(kind==='model')return;setLoading(true);setMessage('');
    try{const image=await converter.convert(file,{kind});setPng(image.dataUrl);setSource(document);setDirty(true);}
    catch(e){setMessage(e instanceof Error?e.message:'画像を変換できませんでした。');throw e;}finally{setLoading(false);}
  }
  function download(text:string,type:string,name:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function importModel(file:File) {
    if(file.size>100000){setMessage('モデル定義は100KB以内です。');return;}
    try {const model=uniformModelDefinitionSchema.parse(JSON.parse(await file.text()));setModelJson(modelFile(model));setDirty(true);}
    catch {setMessage('対応するモデル定義JSONではありません。');}
  }
  async function importDrawing(file:File) {
    if(file.size>2*1024*1024){setMessage('原稿は2MB以内です。');return;}
    try {const doc=uniformDrawingSourceSchema.parse(JSON.parse(await file.text()));
      if(kind==='model'||doc.document.kind!==kind)throw new Error();
      drawing.open({kind,source:doc,onUse:async data=>{await convert(data.file,data.source);setPlacement(data.placement);}});
    }catch {setMessage('この素材の図形原稿ではありません。');}
  }
  return <section className="pp-assets-admin">
    <div className="pp-uniform-heading"><h2>素材ライブラリ</h2><InfoHint label="素材の追加・更新" text="完成品テンプレートとは別に、服本体・柄・エンブレムを追加できます。下書きは管理者だけ、公開中は工房で選択可能です。更新は新バージョンとして保存され、非表示にしても既存の服は変わりません。"/></div>
    <div className="pp-uniform-choices">{([['model','服本体'],['pattern','柄'],['emblem','エンブレム']] as const).map(([v,name])=><button key={v} type="button" disabled={loading||isSubmitting} aria-pressed={kind===v} onClick={()=>{if(mayDiscard()){setKind(v);setPage(1);setOpen(false);setCatalog(undefined);}}}>{name}</button>)}</div>
    <div className="pp-studio-search"><input aria-label="管理素材検索" placeholder="素材名を検索" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)}/><button type="button" disabled={loading||isSubmitting} onClick={()=>void begin()}>新しい素材を追加</button></div>
    {catalog&&!catalog.storage_ready&&<p role="alert">画像保存先R2が未接続です。服本体のモデル定義のみ登録できます。</p>}
    <div className="pp-studio-catalog">{catalog?.items.map(a=><button type="button" key={a.id} disabled={loading||isSubmitting} onClick={()=>void begin(a)}><AssetThumbnail asset={a}/><span>{a.name}</span><small>{a.builtin?'標準モデル · コピー可':a.status==='published'?'公開中':a.status==='hidden'?'非表示':'下書き'} · v{a.revision}</small></button>)}</div>
    <div className="pp-studio-pagination"><button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>前へ</button><span>{page} / {Math.max(1,Math.ceil((catalog?.total||0)/12))}</span><button type="button" disabled={page*12>=(catalog?.total||0)} onClick={()=>setPage(p=>p+1)}>次へ</button></div>
    {message&&<p role="status">{message}</p>}
    {open&&<form onSubmit={handleSubmit(async metadata=>{
      if(!navigator.onLine||loading)return;setMessage('');
      try{
        const payload=saveUniformAssetSchema.parse(kind==='model'?{...metadata,kind,model_definition:JSON.parse(modelJson)}:
          {...metadata,kind,png_data_url:png,thumbnail_data_url:await makeThumbnail(png),color_mode:colorMode,placement,scale,...(source?{drawing_source:source}:{})});
        const res=editing?await client.api.admin['uniform-assets'][':id'].$put({param:{id:editing.id},json:payload}):await client.api.admin['uniform-assets'].$post({json:payload});
        const body=await res.json();if(!res.ok||!('asset' in body))throw new Error('error' in body?body.error:'保存できませんでした。');
        const saved=uniformAssetSchema.parse(body.asset);setEditing(saved);reset({...metadata,revision:saved.revision});setDirty(false);setReload(n=>n+1);setMessage('素材を保存しました。');
      }catch(e){setMessage(e instanceof SyntaxError?'JSON形式を確認してください。':e instanceof Error?e.message:'保存できませんでした。');}
    })}>
      <fieldset disabled={loading||isSubmitting} style={{border:0,padding:0,minWidth:0}}><legend>{editing?'素材を更新':'素材を追加'} {editing&&' · v'+editing.revision}</legend>
        <div className="pp-assets-form"><div className="pp-assets-fields">
          <label>素材名<input {...register('name')} maxLength={60}/></label><label>カテゴリ<input {...register('category')} maxLength={30}/></label>
          <label>説明<textarea {...register('description')} maxLength={160}/></label>
          <label>公開状態<select {...register('status')}><option value="draft">下書き</option><option value="published">公開中</option><option value="hidden">非表示</option></select></label>
          <label>表示順<input type="number" {...register('sort_order',{valueAsNumber:true})} min="0" max="999999"/></label>
          {kind==='model'?<>
            <label>モデルJSONを読み込む<input type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importModel(file);}}/></label>
            <label>モデル定義<textarea className="pp-model-json" value={modelJson} onChange={e=>{setModelJson(e.target.value);setDirty(true);}}/></label>
            <button type="button" onClick={()=>download(modelJson,'application/json','uniform-model.json')}>モデル定義を書き出す</button>
          </>:<>
            <label>PNG / JPEG / SVG<input type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void convert(file).catch(()=>{});}}/></label>
            <div className="pp-assets-actions"><button type="button" onClick={()=>drawing.open({kind,onUse:async data=>{await convert(data.file,data.source);setValue('name',data.name,{shouldDirty:true});setPlacement(data.placement);}})}>図形から新しく作る</button>
              {source&&<button type="button" onClick={()=>drawing.open({kind,source,onUse:async data=>{await convert(data.file,data.source);setPlacement(data.placement);}})}>図形原稿を編集</button>}
              {source&&<button type="button" onClick={()=>download(JSON.stringify(source,null,2),'application/json','uniform-drawing.json')}>原稿を書き出す</button>}
            </div>
            <label>図形原稿JSONを読み込む<input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importDrawing(f);}}/></label>
            <label>配色<select value={colorMode} onChange={e=>{setColorMode(e.target.value as 'original'|'tint');setDirty(true);}}><option value="original">元の配色を使う</option><option value="tint">ユーザーの指定色で着色</option></select></label>
            {kind==='pattern'&&<><label>配置<select value={placement} onChange={e=>{setPlacement(e.target.value as typeof placement);setDirty(true);}}><option value="body">身頃のみ</option><option value="all">全面</option><option value="repeat">繰り返し</option></select></label><label>スケール {scale}%<input type="range" min="20" max="180" value={scale} onChange={e=>{setScale(Number(e.target.value));setDirty(true);}}/></label></>}
            {png&&<img className="pp-assets-image" src={png} alt="素材画像"/>}
          </>}
        </div><LocalPreview kind={kind} json={modelJson} png={png} colorMode={colorMode} placement={placement} scale={scale}/></div>
        {Object.keys(errors).length>0&&<p role="alert">素材名・カテゴリ・表示順を確認してください。</p>}
        <div className="pp-assets-actions"><button type="submit" disabled={(!dirty&&!isDirty&&!!editing)||kind!=='model'&&!png}>新バージョンとして保存</button>
          <button type="button" onClick={()=>{if(mayDiscard())setOpen(false);}}>閉じる</button>
          {editing&&<><button type="button" onClick={()=>void begin(editing,true)}>複製</button><button type="button" onClick={()=>{if(window.confirm('工房の新規選択から非表示にしますか？既存ユニフォームは変わりません。'))void client.api.admin['uniform-assets'][':id'].hide.$post({param:{id:editing.id}}).then(async res=>{if(!res.ok)throw new Error('非表示にできませんでした。');setOpen(false);setReload(n=>n+1);setMessage('非表示にしました。');}).catch(e=>setMessage(e.message));}}>非表示にする</button></>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
