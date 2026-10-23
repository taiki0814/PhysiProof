import {useEffect,useRef,useState} from 'react';
import {placeSharingSchema,type NativeRunState,type RunFix} from '@my-app/shared';
import client from './hc';
import {hasNativeRunBridge,nativeRunCommand} from './nativeRun';

export function useRunTelemetry(sessionId:string|null,isTracking:boolean,onNativeState:(state:NativeRunState)=>void,onFailure:(message:string)=>void){
  const [available,setAvailable]=useState(false),[nativeActive,setNativeActive]=useState(false),[state,setState]=useState<NativeRunState|null>(null);
  const active=useRef(false),finishing=useRef(false),fix=useRef<RunFix|null>(null),sequence=useRef(0);
  const callbacks=useRef({onNativeState,onFailure});callbacks.current={onNativeState,onFailure};
  useEffect(()=>{let live=true;if(hasNativeRunBridge())void nativeRunCommand('capabilities').then(s=>{if(live){setAvailable(s.available);active.current=s.active;setNativeActive(s.active);setState(s);}}).catch(()=>{});return()=>{live=false;};},[]);
  async function start(id:string){
    sequence.current=0;fix.current=null;finishing.current=false;
    if(!hasNativeRunBridge())return;
    const capability=await nativeRunCommand('capabilities');setAvailable(capability.available);
    if(!capability.available)return;
    await nativeRunCommand('start',id);
    for(let attempt=0;attempt<10;attempt++){
      const current=await nativeRunCommand('snapshot');
      if(current.error)throw new Error(current.error);
      if(current.active&&current.session_id===id){active.current=true;setNativeActive(true);setState(current);return;}
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    void nativeRunCommand('cancel');throw new Error('実測歩数の計測を開始できませんでした。');
  }
  async function finish(){
    if(!active.current)return null;
    finishing.current=true;
    try{
      const current=await nativeRunCommand('finish');setState(current);active.current=false;setNativeActive(false);
      if(current.error)throw new Error(current.error);
      return current.route;
    }finally{finishing.current=false;}
  }
  function cancel(){
    if(active.current&&hasNativeRunBridge())void nativeRunCommand('cancel').catch(()=>{});
    active.current=false;setNativeActive(false);fix.current=null;
  }
  useEffect(()=>{
    if(!sessionId||!isTracking)return;
    let disposed=false,pending=false,sharing=false;
    const id=sessionId;
    if(!active.current)void client.api.running.places.preferences.$get().then(async res=>{if(res.ok){sharing=placeSharingSchema.parse(await res.json()).sharing;if(sharing&&!disposed)void sample();}}).catch(()=>{});
    async function sample(){
      if(disposed||pending||finishing.current)return;
      pending=true;
      try{
        if(active.current){
          const current=await nativeRunCommand('snapshot');
          // A snapshot already in flight must not interpret normal finishing as a failure.
          if(disposed||finishing.current||!active.current)return;
          if(current.error||!current.active||current.session_id!==id)throw new Error(current.error||'実測歩数の計測が終了しました。この走行を再開してください。');
          setState(current);callbacks.current.onNativeState(current);
        }else if(sharing){
          const response=await client.api.running.sessions[':id'].telemetry.$post({param:{id},json:{sequence:sequence.current++,recorded_at_ms:Date.now(),source:'unavailable',steps:null,fix:fix.current}});
          if(!response.ok&&response.status!==429)sharing=false;
        }
      }catch(error){if(!disposed&&!finishing.current&&active.current){cancel();callbacks.current.onFailure(error instanceof Error?error.message:'計測が途切れました。');}}
      finally{pending=false;}
    }
    // Native service uploads independently while the WebView is asleep.
    const timer=setInterval(()=>void sample(),active.current?3000:20000);void sample();
    return()=>{disposed=true;clearInterval(timer);};
  },[sessionId,isTracking,nativeActive]);
  return{available,nativeActive,state,start,finish,cancel,updateFix:(value:RunFix)=>{fix.current=value;}};
}
