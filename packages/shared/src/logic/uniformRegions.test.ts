import {describe,it,expect} from 'vitest';
import {uniformColorRegionsSchema,uniformPartColorsSchema,uniformRegionSummarySchema} from '../schemas/uniform-regions.schema';
import {encodeRegionLabels,decodeRegionLabels,suggestUniformRegions,fillUniformRegion,paintUniformRegion,recolorUniformPixels,uniformRegionSummary} from './uniformRegions';
import type {UniformColorRegions} from '../schemas/uniform-regions.schema';
const fixture=():UniformColorRegions=>({version:1,width:3,height:1,parts:[{id:'part-1',name:'左',color:'#ff0000'},{id:'part-2',name:'右',color:'#ff0000'}],labels_base64:encodeRegionLabels(new Uint8Array([1,0,2]))});
const red=[255,0,0,255],transparent=[0,0,0,0];
describe('bounded color regions',()=>{
  it('accepts independent same-color parts without exposing pixel maps in summaries',()=>{
    const v=fixture();expect(uniformColorRegionsSchema.parse(v)).toEqual(v);
    expect(uniformRegionSummarySchema.parse(uniformRegionSummary(v)).parts).toHaveLength(2);
    expect(JSON.stringify(uniformRegionSummary(v))).not.toContain('base64');
    expect([...decodeRegionLabels(v)]).toEqual([1,0,2]);
  });
  it.each([
    {width:513},{parts:[]},{labels_base64:'AAAA'},{labels_base64:'AQD/'},{labels_base64:'not base64'},
    {parts:[{id:'part-17',name:'bad',color:'#ffffff'}]},
    {parts:[{id:'part-1',name:'A',color:'#ffffff'},{id:'part-1',name:'B',color:'#ffffff'}]},
  ])('rejects malformed/oversized/unassigned maps %j',change=>expect(uniformColorRegionsSchema.safeParse({...fixture(),...change}).success).toBe(false));
  it('bounds palette names, keys and color syntax',()=>{
    expect(uniformPartColorsSchema.safeParse({emblem:{'part-1':'#0123ab'}}).success).toBe(true);
    for(const emblem of [{constructor:'#ffffff'},{'part-17':'#ffffff'},{'part-1':'url(evil)'},{'part-1':'red'}])expect(uniformPartColorsSchema.safeParse({emblem}).success).toBe(false);
  });
  it('suggests deterministic colors locally and leaves transparent pixels unassigned',()=>{
    const p=new Uint8ClampedArray([...red,...transparent,0,255,0,255,...red]);
    const a=suggestUniformRegions(p,4,1,6),b=suggestUniformRegions(p,4,1,6);
    expect(a).toEqual(b);expect(a.parts).toHaveLength(2);expect(decodeRegionLabels(a)[1]).toBe(0);
    expect(a.parts.map(p=>p.color).sort()).toEqual(['#00ff00','#ff0000']);
    expect(()=>suggestUniformRegions(new Uint8ClampedArray(4),1,1)).toThrow(/透明/);
  });
  it('splits disconnected regions with identical source colors using connected fill',()=>{
    const p=new Uint8ClampedArray([...red,...transparent,...red]),old=new Uint8Array([1,0,1]);
    expect([...fillUniformRegion(p,3,1,old,0,0,2,0)]).toEqual([2,0,1]);
    expect([...fillUniformRegion(p,3,1,old,0,0,2,0,true)]).toEqual([2,0,2]);
    expect([...old]).toEqual([1,0,1]);
  });
  it('does not mistake a sparse opaque mark between sample positions for a transparent image',()=>{
    const p=new Uint8ClampedArray(128*128*4);p.set(red,4);
    const result=suggestUniformRegions(p,128,128);
    expect(result.parts).toHaveLength(1);expect(decodeRegionLabels(result)[1]).toBe(1);
  });
  it('supports manual separation of touching same-color areas and erasing to original',()=>{
    const p=new Uint8ClampedArray([...red,...red,...red,...transparent]),labels=new Uint8Array([1,1,1,0]);
    paintUniformRegion(p,4,1,labels,0,0,1,2);expect([...labels]).toEqual([2,2,1,0]);
    paintUniformRegion(p,4,1,labels,0,0,1,0);expect([...labels]).toEqual([0,0,1,0]);
  });
  it('recolors each same-color part independently without changing alpha/unassigned pixels/source',()=>{
    const p=new Uint8ClampedArray([255,0,0,128,17,30,40,255,...red]),before=p.slice();
    const out=recolorUniformPixels(p,3,1,fixture(),{'part-1':'#00ff00','part-2':'#0000ff'});
    expect([...out]).toEqual([0,255,0,128,17,30,40,255,0,0,255,255]);expect(p).toEqual(before);
    expect(recolorUniformPixels(p,3,1,fixture(),{})).toEqual(p);
    expect(()=>recolorUniformPixels(p,3,1,fixture(),{'part-3':'#ffffff'})).toThrow(/存在しない/);
  });
  it('uses normalized nearest region pixels for full-size and thumbnail rendering',()=>{
    const def={...fixture(),width:2,labels_base64:encodeRegionLabels(new Uint8Array([1,2]))};
    const p=new Uint8ClampedArray([...red,...red,...red,...red]);
    const out=recolorUniformPixels(p,4,1,def,{'part-1':'#00ff00'});
    expect([...out]).toEqual([0,255,0,255,0,255,0,255,...red,...red]);
  });
});
