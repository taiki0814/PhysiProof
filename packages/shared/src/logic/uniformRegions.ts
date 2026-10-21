import { uniformColorRegionsSchema, uniformPartPaletteSchema, UNIFORM_REGION_LIMIT, UNIFORM_REGION_DIMENSION } from '../schemas/uniform-regions.schema';
import type { UniformColorRegions, UniformRegionSummary, UniformPartPalette } from '../schemas/uniform-regions.schema';

export function encodeRegionLabels(labels: Uint8Array): string {
  let text = '';
  for (let i = 0; i < labels.length; i += 8192) text += String.fromCharCode(...labels.subarray(i, i + 8192));
  return btoa(text);
}
export function decodeRegionLabels(regions: UniformColorRegions): Uint8Array {
  return Uint8Array.from(atob(regions.labels_base64), c => c.charCodeAt(0));
}
export function uniformRegionSummary(regions: UniformColorRegions): UniformRegionSummary {
  const { labels_base64: _labels, ...summary } = regions;
  return summary;
}
function checkPixels(pixels: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > UNIFORM_REGION_DIMENSION || height > UNIFORM_REGION_DIMENSION || pixels.length !== width * height * 4) throw new Error('部位編集用画像のサイズが不正です。');
}
const distance = (a: readonly number[], b: readonly number[]) => (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
const hex = (rgb: readonly number[]) => '#'+rgb.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');

/** Deterministic, local color clustering. It suggests colors, not semantic body parts. */
export function suggestUniformRegions(pixels: Uint8ClampedArray, width: number, height: number, count = 6): UniformColorRegions {
  checkPixels(pixels,width,height);
  const samples: number[][] = [], stride = Math.max(1,Math.ceil(width*height/4096));
  for (let i=0;i<width*height;i+=stride) if(pixels[i*4+3]>=12) samples.push(Array.from(pixels.subarray(i*4,i*4+3)));
  // A small opaque mark can fall entirely between the regular sample positions.
  if(!samples.length)for(let i=0;i<width*height;i++)if(pixels[i*4+3]>=12){samples.push(Array.from(pixels.subarray(i*4,i*4+3)));break;}
  if(!samples.length) throw new Error('透明な画像には部位を作れません。');
  const centers=[samples[0].slice()];
  for(let k=1;k<Math.max(1,Math.min(UNIFORM_REGION_LIMIT,count));k++) {
    let best=samples[0], far=0;
    for(const sample of samples) {const d=Math.min(...centers.map(c=>distance(c,sample)));if(d>far){far=d;best=sample;}}
    if(far<100)break;centers.push(best.slice());
  }
  const nearest=(rgb:readonly number[])=>{let index=0,min=Infinity;for(let k=0;k<centers.length;k++){const d=distance(rgb,centers[k]);if(d<min){min=d;index=k;}}return index;};
  for(let pass=0;pass<6;pass++) {
    const sums=centers.map(()=>[0,0,0,0]);
    for(const sample of samples){const s=sums[nearest(sample)];for(let c=0;c<3;c++)s[c]+=sample[c];s[3]++;}
    sums.forEach((s,k)=>{if(s[3])centers[k]=s.slice(0,3).map(n=>n/s[3]);});
  }
  const labels=new Uint8Array(width*height),used=new Set<number>();
  for(let i=0;i<labels.length;i++)if(pixels[i*4+3]>=12){labels[i]=nearest(Array.from(pixels.subarray(i*4,i*4+3)))+1;used.add(labels[i]);}
  return {version:1,width,height,parts:centers.flatMap((c,i)=>used.has(i+1)?[{id:'part-'+(i+1),name:'部位 '+(i+1),color:hex(c)}]:[]),labels_base64:encodeRegionLabels(labels)};
}

export function fillUniformRegion(pixels: Uint8ClampedArray, width: number, height: number, previous: Uint8Array,
  x: number, y: number, label: number, tolerance: number, global = false): Uint8Array {
  checkPixels(pixels,width,height);
  if(previous.length!==width*height || !Number.isInteger(label) || label<0 || label>UNIFORM_REGION_LIMIT)throw new Error('部位IDが不正です。');
  const result=previous.slice(),sx=Math.max(0,Math.min(width-1,Math.floor(x))),sy=Math.max(0,Math.min(height-1,Math.floor(y))),seed=sy*width+sx;
  if(pixels[seed*4+3]<12)return result;
  const rgb=Array.from(pixels.subarray(seed*4,seed*4+3)),limit=Math.max(0,Math.min(255,tolerance))**2*3;
  const matches=(i:number)=>pixels[i*4+3]>=12&&distance(rgb,Array.from(pixels.subarray(i*4,i*4+3)))<=limit;
  if(global){for(let i=0;i<result.length;i++)if(matches(i))result[i]=label;return result;}
  const visited=new Uint8Array(result.length),queue=new Uint32Array(result.length);let start=0,end=1;queue[0]=seed;visited[seed]=1;
  while(start<end){const i=queue[start++];if(!matches(i))continue;result[i]=label;
    const neighbors=[...(i%width?[i-1]:[]),...(i%width<width-1?[i+1]:[]),...(i>=width?[i-width]:[]),...(i+width<result.length?[i+width]:[])];
    for(const n of neighbors)if(!visited[n]){visited[n]=1;queue[end++]=n;}
  }
  return result;
}
export function paintUniformRegion(pixels: Uint8ClampedArray, width: number, height: number, labels: Uint8Array,
  x: number, y: number, radius: number, label: number): void {
  checkPixels(pixels,width,height);
  if(labels.length!==width*height||label<0||label>UNIFORM_REGION_LIMIT||!Number.isInteger(label))throw new Error('部位IDが不正です。');
  const r=Math.max(1,Math.min(64,radius));
  for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(height-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(width-1,Math.ceil(x+r));px++)
    if((px-x)**2+(py-y)**2<=r*r&&pixels[(py*width+px)*4+3]>=12)labels[py*width+px]=label;
}
export function recolorUniformPixels(pixels: Uint8ClampedArray, width: number, height: number, definition: UniformColorRegions, palette: UniformPartPalette): Uint8ClampedArray {
  const regions=uniformColorRegionsSchema.parse(definition),colors=uniformPartPaletteSchema.parse(palette),labels=decodeRegionLabels(regions);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||pixels.length!==width*height*4)throw new Error('着色画像のサイズが不正です。');
  const allowed=new Set(regions.parts.map(p=>p.id));
  if(Object.keys(colors).some(id=>!allowed.has(id)))throw new Error('この素材には存在しない部位です。');
  const rgb=new Map(Object.entries(colors).map(([id,c])=>[Number(id.slice(5)),[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))]));
  const output=pixels.slice();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const label=labels[Math.min(regions.height-1,Math.floor((y+.5)*regions.height/height))*regions.width+Math.min(regions.width-1,Math.floor((x+.5)*regions.width/width))],color=rgb.get(label),i=(y*width+x)*4;
    if(color&&output[i+3]){output[i]=color[0];output[i+1]=color[1];output[i+2]=color[2];}
  }
  return output;
}
