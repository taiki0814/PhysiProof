import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import ExternalRunningPanel from './ExternalRunningPanel';
describe('external reference mileage presentation',()=>{
  it('labels separate totals/windows and does not offer browser native reads or combine mileage',()=>{
    const html=renderToStaticMarkup(<ExternalRunningPanel userId="fixture" appDistanceM={12345}/>);
    expect(html).toContain('12.35');expect(html).toContain('アプリ計測');expect(html).toContain('外部連携 · 参考記録');expect(html).toContain('直近30日');
    expect(html).toContain('合算しません');expect(html).toContain('Android 14');expect(html).toContain('Web・iPhone版では取り込みできません');
    expect(html).not.toContain('type="checkbox"');expect(html).not.toContain('同意してHealth Connectを連携');
  });
  it('keeps reference imports out of every competitive and progress metric and has non-color source labels',()=>{
    const source=readFileSync(new URL('./ExternalRunningPanel.tsx',import.meta.url),'utf8');
    for(const label of ['対戦得点','チーム貢献','領域','周回','ミッション','ランキング','距離称号'])expect(source).toContain(label);
    expect(source).toContain('pp-external-badge');expect(source).toContain("token.current!==localStorage.getItem('physiproof_access_token')");
    expect(source).not.toContain('client.api.running.sessions');expect(source).not.toContain('localStorage.setItem');
    const css=readFileSync(new URL('./ExternalRunningPanel.css',import.meta.url),'utf8');expect(css).toContain('minmax(0,1fr)');expect(css).toContain('min-height:44px');expect(css).toContain('grid-template-columns:20px minmax(0,1fr)');
  });
});
