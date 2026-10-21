import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import UniformAdminRecovery from './UniformAdminRecovery';
import {watchUniformAdminLogin} from '../lib/uniformStudio/adminRecovery';

describe('material administrator session recovery',()=>{
  it('opens ordinary re-login separately without asking to reload or discard artwork',()=>{
    const html=renderToStaticMarkup(<UniformAdminRecovery hasDraft checking={false} onRecheck={()=>{}}/>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/login" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('画像・部位分け・入力内容は、このタブに残っています');
    expect(html).toContain('ページの再読み込みは不要');
    expect(html).toContain('type="button"');
    expect(html).toContain('認証を再確認');
    expect(html).not.toContain('password');
  });
  it('explains the separate expiring proof before creating a new draft',()=>{
    const html=renderToStaticMarkup(<UniformAdminRecovery hasDraft={false} checking onRecheck={()=>{}}/>);
    expect(html).toContain('12時間');expect(html).toContain('別タブで管理者として再ログイン');
    expect(html).toContain('disabled=""');expect(html).toContain('認証を確認中…');
  });
  it('rechecks after another tab logs in or the original tab regains focus, with cleanup',()=>{
    const target=new EventTarget(),recheck=vi.fn(),stop=watchUniformAdminLogin(recheck,target);
    target.dispatchEvent(Object.assign(new Event('storage'),{key:'unrelated'}));
    expect(recheck).not.toHaveBeenCalled();
    target.dispatchEvent(Object.assign(new Event('storage'),{key:'physiproof_uniform_admin_token'}));
    target.dispatchEvent(new Event('focus'));
    target.dispatchEvent(Object.assign(new Event('storage'),{key:null}));
    expect(recheck).toHaveBeenCalledTimes(3);
    stop();target.dispatchEvent(new Event('focus'));
    target.dispatchEvent(Object.assign(new Event('storage'),{key:'physiproof_uniform_admin_token'}));
    expect(recheck).toHaveBeenCalledTimes(3);
  });
});
