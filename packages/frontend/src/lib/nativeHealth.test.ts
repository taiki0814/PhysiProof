import {afterEach,describe,it,expect,vi} from 'vitest';
import {hasNativeHealthBridge,nativeHealthStatus,authorizeNativeHealth,readNativeHealth} from './nativeHealth';
afterEach(()=>{vi.unstubAllGlobals();});
describe('separate native health read bridge',()=>{
  it('does not mistake existing motion tracking for health import support',async()=>{
    vi.stubGlobal('window',{PhysiProofMotion:{}});expect(hasNativeHealthBridge()).toBe(false);await expect(nativeHealthStatus()).rejects.toThrow('Android');
  });
  it('never sends account credentials/game session/route and only reads on explicit command',async()=>{
    const sent:any[]=[];const bridge:any={onmessage:null,postMessage:(json:string)=>{const c=JSON.parse(json);sent.push(c);bridge.onmessage({data:JSON.stringify({id:c.id,data:c.command==='read'?{window_start_ms:1,window_end_ms:2592000001,records:[]}:{supported:true,authorized:c.command!=='status'}})});}};
    vi.stubGlobal('window',{PhysiProofHealth:bridge});await nativeHealthStatus();expect(sent).toHaveLength(1);await authorizeNativeHealth();await readNativeHealth();
    expect(sent.map(r=>r.command)).toEqual(['status','authorize','read']);for(const r of sent)expect(Object.keys(r).sort()).toEqual(['command','id']);
  });
  it('rejects malformed and permission-denied responses, without manufacturing distance',async()=>{
    const bridge:any={onmessage:null,postMessage:(json:string)=>bridge.onmessage({data:JSON.stringify({id:JSON.parse(json).id,data:{distance_m:5000}})})};
    vi.stubGlobal('window',{PhysiProofHealth:bridge});await expect(readNativeHealth()).rejects.toThrow();
    bridge.postMessage=(json:string)=>bridge.onmessage({data:JSON.stringify({id:JSON.parse(json).id,error:'permission denied'})});await expect(readNativeHealth()).rejects.toThrow('permission denied');
  });
});
