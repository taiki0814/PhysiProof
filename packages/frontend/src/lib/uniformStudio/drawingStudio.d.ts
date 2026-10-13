import type { UniformDrawingSource } from '@my-app/shared';
declare const drawing:{open(options:{kind:'pattern'|'emblem';source?:UniformDrawingSource;onUse:(data:{file:File;kind:'pattern'|'emblem';name:string;placement:'body'|'all'|'repeat';source:UniformDrawingSource})=>Promise<void>}):void;
  validateSource(input:unknown):UniformDrawingSource};
export default drawing;
