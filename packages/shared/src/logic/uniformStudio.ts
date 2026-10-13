import type { UniformAsset, UniformAssetRef, UniformDesign, StudioUniformDesign, UniformModelDefinition } from '../index';

const profiles = {
  "classic": {
    "outer": "M248 77 C226 79 201 88 180 101 C151 120 117 147 90 170 Q85 174 89 182 L126 250 Q130 257 136 254 L181 228 C187 275 184 311 183 346 C181 411 181 478 177 548 Q177 553 183 554 Q300 569 417 554 Q423 553 423 548 C419 478 419 411 417 346 C416 311 413 275 419 228 L464 254 Q470 257 474 250 L511 182 Q515 174 510 170 C483 147 449 120 420 101 C399 88 374 79 352 77",
    "body": "M248 77 C226 79 202 88 182 102 C179 129 181 155 188 181 Q194 207 181 228 C187 275 184 311 183 346 C181 411 181 478 177 548 Q177 553 183 554 Q300 569 417 554 Q423 553 423 548 C419 478 419 411 417 346 C416 311 413 275 419 228 Q406 207 412 181 C419 155 421 129 418 102 C398 88 374 79 352 77",
    "sleeveSeam": "M182 102 C179 129 181 155 188 181 Q194 207 181 228",
    "sideSeam": "M181 228 C195 279 193 324 191 371 L187 540",
    "hem": "M183 544 Q300 559 417 544",
    "cuff": "M89 173 L128 252 L140 247 L101 163 Z",
    "cuffSeam": "M101 168 L138 248"
  },
  "raglan": {
    "outer": "M248 77 C224 80 203 85 182 98 C157 118 122 147 96 174 Q92 178 95 184 L130 251 Q134 258 141 254 L184 231 C192 271 194 314 192 350 C189 414 187 480 182 541 Q182 547 188 548 Q300 563 412 548 Q418 547 418 541 C413 480 411 414 408 350 C406 314 408 271 416 231 L459 254 Q466 258 470 251 L505 184 Q508 178 504 174 C478 147 443 118 418 98 C397 85 376 80 352 77",
    "body": "M248 77 L241 88 C222 124 205 169 184 231 C192 271 194 314 192 350 C189 414 187 480 182 541 Q182 547 188 548 Q300 563 412 548 Q418 547 418 541 C413 480 411 414 408 350 C406 314 408 271 416 231 C395 169 378 124 359 88 L352 77",
    "sleeveSeam": "M241 88 C222 124 205 169 184 231",
    "sideSeam": "M184 231 C203 279 205 330 203 377 L195 535",
    "hem": "M188 538 Q300 553 412 538",
    "cuff": "M95 178 L132 253 L144 249 L107 169 Z",
    "cuffSeam": "M107 172 L142 249"
  },
  "sport": {
    "outer": "M248 77 C226 77 199 87 179 100 C151 119 117 148 87 175 Q83 180 88 187 L127 253 Q131 260 138 256 L182 230 C191 277 190 317 188 353 C184 419 184 487 179 547 Q178 554 185 555 Q300 570 415 555 Q422 554 421 547 C416 487 416 419 412 353 C410 317 409 277 418 230 L462 256 Q469 260 473 253 L512 187 Q517 180 513 175 C483 148 449 119 421 100 C401 87 374 77 352 77",
    "body": "M248 77 C226 77 202 87 182 103 C185 133 192 162 193 185 Q194 211 182 230 C191 277 190 317 188 353 C184 419 184 487 179 547 Q178 554 185 555 Q300 570 415 555 Q422 554 421 547 C416 487 416 419 412 353 C410 317 409 277 418 230 Q406 211 407 185 C408 162 415 133 418 103 C398 87 374 77 352 77",
    "sleeveSeam": "M182 103 C185 133 192 162 193 185 Q194 211 182 230",
    "sideSeam": "M182 230 C208 279 210 332 205 389 L198 541",
    "hem": "M185 545 Q300 560 415 545",
    "cuff": "M87 179 L129 255 L143 248 L100 168 Z",
    "cuffSeam": "M101 175 L140 247"
  }
};
export const BUILTIN_UNIFORM_MODELS: UniformAsset[] = Object.entries(profiles).map(([key,profile]) => ({
  id: 'builtin-model-'+key, kind: 'model', name: key==='classic'?'クラシック':key==='raglan'?'ラグラン':'スポーツ',
  category:'基本モデル',description:'独自名称の基本モデル',status:'published',sort_order:0,revision:1,builtin:true,
  width:600,height:640,color_mode:'original',placement:'all',scale:100,
  model_definition:{format:'physiproof-uniform-model',version:1,view_box:'0 0 600 640',front:profile,back:profile},
  image_path:null,thumbnail_path:null,drawing_available:false,
}));
export function builtinUniformAsset(ref: UniformAssetRef): UniformAsset | undefined {
  return ref.revision === 1 ? BUILTIN_UNIFORM_MODELS.find(a=>a.id===ref.id) : undefined;
}
export function createStudioUniform(previous?: UniformDesign): StudioUniformDesign {
  if(previous?.version===2)return structuredClone(previous);
  return {version:2,model:{id:'builtin-model-'+(previous?.base_id==='raglan'?'raglan':'classic'),revision:1},
    front_pattern:'none',back_pattern:'none',fabric:'knit',emblem:'shield',emblem_position:'left',
    colors:{body:previous?.colors.body??'#172333',accent:previous?.colors.pattern??'#42dfe5',detail:previous?.colors.line??'#ffffff',text:previous?.colors.text??'#ffffff'},
    jersey_name:previous?.jersey_name??'',number:previous?.number??'',name_font:'athletic',number_font:'athletic',
    name_position:'high',number_position:'middle',name_size:18,number_size:116};
}
export function uniformAssetReferences(design: UniformDesign): {kind:'model'|'pattern'|'emblem';ref:UniformAssetRef}[] {
  if(design.version===1)return [];
  return [{kind:'model' as const,ref:design.model},
    ...[design.front_pattern,design.back_pattern].filter((p):p is UniformAssetRef=>typeof p!=='string').map(ref=>({kind:'pattern' as const,ref})),
    ...(typeof design.emblem==='string'?[]:[{kind:'emblem' as const,ref:design.emblem}])];
}
export function modelFile(definition: UniformModelDefinition) { return JSON.stringify(definition,null,2); }
