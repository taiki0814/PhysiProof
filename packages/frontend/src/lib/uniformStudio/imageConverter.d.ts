declare const converter:{convert(file:File,options:{kind:'pattern'|'emblem';removeWhite?:boolean}):Promise<{dataUrl:string;width:number;height:number;sourceName:string;sourceBytes:number}>};
export default converter;
