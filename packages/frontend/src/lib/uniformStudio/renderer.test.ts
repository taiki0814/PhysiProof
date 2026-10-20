import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import renderer from './renderer';
import type {RendererInput} from './renderer';
import {BUILTIN_UNIFORM_MODELS,STUDIO_UNIFORM_COLLECTION,STUDIO_EMBLEM_CHOICES} from '@my-app/shared';
const input:RendererInput={view:'front',modelProfile:BUILTIN_UNIFORM_MODELS[0].model_definition!.front,
  base:'#ffffff',accent:'#00ff00',line:'#112233',fabric:'mesh',frontDesign:'stripe',backDesign:'block',emblem:'shield',position:'left',
  playerName:'<script>alert(1)</script>',playerNumber:'123',nameFont:'sans',numberFont:'athletic',namePosition:'high',numberPosition:'middle',nameSize:20,numberSize:110};
describe('versioned studio renderer',()=>{
  it('keeps the existing three models and their front/back artwork byte-for-byte unchanged',()=>{
    // Captured from the committed renderer before adding the new collection.
    const previous=[
      'd4b7e3280bcc77b77bb45acc3be9bc1ebf3231b4b49aaad20b4fba38097d5603',
      'cd8826ff19f48ba7211c69ba2462404dcd631c11187c7a802a63a9b073ea222f',
      '3baa2671654a4e285437d1fd8519d52d30130fe55590749892bc4a5f0fb2840e',
      'f46ff722bb6fba8a9b778f480a59e142971f19ec7324e94da9bc8348137caf6a',
      'dd55fba101580271f0e0e19d469812a310f0be90ec8e7b786cb2aed2687794ca',
      '2583990dfb27270c3cc27c46e0d25c398686e909263bd64d4f219b3dc36f81e6',
    ];
    const current=BUILTIN_UNIFORM_MODELS.flatMap(model=>(['front','back'] as const).map(view=>
      createHash('sha256').update(renderer.render({...input,view,modelProfile:model.model_definition![view]},
        {prefix:'fixture-'+model.id})).digest('hex')));
    expect(current).toEqual(previous);
  });
  it('renders front/back and each garment with bounded unique SVG ids',()=>{
    for(const model of BUILTIN_UNIFORM_MODELS)for(const view of ['front','back'] as const){
      const svg=renderer.render({...input,view,modelProfile:model.model_definition![view]},{prefix:'fixture-'+model.id});
      expect(svg).toContain('<path');expect(svg).toContain('uniform-fixture-');expect(svg).not.toContain('NaN');expect(svg).not.toContain('<script>');
      expect(svg).toContain(model.model_definition![view].outer);
      if(view==='back')expect(svg).toContain('&lt;script&gt;');
    }
  });
  it('rejects external image URLs and markup in model geometry',()=>{
    const svg=renderer.render({...input,modelProfile:{...input.modelProfile!,outer:'M1" onload="evil'},frontPatternAsset:{kind:'pattern',dataUrl:'https://external.invalid/evil.svg',width:1,height:1,colorMode:'original',placement:'all',scale:100}});
    expect(svg).not.toContain('external.invalid');expect(svg).not.toContain('onload=');
  });
  it('does not include brand wordmarks or iconic tapes',()=>{
    const svg=renderer.render(input);
    expect(svg).not.toMatch(/adidas|nike|puma|swoosh|formstrip/i);
  });
  it.each(STUDIO_UNIFORM_COLLECTION)('renders original $name artwork on both sides without uploaded assets',({design})=>{
    const model=BUILTIN_UNIFORM_MODELS.find(m=>m.id===design.model.id)!;
    const front=renderer.render({...input,modelProfile:model.model_definition!.front,base:design.colors.body,accent:design.colors.accent,
      line:design.colors.detail,frontDesign:String(design.front_pattern),emblem:String(design.emblem)},{prefix:'collection-'+String(design.front_pattern)});
    const back=renderer.render({...input,view:'back',modelProfile:model.model_definition!.back,base:design.colors.body,accent:design.colors.accent,
      line:design.colors.detail,backDesign:String(design.back_pattern),playerName:'RUNNER',playerNumber:'012'},{prefix:'back-'+String(design.back_pattern)});
    for(const svg of [front,back]) {
      expect(svg).toContain(`data-studio-pattern="${design.front_pattern}"`);
      expect(svg).not.toMatch(/NaN|undefined|<script|<image|https?:/);
      const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for(const match of svg.matchAll(/url\(#([^\)]+)\)/g))expect(ids).toContain(match[1]);
    }
    expect(front).toContain(`data-studio-emblem="${design.emblem}"`);
    expect(back).toContain('RUNNER');expect(back).toContain('012');
  });
  it.each(STUDIO_EMBLEM_CHOICES.slice(5))('renders the original %s emblem as bounded vector paths',(emblem)=>{
    const svg=renderer.render({...input,emblem},{prefix:'new-emblem'});
    expect(svg).toContain(`data-studio-emblem="${emblem}"`);
    expect(svg).not.toMatch(/<script|<image|NaN|undefined/);
  });
});
