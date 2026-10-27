import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import RunningCoursesPanel from './RunningCoursesPanel';
import {TeamBattlesPanel} from './TeamBattlesPanel';
import {battleLifetimeTextSchema,parseBattleLifetimeHours,COURSE_REWARDS} from '@my-app/shared';
describe('course cosmetics and numeric battle lifetime UI',()=>{
  it('has a manual decimal textbox, not a fixed lifetime dropdown',()=>{
    const team={id:'11111111-1111-4111-8111-111111111111',owner_id:'owner',name:'host'},opponent={id:'22222222-2222-4222-8222-222222222222',owner_id:'other',name:'other'};
    const html=renderToStaticMarkup(<TeamBattlesPanel currentUserId="owner" currentTeam={team} teams={[team,opponent]}/>);
    expect(html).toContain('領域が消えるまでの時間');expect(html).toContain('inputMode="decimal"');expect(html).toContain('name="hours"');
    expect(parseBattleLifetimeHours('２.５')).toBe(2.5);expect(battleLifetimeTextSchema.safeParse({hours:'2.5'}).success).toBe(true);
    for(const hours of ['-1','0','Infinity','1e5','1,000'])expect(battleLifetimeTextSchema.safeParse({hours}).success).toBe(false);
    expect(battleLifetimeTextSchema.safeParse({hours:''}).success).toBe(true);
  });
  it('explains explicit course recording, separate location statistics and cosmetic-only requirements',()=>{
    const html=renderToStaticMarkup(<RunningCoursesPanel courses={[]} selected="" onSelect={()=>{}} tracking={false} draft={null} onDraftSaved={()=>{}} onReload={()=>{}} userId="fixture" avatar="/avatars/default.png" onEquipment={()=>{}} onUniformApplied={()=>{}}/>);
    expect(html).toContain('マイコース・装飾報酬');expect(html).toContain('性能差はありません');expect(html).toContain('500m');expect(html).toContain('連続でなくても');
    for(const reward of COURSE_REWARDS)expect(html).toContain(reward.name);
    expect(html).toContain('未獲得');expect(html).toContain('disabled');
  });
});
