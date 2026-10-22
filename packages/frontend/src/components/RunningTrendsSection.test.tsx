import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {runningTrendWindow,type RunningTrendResponse} from '@my-app/shared';
import {RunningTrendChart} from './RunningTrendsSection';
import ProfileVitalsForm from './ProfileVitalsForm';
import {DASHBOARD_MENUS,dashboardMenuVisibility,initialDashboardTab} from '../lib/dashboardMenus';

const fixture=(scope:'personal'|'community'):RunningTrendResponse=>({
  ...runningTrendWindow(4),weeks:4,scope,timezone:'Asia/Tokyo',method:'run_starts',sharing:false,min_participants:5,
  cells:Array.from({length:84},(_,i)=>({weekday:Math.floor(i/12),slot:i%12,level:scope==='community'?'insufficient':'none',count:scope==='community'?null:0})),
  summary:scope==='community'?null:{runs:0,distance_m:0},
} as RunningTrendResponse);
describe('independent running trends UI and navigation',()=>{
  it('renders a labelled 7 by 12 heatmap without exact community counts',()=>{
    const html=renderToStaticMarkup(<RunningTrendChart data={fixture('community')}/>);
    expect(html.match(/<td /g)).toHaveLength(84);
    expect(html).toContain('月曜日 0〜2時：データ不足');
    expect(html).toContain('日曜日 22〜24時：データ不足');
    expect(html).not.toContain('0回');
    const own=renderToStaticMarkup(<RunningTrendChart data={fixture('personal')}/>);
    expect(own).toContain('月曜日 0〜2時：0回');
  });
  it('uses a single menu set for desktop, mobile and admin, without retired deep links',()=>{
    expect(DASHBOARD_MENUS.map(m=>m.key)).toEqual(['home','map','trends','uniform','meal','friends','team','ranking']);
    expect(initialDashboardTab('?tab=trends')).toBe('trends');
    for(const tab of ['chat','ai-predict','unknown'])expect(initialDashboardTab('?tab='+tab)).toBe('home');
    expect(dashboardMenuVisibility({show_running_trends_menu:'false',show_chat_menu:'true'})).toMatchObject({trends:false,map:true});
    const source=readFileSync(new URL('../pages/Dashboard.tsx',import.meta.url),'utf8');
    expect(source.match(/DASHBOARD_MENUS.filter/g)).toHaveLength(2);
    expect(source).not.toMatch(/import (ChatSection|AIPredictSection)/);
    expect(source).toContain('<RunningTrendsSection');
    expect(source).toContain('onVitalsSaved={handleVitalsSaved}');
  });
  it('keeps body values editable independently, optional and private with 16px mobile inputs',()=>{
    const html=renderToStaticMarkup(<ProfileVitalsForm current={{current_weight:65,height:170}}/>);
    expect(html).toContain('現在の体重（kg）');expect(html).toContain('身長（cm）');
    expect(html).toContain('name="current_weight"');expect(html).toContain('name="height"');
    expect(html).toContain('font-size:16px');expect(html).toContain('min-height:46px');
    expect(html).toContain('公開されません');expect(html).not.toContain('required=');
  });
});
