import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import UniformRegionEditor from './UniformRegionEditor';

vi.mock('./InfoHint',()=>({default:()=>null}));

describe('region overlay checkbox layout',()=>{
  it('keeps the accessible checkbox and a separately wrapping text column inside one label',()=>{
    const html=renderToStaticMarkup(<UniformRegionEditor png="data:image/png;base64,fixture" onChange={()=>{}}/>);
    expect(html).toMatch(/<label class="pp-region-check"><input[^>]*type="checkbox"[^>]*\/><span>部位の目印を重ねて表示（元画像の色は変わりません）<\/span><\/label>/);
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
  });
  it('bounds the checkbox independently of administrator full-width input rules',()=>{
    const css=readFileSync(new URL('./UniformRegions.css',import.meta.url),'utf8');
    const boxRule=css.match(/\.pp-region-editor \.pp-region-check>input\[type=checkbox\]\{([^}]+)\}/)?.[1];
    expect(boxRule).toContain('max-width:18px');expect(boxRule).toContain('margin:0');
    expect(css).toContain('grid-template-columns:18px minmax(0,1fr)');
    expect(css).toContain('.pp-region-editor .pp-region-check>span{min-width:0');
  });
});
