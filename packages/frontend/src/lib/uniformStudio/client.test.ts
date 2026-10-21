import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {BUILTIN_UNIFORM_MODELS,createStudioUniform,uniformRegionSummary,encodeRegionLabels} from '@my-app/shared';
import {getUniformAsset,getUniformRegions,studioRendererInput,primeUniformAsset,responseDataUrl,UniformImagePendingError,uniformAccountKey} from './client';
import {recolorRegionImage} from './regions';
vi.mock('./regions',()=>({recolorRegionImage:vi.fn(async (_png,_regions,palette)=>'painted:'+JSON.stringify(palette))}));

describe('versioned uniform image client',()=>{
  let uid:string,fetchMock:ReturnType<typeof vi.fn>;
  const asset=()=>({...BUILTIN_UNIFORM_MODELS[0],id:crypto.randomUUID(),kind:'pattern' as const,builtin:false,model_definition:null,
    width:200,height:200,image_path:'/image/full',thumbnail_path:'/image/thumbnail'});
  beforeEach(()=>{
    uid=crypto.randomUUID();fetchMock=vi.fn();
    vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='physiproof_test_uid'?uid:null});
    vi.stubGlobal('fetch',fetchMock);
    vi.stubGlobal('FileReader',class {result='';onload?:()=>void;async readAsDataURL(blob:Blob){this.result='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload?.();}});
    vi.stubGlobal('Image',class {src='';naturalWidth=96;naturalHeight=48;async decode(){}});
  });
  afterEach(()=>{vi.unstubAllGlobals();});
  const regions=()=>({version:1 as const,width:2,height:1,parts:[{id:'part-1',name:'Left',color:'#ff0000'},{id:'part-2',name:'Right',color:'#ff0000'}],labels_base64:encodeRegionLabels(new Uint8Array([1,2]))});
  it('shares part-map reads, evicts propagation failures and keeps them account-scoped',async()=>{
    const a=asset();fetchMock.mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(Response.json({regions:regions()}));
    await expect(getUniformRegions(a)).rejects.toBeInstanceOf(UniformImagePendingError);
    const first=getUniformRegions(a);expect(first).toBe(getUniformRegions(a));expect(await first).toEqual(regions());expect(fetchMock).toHaveBeenCalledTimes(2);
    uid=crypto.randomUUID();fetchMock.mockResolvedValue(Response.json({error:'private'},{status:404}));await expect(getUniformRegions(a)).rejects.toThrow();
  });
  it('previews freshly uploaded part maps without re-reading eventual-consistency storage',async()=>{
    const a={...asset(),color_regions:uniformRegionSummary(regions())};primeUniformAsset(a,'PNG','THUMB',regions());
    expect(await getUniformRegions(a)).toEqual(regions());expect(fetchMock).not.toHaveBeenCalled();
  });
  it('applies independent front/back palettes to the same reference without mutating the asset',async()=>{
    const a={...asset(),color_regions:uniformRegionSummary(regions())};primeUniformAsset(a,'PNG','THUMB',regions());
    const input=await studioRendererInput({...createStudioUniform(),front_pattern:{id:a.id,revision:1},back_pattern:{id:a.id,revision:1},
      part_colors:{front_pattern:{'part-1':'#00ff00'},back_pattern:{'part-2':'#0000ff'}}},'front');
    expect(input.frontPatternAsset?.dataUrl).toBe('painted:{"part-1":"#00ff00"}');expect(input.backPatternAsset?.dataUrl).toBe('painted:{"part-2":"#0000ff"}');
    expect(input.frontPatternAsset?.colorMode).toBe('original');expect((await getUniformAsset(a)).dataUrl).toBe('PNG');expect(recolorRegionImage).toHaveBeenCalled();
  });
  it('identifies a retryable 503 without treating private/unknown 404 as propagation',async()=>{
    await expect(responseDataUrl(new Response('',{status:503}))).rejects.toBeInstanceOf(UniformImagePendingError);
    await expect(responseDataUrl(new Response('',{status:404}))).rejects.not.toBeInstanceOf(UniformImagePendingError);
  });
  it('evicts failures, re-requests images, and shares successful in-flight loads',async()=>{
    const a=asset();let ready=false;
    fetchMock.mockImplementation(async(url:string)=>String(url).endsWith('/image/full')?
      new Response(ready?'PNG':'',{status:ready?200:503}):Response.json({asset:a}));
    await expect(getUniformAsset(a)).rejects.toBeInstanceOf(UniformImagePendingError);
    ready=true;const first=getUniformAsset(a),second=getUniformAsset(a);expect(first).toBe(second);
    expect((await first).dataUrl).toBe('data:image/png;base64,UE5H');expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('uses just-uploaded bytes for the exact account and version, including thumbnail dimensions',async()=>{
    const a=asset();primeUniformAsset(a,'data:image/png;base64,UE5H','data:image/png;base64,VEhVTUI=');
    expect((await getUniformAsset(a)).dataUrl).toContain('UE5H');
    expect(await getUniformAsset(a,true)).toMatchObject({asset:{width:96,height:48},dataUrl:'data:image/png;base64,VEhVTUI='});
    expect(fetchMock).not.toHaveBeenCalled();
    uid=crypto.randomUUID();fetchMock.mockResolvedValue(Response.json({error:'private'},{status:404}));
    await expect(getUniformAsset(a)).rejects.toThrow();expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('bounds the cache rather than retaining every uploaded file',async()=>{
    const first=asset();primeUniformAsset(first,'one','thumb');
    for(let i=0;i<20;i++)primeUniformAsset(asset(),'PNG','thumb');
    fetchMock.mockResolvedValue(Response.json({error:'missing'},{status:404}));
    await expect(getUniformAsset(first)).rejects.toThrow();expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('can derive an SSR identity without browser storage',()=>{
    vi.stubGlobal('localStorage',undefined);expect(uniformAccountKey()).toBe('');
  });
});
