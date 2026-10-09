import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBattleLocation } from './battleLocation';
afterEach(()=>{vi.unstubAllGlobals();});
describe('battle leader current GPS',()=>{
  it('requests a fresh high-accuracy position and preserves the device fix time',async()=>{
    const getCurrentPosition=vi.fn((success:(position:unknown)=>void,_error:unknown,_options:unknown)=>success({coords:{latitude:35.7,longitude:139.7,accuracy:20},timestamp:1700000000000}));
    vi.stubGlobal('navigator',{geolocation:{getCurrentPosition}});
    await expect(readBattleLocation()).resolves.toEqual({latitude:35.7,longitude:139.7,located_at:new Date(1700000000000).toISOString()});
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
  it('gives actionable messages for unsupported/denied/poor GPS without manual coordinate fallback',async()=>{
    vi.stubGlobal('navigator',{}); await expect(readBattleLocation()).rejects.toThrow('この端末');
    vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(_success:unknown,failure:()=>void)=>failure()}});
    await expect(readBattleLocation()).rejects.toThrow('許可');
    vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(success:(p:unknown)=>void)=>success({coords:{accuracy:2000}})}});
    await expect(readBattleLocation()).rejects.toThrow('精度');
  });
});
