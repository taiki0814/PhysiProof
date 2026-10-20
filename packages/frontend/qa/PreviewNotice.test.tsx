import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import PreviewNotice from './PreviewNotice';

describe('diagnostic fixture is not the administrator application',()=>{
  it('clearly identifies synthetic data and the absence of real persistence',()=>{
    const markup=renderToStaticMarkup(<PreviewNotice/>);
    expect(markup).toContain('テスト専用');expect(markup).toContain('通常の管理画面とは異なります');
    expect(markup).toContain('メモリ内のダミー');expect(markup).toContain('再読み込みすると消えます');
  });
  it('offers real local application routes without bypassing login or connecting to production',()=>{
    const markup=renderToStaticMarkup(<PreviewNotice/>);
    expect(markup).toContain('href="/admin?tab=uniform-templates"');expect(markup).toContain('href="/dashboard?tab=uniform"');
    expect(markup).toContain('未ログイン');expect(markup).toContain('本番データには接続しません');
    expect(markup).not.toMatch(/test-token|pages\.dev|workers\.dev|localStorage/);
  });
});
