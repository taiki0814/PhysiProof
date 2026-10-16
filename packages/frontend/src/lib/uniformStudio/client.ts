import { builtinUniformAsset, uniformAssetSchema, uniformAssetReferences } from '@my-app/shared';
import type { UniformAsset, UniformAssetRef, StudioUniformDesign } from '@my-app/shared';
import client from '../hc';
import type { RendererInput } from './renderer';

// Cache is bounded and account-scoped. Never reuse a private draft after logout.
const cache = new Map<string, Promise<{asset: UniformAsset; dataUrl?: string}>>();
export class UniformImagePendingError extends Error {}
export function uniformAccountKey(){return typeof localStorage==='undefined'?'':localStorage.getItem('physiproof_test_uid')||'demo-user';}
function cacheKey(ref:UniformAssetRef,thumbnail:boolean) {
  return `${uniformAccountKey()}/${ref.id}/${ref.revision}/${thumbnail}`;
}
function remember(key:string,value:Promise<{asset:UniformAsset;dataUrl?:string}>) {
  cache.set(key,value);
  if(cache.size>36)cache.delete(cache.keys().next().value!);
}
// The successful upload response is authoritative. Preview the local bytes
// immediately while KV propagates; other clients still read the stored version.
export function primeUniformAsset(asset:UniformAsset,png:string,thumbnail:string) {
  if(asset.kind==='model')return;
  remember(cacheKey(asset,false),Promise.resolve({asset,dataUrl:png}));
  const key=cacheKey(asset,true),request=(async()=>{
    const image=new Image();image.src=thumbnail;await image.decode();
    return {asset:{...asset,width:image.naturalWidth,height:image.naturalHeight},dataUrl:thumbnail};
  })();
  remember(key,request);
  void request.catch(()=>{if(cache.get(key)===request)cache.delete(key);});
}
export function fileDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('画像を読み込めません。')); reader.readAsDataURL(blob);
  });
}
export async function responseDataUrl(res: Response) {
  if(res.status===503)throw new UniformImagePendingError('画像の反映を待っています。30秒後に自動で再確認します。反映に1分以上かかる場合があります。');
  if (!res.ok) throw new Error('素材画像を読み込めません。もう一度お試しください。');
  return fileDataUrl(await res.blob());
}
export function getUniformAsset(ref: UniformAssetRef, thumbnail = false) {
  const builtin = builtinUniformAsset(ref);
  if (builtin) return Promise.resolve({asset: builtin, dataUrl: undefined});
  const key = cacheKey(ref,thumbnail);
  const hit = cache.get(key); if (hit) return hit;
  const request = (async () => {
    const param = {id: ref.id, revision: String(ref.revision)};
    const res = await client.api['uniform-assets'][':id'].versions[':revision'].$get({param});
    const body: unknown = await res.json();
    if (!res.ok || !body || typeof body !== 'object' || !('asset' in body)) throw new Error('素材のバージョンを読み込めません。');
    const asset = uniformAssetSchema.parse(body.asset);
    let dataUrl: string | undefined;
    if (asset.kind !== 'model') {
      const response = asset.status === 'published'
        ? await client.api['uniform-assets'][':id'].versions[':revision'].image[':size'].$get({param:{...param, size:thumbnail?'thumbnail':'full'}})
        : await client.api.admin['uniform-assets'][':id'].image[':revision'][':size'].$get({param:{...param,size:thumbnail?'thumbnail':'full'}});
      dataUrl = await responseDataUrl(response);
    }
    if (thumbnail && dataUrl) {
      const image = new Image(); image.src=dataUrl; await image.decode();
      return {asset:{...asset,width:image.naturalWidth,height:image.naturalHeight},dataUrl};
    }
    return {asset, dataUrl};
  })();
  remember(key,request);
  void request.catch(() => {if(cache.get(key)===request)cache.delete(key);});
  return request;
}
export async function studioRendererInput(design: StudioUniformDesign, view: 'front'|'back', thumbnail = false): Promise<RendererInput> {
  const refs = uniformAssetReferences(design);
  const resolved = await Promise.all(refs.map(async ({ref, kind}) => {
    const result = await getUniformAsset(ref, thumbnail);
    if (result.asset.kind !== kind) throw new Error('素材の種類が一致しません。');
    return {ref, ...result};
  }));
  const find = (ref: UniformAssetRef) => resolved.find(r => r.ref.id === ref.id && r.ref.revision === ref.revision)!;
  const image = (ref: UniformAssetRef) => {
    const result = find(ref), a = result.asset;
    return {kind:a.kind as 'pattern'|'emblem', dataUrl:result.dataUrl!, width:a.width, height:a.height,
      colorMode:a.color_mode, placement:a.placement, scale:a.scale};
  };
  const model = find(design.model).asset.model_definition;
  if (!model) throw new Error('服本体の定義がありません。');
  return { view, modelProfile:model[view], base:design.colors.body, accent:design.colors.accent,
    line:design.colors.detail, textColor:design.colors.text, fabric:design.fabric,
    frontDesign:typeof design.front_pattern==='string'?design.front_pattern:'none',
    backDesign:typeof design.back_pattern==='string'?design.back_pattern:'none',
    emblem:typeof design.emblem==='string'?design.emblem:'none',position:design.emblem_position,
    playerName:design.jersey_name,playerNumber:design.number,nameFont:design.name_font,numberFont:design.number_font,
    namePosition:design.name_position,numberPosition:design.number_position,nameSize:design.name_size,numberSize:design.number_size,
    frontPatternAsset:typeof design.front_pattern==='object'?image(design.front_pattern):undefined,
    backPatternAsset:typeof design.back_pattern==='object'?image(design.back_pattern):undefined,
    emblemAsset:typeof design.emblem==='object'?image(design.emblem):undefined };
}
export async function makeThumbnail(dataUrl: string) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const ratio = Math.min(1, 192/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio)); canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/png');
}
