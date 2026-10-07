import React, { useEffect, useState } from 'react';
import { uniformTemplateListSchema } from '@my-app/shared';
import type { UniformDesign, UniformTemplateList } from '@my-app/shared';
import client from '../lib/hc';
import UniformPreview from './UniformPreview';
import InfoHint from './InfoHint';

export default function UniformTemplatePicker({ editable, refreshKey, onSelect }: {
  editable: boolean; refreshKey: number; onSelect: (design: UniformDesign) => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'front' | 'back'>('front');
  const [catalog, setCatalog] = useState<UniformTemplateList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim().slice(0, 80)); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    void (async () => {
      try {
        const res = await client.api.uniforms.templates.$get({ query: { search: query, category, page: String(page), limit: '12' } });
        const data = await res.json();
        if (!res.ok) throw new Error('error' in data ? data.error : 'テンプレートを読み込めませんでした。');
        const parsed = uniformTemplateListSchema.parse(data);
        if (!cancelled) {
          if (page > 1 && (page - 1) * 12 >= parsed.total) { setPage(Math.max(1, Math.ceil(parsed.total / 12))); }
          else setCatalog(parsed);
        }
      } catch (err) { if (!cancelled) { setCatalog(null); setError(err instanceof Error ? err.message : 'テンプレートを読み込めませんでした。'); } }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [query, category, page, refreshKey, reload]);
  return <section className="pp-uniform-catalog">
    <div className="pp-uniform-heading"><h3>完成品から選ぶ</h3><InfoHint label="ユニフォームテンプレート" text="管理者が公開したデザインです。選択後に色や柄を調整して保存できます。保存したユニフォームはテンプレートの更新・非公開化の影響を受けません。" /></div>
    <div className="pp-uniform-catalog-filters">
      <label>検索<input aria-label="テンプレート検索" value={search} maxLength={80} onChange={event => setSearch(event.target.value)} placeholder="名前・カテゴリ" type="search" /></label>
      <label>カテゴリ<select aria-label="テンプレートカテゴリ" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>
        <option value="">すべて</option>{catalog?.categories.map(value => <option key={value} value={value}>{value}</option>)}
        {category && !catalog?.categories.includes(category) && <option value={category}>{category}</option>}
      </select></label>
      <button type="button" onClick={() => setReload(value => value + 1)} disabled={loading}>一覧を更新</button>
    </div>
    <div className="pp-uniform-view-switch" role="group" aria-label="テンプレートの向き">
      <button type="button" aria-pressed={view === 'front'} onClick={() => setView('front')}>正面</button>
      <button type="button" aria-pressed={view === 'back'} onClick={() => setView('back')}>背面</button>
    </div>
    {loading && <p role="status">テンプレートを読み込み中…</p>}
    {error && <p role="alert" className="pp-uniform-error">{error}<button type="button" onClick={() => setReload(value => value + 1)}>再試行</button></p>}
    {catalog && !loading && <><div className="pp-uniform-presets pp-uniform-catalog-grid">
      {catalog.templates.map(template => <button type="button" key={template.id} disabled={!editable} aria-label={template.name + 'のテンプレートを使う'}
        onClick={() => onSelect(structuredClone(template.design))}>
        <UniformPreview design={template.design} view={view} compact label={template.name} />
        <strong>{template.name}</strong><small>{template.category}</small>{template.description && <span>{template.description}</span>}
      </button>)}
    </div>
    {!catalog.templates.length && <p>公開中のテンプレートが見つかりません。</p>}
    <div className="pp-uniform-catalog-pages">
      <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>前へ</button>
      <span>{page} / {Math.max(1, Math.ceil(catalog.total / 12))} · {catalog.total}件</span>
      <button type="button" disabled={page * 12 >= catalog.total} onClick={() => setPage(value => value + 1)}>次へ</button>
    </div></>}
  </section>;
}
