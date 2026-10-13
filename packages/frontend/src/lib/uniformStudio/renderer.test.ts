import {describe,it,expect} from 'vitest';
import renderer from './renderer';
import type {RendererInput} from './renderer';
import {BUILTIN_UNIFORM_MODELS} from '@my-app/shared';
const input:RendererInput={view:'front',modelProfile:BUILTIN_UNIFORM_MODELS[0].model_definition!.front,
  base:'#ffffff',accent:'#00ff00',line:'#112233',fabric:'mesh',frontDesign:'stripe',backDesign:'block',emblem:'shield',position:'left',
  playerName:'<script>alert(1)</script>',playerNumber:'123',nameFont:'sans',numberFont:'athletic',namePosition:'high',numberPosition:'middle',nameSize:20,numberSize:110};
describe('versioned studio renderer',()=>{
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
});
