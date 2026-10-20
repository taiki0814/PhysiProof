import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AdminNavigation, { ADMIN_SECTIONS } from './AdminNavigation';
import AdminTableScroll from './AdminTableScroll';

vi.mock('./AdminUniformAssets', () => ({ default: () => <form aria-label="素材下書き" /> }));
vi.mock('./AdminUniformTemplates', () => ({ default: () => <form aria-label="完成品下書き" /> }));
import AdminUniformWorkspace from './AdminUniformWorkspace';

describe('responsive administrator controls', () => {
  it.each(ADMIN_SECTIONS)('makes $id reachable in both navigation layouts and identifies the selection', section => {
    const html = renderToStaticMarkup(<AdminNavigation active={section.id} onChange={() => {}} counts={{ users: 6, territories: 0, exercises: 2 }} />);
    expect(html).toContain('aria-label="管理メニュー"');
    expect(html).toContain('for="admin-section-select"');
    expect(html).toContain(`<option value="${section.id}" selected="">`);
    expect(html.match(/<option /g)).toHaveLength(11);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/class="admin-nav-btn active"/g)).toHaveLength(1);
    expect(html).toContain('ユーザー管理 (6)');
    expect(html).toContain('支配領域管理 (0)');
  });

  it('keeps a wide table in a labelled keyboard-scrollable region with a linked hint', () => {
    const html = renderToStaticMarkup(<AdminTableScroll label="監査一覧"><table><tbody><tr><td>監査結果</td></tr></tbody></table></AdminTableScroll>);
    expect(html).toContain('role="region" aria-label="監査一覧"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('左右にスワイプして詳細・操作を確認');
    expect(html).toContain('監査結果');
    const hint = html.match(/<p[^>]* id="([^"]+)"/);
    expect(hint).not.toBeNull();
    expect(html).toContain(`aria-describedby="${hint![1]}"`);
  });

  it('mounts both uniform editors while hiding the inactive view, preserving independent drafts', () => {
    const html = renderToStaticMarkup(<AdminUniformWorkspace />);
    expect(html).toContain('aria-label="ユニフォーム管理の表示"');
    expect(html).toContain('完成品テンプレート');
    expect(html).toContain('aria-label="素材下書き"');
    expect(html).toContain('<div hidden=""><form aria-label="完成品下書き"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
