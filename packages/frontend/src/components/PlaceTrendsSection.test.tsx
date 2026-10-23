import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import PlaceTrendsSection from './PlaceTrendsSection';
import MeasuredStepsCard from './MeasuredStepsCard';
import RunningTrendChart from './RunningTrendChart';
import {runningTrendWindow,type PlaceTrendResponse} from '@my-app/shared';
describe('place trends, separate consent and measured-only display',()=>{
  it('explains app-only historical coverage and starts location sharing off',()=>{
    const html=renderToStaticMarkup(<PlaceTrendsSection/>);
    expect(html).toContain('その場所を通過した過去の傾向');expect(html).toContain('位置情報の統計利用への同意');
    expect(html).toContain('初期設定はオフ');expect(html).not.toContain('checked=""');expect(html).toContain('走行開始の匿名統計');
    expect(html).toContain('type="search"');expect(html).toContain('場所を検索');
  });
  it('labels browser step readings as unavailable and does not synthesize them from calories/distance',()=>{
    const html=renderToStaticMarkup(<MeasuredStepsCard userId="fixture" tracking/>);
    expect(html).toContain('今回の歩数は未計測');expect(html).toContain('対応Androidアプリ');
    const source=readFileSync(new URL('./HomeHubSection.tsx',import.meta.url),'utf8');
    expect(source).not.toContain('caloriesBurnedToday * 25');expect(source).not.toContain('targetBurn * 25');expect(source).toContain('<MeasuredStepsCard');
  });
  it('renders passage timing rather than start timing with no exact community counts',()=>{
    const data:PlaceTrendResponse={...runningTrendWindow(4),weeks:4,place:{id:'public',name:'公共エリア',description:'test',south:35,north:35.01,west:139,east:139.01,active:true},
      timezone:'Asia/Tokyo',method:'place_passages',sharing:false,min_participants:5,min_dates:3,cells:Array.from({length:84},(_,i)=>({weekday:Math.floor(i/12),slot:i%12,level:'insufficient',count:null}))};
    const html=renderToStaticMarkup(<RunningTrendChart data={data}/>);
    expect(html).toContain('通過傾向');expect(html).toContain('3日未満');expect(html.match(/<td /g)).toHaveLength(84);expect(html).not.toContain('0回');
  });
  it('keeps Android native messages origin/main-frame restricted and never bypasses SSL errors',()=>{
    const source=readFileSync(new URL('../../../mobile-native/android/runner/src/main/java/com/physiproof/runner/MainActivity.java',import.meta.url),'utf8');
    expect(source).toContain('Collections.singleton(ORIGIN)');expect(source).toContain('!isMainFrame');expect(source).toContain('handler.cancel()');expect(source).not.toContain('handler.proceed()');
  });
});
