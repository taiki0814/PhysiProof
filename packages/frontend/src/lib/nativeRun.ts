import {nativeRunStateSchema,type NativeRunState} from '@my-app/shared';
type MessageBridge={postMessage:(message:string)=>void;onmessage:((event:{data:string})=>void)|null};
declare global { interface Window { PhysiProofMotion?:MessageBridge } }
let installed:MessageBridge|undefined;
const waiting=new Map<string,{resolve:(data:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
export function hasNativeRunBridge(){return typeof window!=='undefined'&&!!window.PhysiProofMotion;}
export async function nativeRunCommand(command:'capabilities'|'snapshot'|'start'|'finish'|'cancel',sessionId?:string):Promise<NativeRunState>{
  const bridge=window.PhysiProofMotion;
  if(!bridge)throw new Error('このブラウザーは実測歩数に対応していません。');
  if(installed!==bridge){
    installed=bridge;
    bridge.onmessage=event=>{
      try{
        const message=JSON.parse(event.data),pending=waiting.get(message.id);
        if(!pending)return;clearTimeout(pending.timer);waiting.delete(message.id);
        if(message.error)pending.reject(new Error(String(message.error)));else pending.resolve(message.data);
      }catch{/* Malformed messages never complete a privileged command. */}
    };
  }
  const id=crypto.randomUUID();
  const data=await new Promise<unknown>((resolve,reject)=>{
    const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('アプリの計測応答がありません。許可と接続を確認してください。'));},90000);
    waiting.set(id,{resolve,reject,timer});
    const access_token=command==='start'?localStorage.getItem('physiproof_access_token'):undefined;
    try{bridge.postMessage(JSON.stringify({id,command,...(sessionId?{session_id:sessionId}:{}),...(access_token?{access_token}:{})}));}
    catch{clearTimeout(timer);waiting.delete(id);reject(new Error('アプリの歩数計と通信できません。'));}
  });
  return nativeRunStateSchema.parse(data);
}
