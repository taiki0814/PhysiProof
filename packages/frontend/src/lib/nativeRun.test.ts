import {afterEach,describe,it,expect,vi} from 'vitest';
import {nativeRunCommand,hasNativeRunBridge} from './nativeRun';
const state={available:true,active:false,session_id:null,summary:null,error:null,route:[],distance_m:0};
afterEach(()=>{vi.unstubAllGlobals();});
describe('native step bridge boundary',()=>{
  it('does not pretend a normal browser has actual step readings',async()=>{
    vi.stubGlobal('window',{});expect(hasNativeRunBridge()).toBe(false);
    await expect(nativeRunCommand('snapshot')).rejects.toThrow('対応していません');
  });
  it('sends an opaque token only for explicit run start, not capability/snapshot requests',async()=>{
    const sent:any[]=[];const bridge:any={onmessage:null,postMessage:(json:string)=>{const command=JSON.parse(json);sent.push(command);bridge.onmessage({data:JSON.stringify({id:command.id,data:state})});}};
    vi.stubGlobal('window',{PhysiProofMotion:bridge});vi.stubGlobal('localStorage',{getItem:()=> 'a'.repeat(64)});
    await nativeRunCommand('capabilities');await nativeRunCommand('start','00000000-0000-0000-0000-000000000000');await nativeRunCommand('snapshot');
    expect(sent[0]).not.toHaveProperty('access_token');expect(sent[2]).not.toHaveProperty('access_token');expect(sent[1].access_token).toBe('a'.repeat(64));
  });
  it('does not accept fabricated/invalid native step response shapes as real readings',async()=>{
    const bridge:any={onmessage:null,postMessage:(json:string)=>bridge.onmessage({data:JSON.stringify({id:JSON.parse(json).id,data:{...state,summary:{measured_steps:100,eligible_steps:100,source:'estimated',state:'moving'}}})})};
    vi.stubGlobal('window',{PhysiProofMotion:bridge});await expect(nativeRunCommand('snapshot')).rejects.toThrow();
  });
});
