import type { UniformModelDefinition } from '@my-app/shared';
type ImageAsset = {kind:'pattern'|'emblem';dataUrl:string;width:number;height:number;colorMode:'original'|'tint';placement:'body'|'all'|'repeat';scale:number};
export type RendererInput = {maker?:string;view:'front'|'back';modelProfile?:UniformModelDefinition['front'];base:string;accent:string;line:string;textColor?:string;
  fabric:string;frontDesign:string;backDesign:string;emblem:string;position:string;playerName:string;playerNumber:string;
  nameFont:string;numberFont:string;namePosition:string;numberPosition:string;nameSize:number;numberSize:number;
  frontPatternAsset?:ImageAsset;backPatternAsset?:ImageAsset;emblemAsset?:ImageAsset};
declare const renderer:{viewBox:string;render(input:RendererInput,options?:{prefix?:string;thumbnail?:boolean}):string};
export default renderer;
