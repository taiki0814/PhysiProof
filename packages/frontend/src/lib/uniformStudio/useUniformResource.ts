import {useEffect,useState} from 'react';
import type {DependencyList} from 'react';
import {UniformImagePendingError} from './client';

// Bound automatic retries. Cancel timers on navigation/design/account changes.
export function useUniformResource<T>(load:()=>Promise<T>,dependencies:DependencyList){
  const [value,setValue]=useState<T>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let live=true,attempt=0,timer:ReturnType<typeof setTimeout>|undefined;
    setValue(undefined);setError('');
    async function run(){
      try{const result=await load();if(live){setValue(result);setError('');}}
      catch(e){if(!live)return;
        const pending=e instanceof UniformImagePendingError;
        setError(pending&&attempt>=2?'画像の反映待ち、または保存先が混雑しています。しばらく待って再読込してください。':e instanceof Error?e.message:'素材を読み込めません。');
        if(pending&&attempt++<2)timer=setTimeout(()=>void run(),30000);
      }
    }
    void run();
    return()=>{live=false;if(timer)clearTimeout(timer);};
    // The caller supplies all identity/design dependencies, like useEffect.
  },[...dependencies,retry]);
  return {value,error,reload:()=>setRetry(n=>n+1)};
}
