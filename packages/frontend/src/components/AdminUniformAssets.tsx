import {useEffect,useId,useRef,useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {uniformAssetMetadataSchema,uniformAssetListSchema,uniformAssetSchema,saveUniformAssetSchema,uniformModelDefinitionSchema,uniformDrawingSourceSchema,
  createStudioUniform,BUILTIN_UNIFORM_MODELS,modelFile,suggestUniformRegions,uniformColorRegionsSchema} from '@my-app/shared';
import type {UniformAsset,UniformAssetList,UniformDrawingSource,UniformColorRegions} from '@my-app/shared';
import type {z} from 'zod';
import client from '../lib/hc';
import {getUniformAsset,getUniformRegions,makeThumbnail,studioRendererInput,primeUniformAsset} from '../lib/uniformStudio/client';
import {regionImagePixels} from '../lib/uniformStudio/regions';
import UniformRegionEditor from './UniformRegionEditor';
import UniformAssetThumbnail from './UniformAssetThumbnail';
import converter from '../lib/uniformStudio/imageConverter';
import drawing from '../lib/uniformStudio/drawingStudio';
import renderer from '../lib/uniformStudio/renderer';
import InfoHint from './InfoHint';
import AppIcon from './AppIcon';
import StudioUniformPreview from './StudioUniformPreview';
import './UniformStudio.css';
import '../lib/uniformStudio/drawingStudio.css';

type Metadata=z.infer<typeof uniformAssetMetadataSchema>;
const empty:Metadata={name:'',category:'カスタム',description:'',status:'draft',sort_order:0,revision:0};
function AssetThumbnail({asset}:{asset:UniformAsset}) {
  return asset.kind==='model'?<StudioUniformPreview design={{...createStudioUniform(),model:{id:asset.id,revision:asset.revision}}} compact/>:<UniformAssetThumbnail asset={asset}/>;
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
  const [colorRegions,setColorRegions]=useState<UniformColorRegions>(),[regionKey,setRegionKey]=useState(0);
  const [regionBusy,setRegionBusy]=useState(false);
  const {register,reset,setValue,handleSubmit,formState:{errors,isDirty,isSubmitting}}=useForm<Metadata>({resolver:zodResolver(uniformAssetMetadataSchema),defaultValues:empty});
  const editorHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(open){editorHeading.current?.focus({preventScroll:true});editorHeading.current?.scrollIntoView({block:'start'});}},[open]);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);setQuery(search);},250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{let live=true;
    void client.api.admin['uniform-assets'].$get({query:{kind,search:query,page:String(page),limit:'12',status:'all'}}).then(async res=>{
      const body=await res.json();if(!res.ok)throw new Error('error' in body?body.error:'素材一覧を読み込めません。');if(live)setCatalog(uniformAssetListSchema.parse(body));
    }).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};
  },[kind,query,page,reload]);
  useEffect(()=>{if(!open||!(dirty||isDirty))return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[open,dirty,isDirty]);
  const mayDiscard=()=>!open||!(dirty||isDirty)||window.confirm('未保存の素材変更を破棄しますか？');
  async function begin(asset?:UniformAsset,clone=false) {
    if(!mayDiscard())return;setMessage('');setLoading(true);setOpen(true);setPng('');setSource(undefined);setColorRegions(undefined);setRegionKey(n=>n+1);setDirty(false);
    setEditing(asset&&!clone&&!asset.builtin?asset:undefined);
    reset(asset?{name:clone||asset.builtin?asset.name+' コピー':asset.name,category:asset.category,description:asset.description,status:clone||asset.builtin?'draft':asset.status,sort_order:asset.sort_order,revision:clone||asset.builtin?0:asset.revision}:empty);
    setColorMode(asset?.color_mode||'original');setPlacement(asset?.placement||'body');setScale(asset?.scale||100);
    setModelJson(modelFile(asset?.model_definition||BUILTIN_UNIFORM_MODELS[0].model_definition!));
    try{
      if(asset&&asset.kind!=='model'){
        const result=await getUniformAsset(asset);
        if(result.asset.color_regions)setColorRegions(await getUniformRegions(asset));
        setPng(result.dataUrl||'');
        if(asset.drawing_available){
          const res=await client.api.admin['uniform-assets'][':id'].source[':revision'].$get({param:{id:asset.id,revision:String(asset.revision)}});
          if(!res.ok)throw new Error('図形原稿を読み込めません。');setSource(uniformDrawingSourceSchema.parse(await res.json()));
        }
      }
    }catch(e){setMessage(e instanceof Error?e.message:'読み込めませんでした。');setOpen(false);}finally{setLoading(false);}
  }
  async function convert(file:File,document?:UniformDrawingSource){
    if(kind==='model')return;setLoading(true);setMessage('');
    try{const image=await converter.convert(file,{kind});
      const base=await regionImagePixels(image.dataUrl);let regions:UniformColorRegions|undefined;
      try{regions=suggestUniformRegions(base.image.data,base.width,base.height,6);}catch{/* transparent artwork may be kept without regions */}
      setPng(image.dataUrl);setSource(document);setColorRegions(regions);setRegionKey(n=>n+1);setColorMode('original');setDirty(true);
      if(regions)setMessage('色から部位候補を作りました。名前と範囲を確認し、同じ色の別部位は追加・タップで分けてください。');}
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
    <div className="pp-studio-search"><input type="search" aria-label="管理素材検索" placeholder="素材名を検索" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)}/><button className="pp-admin-primary" type="button" disabled={loading||isSubmitting} onClick={()=>void begin()}><AppIcon name="plus" /> 新しい素材を追加</button><button type="button" onClick={()=>setReload(n=>n+1)}><AppIcon name="refresh" /> 再読込</button></div>
    {catalog&&!catalog.storage_ready&&<p role="alert">画像保存先が未接続です。服本体のモデル定義のみ登録できます。</p>}
    {catalog?.storage&&<div className="pp-uniform-heading pp-assets-storage"><small>{catalog.storage.provider==='kv'?'KV画像保存':catalog.storage.provider==='r2'?'画像保存':'保存先未設定'} · {(catalog.storage.used_bytes/1000000).toFixed(1)} / {catalog.storage.capacity_bytes/1000000} MB · 本日 {catalog.storage.writes_reserved_today} / {catalog.storage.daily_object_write_budget} 書込</small><InfoHint label="画像保存の無料枠と反映" text="容量は処理中・失敗したアップロードの予約分を含みます。画像1回の登録で2書込、部位マップまたは図形原稿付きは3書込を使用し、回数は日本時間9時にリセットします。無料枠保護のため上限では保存を停止します。アカウントの他用途のKV使用量は含みません。KVの画像反映には1分以上かかる場合があり、30秒間隔で2回まで自動再確認します。表示されない場合は再読込してください。"/></div>}
    <div className="pp-studio-catalog">{catalog?.items.map(a=><button type="button" key={a.id} disabled={loading||isSubmitting} onClick={()=>void begin(a)}><AssetThumbnail key={reload} asset={a}/><span>{a.name}</span><small>{a.builtin?'標準モデル · コピー可':a.status==='published'?'公開中':a.status==='hidden'?'非表示':'下書き'} · v{a.revision}</small></button>)}</div>
    {catalog&&catalog.items.length===0&&<p className="pp-admin-uniforms-empty">{query?'条件に一致する素材がありません。':'素材はまだありません。「新しい素材を追加」から登録できます。'}</p>}
    <div className="pp-studio-pagination"><button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>前へ</button><span>{page} / {Math.max(1,Math.ceil((catalog?.total||0)/12))}</span><button type="button" disabled={page*12>=(catalog?.total||0)} onClick={()=>setPage(p=>p+1)}>次へ</button></div>
    {message&&<p role="status">{message}</p>}
    {open&&<form className="pp-assets-editor" onSubmit={handleSubmit(async metadata=>{
      if(loading||regionBusy)return;if(!navigator.onLine){setMessage('オフラインでは保存できません。接続後に再試行してください。下書きは残っています。');return;}setMessage('');
      try{
        if(colorRegions&&!uniformColorRegionsSchema.safeParse(colorRegions).success)throw new Error('部位名と塗り分け範囲を確認してください。少なくとも1か所を部位に割り当ててください。');
        const payload=saveUniformAssetSchema.parse(kind==='model'?{...metadata,kind,model_definition:JSON.parse(modelJson)}:
          {...metadata,kind,png_data_url:png,thumbnail_data_url:await makeThumbnail(png),color_mode:colorRegions?'original':colorMode,placement,scale,...(source?{drawing_source:source}:{}),...(colorRegions?{color_regions:colorRegions}:{})});
        const res=editing?await client.api.admin['uniform-assets'][':id'].$put({param:{id:editing.id},json:payload}):await client.api.admin['uniform-assets'].$post({json:payload});
        const body=await res.json();if(!res.ok||!('asset' in body))throw new Error('error' in body?body.error:'保存できませんでした。');
        const saved=uniformAssetSchema.parse(body.asset);if(kind!=='model'&&'thumbnail_data_url' in payload)primeUniformAsset(saved,png,payload.thumbnail_data_url,colorRegions);setEditing(saved);reset({...metadata,revision:saved.revision});setDirty(false);setReload(n=>n+1);setMessage(kind==='model'?'素材を保存しました。':'素材を保存しました。他の端末への画像反映には1分以上かかる場合があります。');
      }catch(e){setMessage(e instanceof SyntaxError?'JSON形式を確認してください。':e instanceof Error?e.message:'保存できませんでした。');}
    })}>
      <div className="pp-assets-editor-heading"><h3 ref={editorHeading} tabIndex={-1}>{editing?'素材を更新':'素材を追加'} {editing&&' · v'+editing.revision}</h3>
        <button type="button" disabled={loading||isSubmitting||regionBusy} onClick={()=>{if(mayDiscard())setOpen(false);}}>編集を閉じる</button></div>
      <fieldset disabled={loading||isSubmitting||regionBusy} style={{border:0,padding:0,minWidth:0}}><legend className="pp-assets-sr-only">素材の編集内容</legend>
        <div className="pp-assets-form"><div className="pp-assets-fields">
          <label>素材名<input {...register('name')} maxLength={60}/></label><label>カテゴリ<input {...register('category')} maxLength={30}/></label>
          <label>説明<textarea {...register('description')} maxLength={160}/></label>
          <label>公開状態<select {...register('status')}><option value="draft">下書き</option><option value="published">公開中</option><option value="hidden">非表示</option></select></label>
          <label>表示順<input type="number" {...register('sort_order',{valueAsNumber:true})} min="0" max="999999"/></label>
          {kind==='model'?<>
            <InfoHint label="モデル定義とは" text="シャツの外形・袖・襟・縫い目を正面／背面のSVG座標で定義した、服本体の設計データです。新しい服の形を追加するための上級者向け機能で、柄・エンブレムの追加や部位別カラーには不要です。通常は標準モデルを選ぶだけで使えます。"/>
            <label>モデルJSONを読み込む<input type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importModel(file);}}/></label>
            <label>モデル定義<textarea className="pp-model-json" value={modelJson} onChange={e=>{setModelJson(e.target.value);setDirty(true);}}/></label>
            <button type="button" onClick={()=>download(modelJson,'application/json','uniform-model.json')}>モデル定義を書き出す</button>
          </>:<>
            <fieldset className="pp-assets-methods"><legend>素材の作成方法</legend>
            <div className="pp-assets-method"><strong>01　画像を読み込む</strong><p>手持ちの画像を素材として登録します。</p>
            <label>PNG / JPEG / SVG<input type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void convert(file).catch(()=>{});}}/></label></div>
            <div className="pp-assets-method"><strong>02　図形で作る</strong><p>エディターでオリジナルの柄やエンブレムを描けます。</p>
            <div className="pp-assets-actions"><button type="button" onClick={()=>drawing.open({kind,onUse:async data=>{await convert(data.file,data.source);setValue('name',data.name,{shouldDirty:true});setPlacement(data.placement);}})}>図形から新しく作る</button>
              {source&&<button type="button" onClick={()=>drawing.open({kind,source,onUse:async data=>{await convert(data.file,data.source);setPlacement(data.placement);}})}>図形原稿を編集</button>}
              {source&&<button type="button" onClick={()=>download(JSON.stringify(source,null,2),'application/json','uniform-drawing.json')}>原稿を書き出す</button>}
            </div>
            </div>
            <div className="pp-assets-method"><strong>03　原稿から再開する</strong><p>書き出した図形原稿を読み込み、続きを編集します。</p>
            <label>図形原稿JSONを読み込む<input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importDrawing(f);}}/></label></div>
            </fieldset>
            <label>配色<select value={colorRegions?'original':colorMode} disabled={!!colorRegions} onChange={e=>{setColorMode(e.target.value as 'original'|'tint');setDirty(true);}}><option value="original">元の配色を使う</option><option value="tint">全体を1色で着色（従来方式）</option></select></label>
            {colorRegions&&<small>部位別カラーが有効です。ユーザーは部位ごとに色を変更でき、未変更部分は元画像を維持します。</small>}
            {kind==='pattern'&&<><label>配置<select value={placement} onChange={e=>{setPlacement(e.target.value as typeof placement);setDirty(true);}}><option value="body">身頃のみ</option><option value="all">全面</option><option value="repeat">繰り返し</option></select></label><label>スケール {scale}%<input type="range" min="20" max="180" value={scale} onChange={e=>{setScale(Number(e.target.value));setDirty(true);}}/></label></>}
            {png&&<img className="pp-assets-image" src={png} alt="素材画像"/>}
            {png&&<UniformRegionEditor key={regionKey} png={png} value={colorRegions} disabled={loading||isSubmitting||regionBusy} onBusyChange={setRegionBusy} onChange={v=>{setColorRegions(v);if(v)setColorMode('original');setDirty(true);}}/>}
          </>}
        </div><LocalPreview kind={kind} json={modelJson} png={png} colorMode={colorMode} placement={placement} scale={scale}/></div>
        {Object.keys(errors).length>0&&<p role="alert">素材名・カテゴリ・表示順を確認してください。</p>}
        <div className="pp-assets-actions pp-assets-save-actions"><button type="submit" disabled={(!dirty&&!isDirty&&!!editing)||kind!=='model'&&(!png||!catalog?.storage_ready)}>新バージョンとして保存</button>
          <button type="button" onClick={()=>{if(mayDiscard())setOpen(false);}}>閉じる</button>
          {editing&&<><button type="button" onClick={()=>void begin(editing,true)}>複製</button><button type="button" onClick={()=>{if(window.confirm('工房の新規選択から非表示にしますか？既存ユニフォームは変わりません。'))void client.api.admin['uniform-assets'][':id'].hide.$post({param:{id:editing.id}}).then(async res=>{if(!res.ok)throw new Error('非表示にできませんでした。');setOpen(false);setReload(n=>n+1);setMessage('非表示にしました。');}).catch(e=>setMessage(e.message));}}>非表示にする</button></>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
