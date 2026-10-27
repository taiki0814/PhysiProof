import {useEffect,useRef,useState} from 'react';
import {placeSharingSchema,runStepSummarySchema,type NativeRunState,type RunFix} from '@my-app/shared';
import client from './hc';
import {hasNativeRunBridge,nativeRunCommand} from './nativeRun';

export function useRunTelemetry(sessionId:string|null,isTracking:boolean,onNativeState:(state:NativeRunState)=>void,onFailure:(message:string)=>void,courseSelected=false){
  const [available,setAvailable]=useState(false),[nativeActive,setNativeActive]=useState(false),[state,setState]=useState<NativeRunState|null>(null);
  const active=useRef(false),finishing=useRef(false),fix=useRef<RunFix|null>(null),sequence=useRef(0);
  const completed=useRef(false),lastPost=useRef(0),webFinish=useRef<(()=>Promise<void>)|null>(null);
  const callbacks=useRef({onNativeState,onFailure});callbacks.current={onNativeState,onFailure};
  useEffect(()=>{let live=true;if(hasNativeRunBridge())void nativeRunCommand('capabilities').then(s=>{if(live){setAvailable(s.available);active.current=s.active;setNativeActive(s.active);setState(s);}}).catch(()=>{});return()=>{live=false;};},[]);
  async function start(id:string){
    sequence.current=0;fix.current=null;finishing.current=false;completed.current=false;lastPost.current=0;setState(null);
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
    if(!active.current){
      finishing.current=true;
      try{await webFinish.current?.();completed.current=true;return null;}finally{finishing.current=false;}
    }
    finishing.current=true;
    try{
      const current=await nativeRunCommand('finish');setState(current);active.current=false;setNativeActive(false);
      if(current.error)throw new Error(current.error);
      return current.route;
    }finally{completed.current=true;finishing.current=false;}
  }
  function cancel(){
    if(active.current&&hasNativeRunBridge())void nativeRunCommand('cancel').catch(()=>{});
    active.current=false;setNativeActive(false);fix.current=null;
    completed.current=true;
  }
  useEffect(()=>{
    if(!sessionId||!isTracking)return;
    let disposed=false,pending=false,sharing=courseSelected;
    const id=sessionId;
    if(!active.current)void client.api.running.places.preferences.$get().then(async res=>{if(res.ok){sharing=courseSelected||placeSharingSchema.parse(await res.json()).sharing;if(sharing&&!disposed)void sample();}}).catch(()=>{});
    async function sample(final=false){
      if(disposed||pending||completed.current||(!final&&finishing.current))return;
      pending=true;
      try{
        if(active.current){
          const current=await nativeRunCommand('snapshot');
          // A snapshot already in flight must not interpret normal finishing as a failure.
          if(disposed||finishing.current||!active.current)return;
          if(current.error||!current.active||current.session_id!==id)throw new Error(current.error||'実測歩数の計測が終了しました。この走行を再開してください。');
          setState(current);callbacks.current.onNativeState(current);
        }else if(sharing){
          const response=await client.api.running.sessions[':id'].telemetry.$post({param:{id},json:{sequence:sequence.current++,recorded_at_ms:Date.now(),source:'unavailable',steps:null,fix:fix.current}},{init:{signal:AbortSignal.timeout(8000)}});
          lastPost.current=Date.now();
          if(!response.ok&&(final||(courseSelected&&response.status!==429)))throw new Error('コースのオンライン照合が途切れました。再開して走行してください。');
          if(!response.ok&&response.status!==429)sharing=false;
          if(response.ok&&!disposed){const summary=runStepSummarySchema.parse(await response.json());setState({available:false,active:true,session_id:id,summary,error:null,route:[],distance_m:0});}
        }
      }catch(error){
        if(final)throw error;
        if(!disposed&&!finishing.current&&(active.current||courseSelected)){
          cancel();void client.api.running.sessions[':id'].$delete({param:{id}}).catch(()=>{});
          callbacks.current.onFailure(error instanceof Error?error.message:'計測が途切れました。');
        }
      }
      finally{pending=false;}
    }
    const finalize=async()=>{
      const deadline=Date.now()+10000;
      while(pending){if(Date.now()>deadline)throw new Error('コース照合の完了を確認できません。');await new Promise(resolve=>setTimeout(resolve,100));}
      if(disposed)throw new Error('走行の照合が終了しました。');
      if(sharing){const delay=1600-(Date.now()-lastPost.current);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));await sample(true);}
    };
    webFinish.current=finalize;
    // Native service uploads independently while the WebView is asleep.
    const timer=setInterval(()=>void sample(),active.current?3000:courseSelected?10000:20000);void sample();
    return()=>{disposed=true;clearInterval(timer);if(webFinish.current===finalize)webFinish.current=null;};
  },[sessionId,isTracking,nativeActive,courseSelected]);
  return{available,nativeActive,state,start,finish,cancel,updateFix:(value:RunFix)=>{fix.current=value;}};
}
