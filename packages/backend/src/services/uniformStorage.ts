import type {D1Database,KVNamespace,R2Bucket} from '@cloudflare/workers-types';
import {UNIFORM_STORAGE_BUDGET_BYTES,UNIFORM_DAILY_OBJECT_WRITE_BUDGET,UNIFORM_STORAGE_RETRY_SECONDS} from '@my-app/shared';
import type {UniformStorageStatus} from '@my-app/shared';
import {UniformAssetError} from './uniformAssetError';

export type UniformStorageBindings={UNIFORM_ASSETS_KV?:KVNamespace;UNIFORM_ASSETS?:R2Bucket};
export function storageProvider(env:UniformStorageBindings):UniformStorageStatus['provider']{
  return env.UNIFORM_ASSETS_KV?'kv':env.UNIFORM_ASSETS?'r2':'unconfigured';
}
export function storagePrefix(env:UniformStorageBindings,id:string){
  return (storageProvider(env)==='kv'?'uniform-assets-kv/':'uniform-assets/')+id+'/'+crypto.randomUUID();
}
export async function putStorageObject(env:UniformStorageBindings,key:string,data:Uint8Array|string,type:string){
  try{
    if(key.startsWith('uniform-assets-kv/')){
      if(!env.UNIFORM_ASSETS_KV)throw new UniformAssetError('画像のKV保存先が未設定です。',503);
      await env.UNIFORM_ASSETS_KV.put(key,typeof data==='string'?data:new Uint8Array(data).buffer);
    }else{
      if(!env.UNIFORM_ASSETS)throw new UniformAssetError('画像の保存先が未設定です。',503);
      await env.UNIFORM_ASSETS.put(key,data,{httpMetadata:{contentType:type}});
    }
  }catch(error){
    if(error instanceof UniformAssetError)throw error;
    throw new UniformAssetError('画像保存先の上限または一時的な障害により保存できません。下書きは残っています。時間をおいて再試行してください。',503);
  }
}
export async function deleteStorageObject(env:UniformStorageBindings,key:string){
  if(key.startsWith('uniform-assets-kv/')){if(env.UNIFORM_ASSETS_KV)await env.UNIFORM_ASSETS_KV.delete(key);}
  else if(env.UNIFORM_ASSETS)await env.UNIFORM_ASSETS.delete(key);
}
export async function getStorageBody(env:UniformStorageBindings,key:string){
  if(key.startsWith('uniform-assets-kv/')){
    if(!env.UNIFORM_ASSETS_KV)throw new UniformAssetError('画像のKV保存先が未設定です。',503);
    // 60 seconds also works with this repository's older workerd/Miniflare.
    const body=await env.UNIFORM_ASSETS_KV.get(key,{type:'stream',cacheTtl:60});
    if(!body)throw new UniformAssetError('画像は保存済みですが、保存先での反映を待っています。30秒ほど待って再読み込みしてください。',503);
    return body;
  }
  if(!env.UNIFORM_ASSETS)throw new UniformAssetError('画像の保存先が未設定です。',503);
  const object=await env.UNIFORM_ASSETS.get(key);
  if(!object)throw new UniformAssetError('素材画像が見つかりません。',404);
  return object.body;
}
export async function uniformStorageStatus(db:D1Database,env:UniformStorageBindings):Promise<UniformStorageStatus>{
  const row=await db.prepare(`SELECT
    COALESCE((SELECT SUM(byte_size) FROM uniform_asset_versions),0)+
    COALESCE((SELECT SUM(bytes_reserved) FROM uniform_storage_reservations WHERE state!='committed'),0) AS bytes,
    COALESCE((SELECT SUM(object_writes) FROM uniform_storage_reservations WHERE created_at>=date('now')),0) AS writes`).first<{bytes:number;writes:number}>();
  return {provider:storageProvider(env),used_bytes:row?.bytes??0,capacity_bytes:UNIFORM_STORAGE_BUDGET_BYTES,
    writes_reserved_today:row?.writes??0,daily_object_write_budget:UNIFORM_DAILY_OBJECT_WRITE_BUDGET,retry_after_seconds:UNIFORM_STORAGE_RETRY_SECONDS};
}
export async function reserveUniformUpload(db:D1Database,bytes:number,writes:number){
  const id=crypto.randomUUID();
  const result=await db.prepare(`INSERT INTO uniform_storage_reservations(id,bytes_reserved,object_writes)
    SELECT ?,?,? WHERE
    ?+COALESCE((SELECT SUM(byte_size) FROM uniform_asset_versions),0)+
      COALESCE((SELECT SUM(bytes_reserved) FROM uniform_storage_reservations WHERE state!='committed'),0)<=?
    AND ?+COALESCE((SELECT SUM(object_writes) FROM uniform_storage_reservations WHERE created_at>=date('now')),0)<=?`)
    .bind(id,bytes,writes,bytes,UNIFORM_STORAGE_BUDGET_BYTES,writes,UNIFORM_DAILY_OBJECT_WRITE_BUDGET).run();
  if(!result.meta.changes)throw new UniformAssetError('無料構成の保存容量（900MB）または本日の画像保存回数（900書き込み）の安全上限に達しました。回数は日本時間9時にリセットされます。',413);
  return id;
}
