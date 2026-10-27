import {nativeHealthStateSchema,nativeHealthSnapshotSchema} from '@my-app/shared';
type Bridge={postMessage:(message:string)=>void;onmessage:((event:{data:string})=>void)|null};
declare global {interface Window{PhysiProofHealth?:Bridge}}
let installed:Bridge|undefined;
const waiting=new Map<string,{resolve:(data:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
export const hasNativeHealthBridge=()=>typeof window!=='undefined'&&!!window.PhysiProofHealth;
async function command(action:'status'|'authorize'|'read'|'settings'){
  const bridge=typeof window!=='undefined'?window.PhysiProofHealth:undefined;
  if(!bridge)throw new Error('取り込みは対応するAndroidアプリから行ってください。Web版では保存済み記録を表示できます。');
  if(installed!==bridge){
    for(const entry of waiting.values()){clearTimeout(entry.timer);entry.reject(new Error('アプリとの接続が切り替わりました。'));}waiting.clear();installed=bridge;
    bridge.onmessage=event=>{try{const m=JSON.parse(event.data),p=waiting.get(m.id);if(!p)return;clearTimeout(p.timer);waiting.delete(m.id);m.error?p.reject(new Error(String(m.error))):p.resolve(m.data);}catch{}};
  }
  const id=crypto.randomUUID();
  return new Promise<unknown>((resolve,reject)=>{
    const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('外部連携の応答がありません。権限を確認し、時間を置いて再試行してください。'));},120000);
    waiting.set(id,{resolve,reject,timer});
    // No login token, route, user identifier or game session is sent to this bridge.
    try{bridge.postMessage(JSON.stringify({id,command:action}));}catch{clearTimeout(timer);waiting.delete(id);reject(new Error('外部連携と通信できませんでした。'));}
  });
}
export async function nativeHealthStatus(){return nativeHealthStateSchema.parse(await command('status'));}
export async function authorizeNativeHealth(){return nativeHealthStateSchema.parse(await command('authorize'));}
export async function readNativeHealth(){return nativeHealthSnapshotSchema.parse(await command('read'));}
export async function openNativeHealthSettings(){return nativeHealthStateSchema.parse(await command('settings'));}
