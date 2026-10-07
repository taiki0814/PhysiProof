import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createDefaultUniform, saveUniformTemplateSchema, uniformTemplateListSchema,
  uniformTemplateMetadataSchema, uniformTemplateSchema,
} from '@my-app/shared';
import type { UniformDesign, UniformTemplate, UniformTemplateList, UniformTemplateMetadata } from '@my-app/shared';
import client from '../lib/hc';
import UniformPreview from './UniformPreview';
import { UniformDesignEditor } from './UniformSection';
import './AdminUniformTemplates.css';

const STATUS_LABELS: Record<UniformTemplate['status'], string> = {
  draft: '下書き', published: '公開中', hidden: '非表示',
};

const EMPTY_METADATA: UniformTemplateMetadata = {
  name: '', category: '', description: '', status: 'draft', sort_order: 0,
};

function metadataOf(template: UniformTemplate): UniformTemplateMetadata {
  return {
    name: template.name, category: template.category, description: template.description,
    status: template.status, sort_order: template.sort_order,
  };
}

class TemplateRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function errorMessage(body: unknown, fallback: string): string {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error : fallback;
}

async function readTemplateResponse(response: Response): Promise<UniformTemplate> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new TemplateRequestError(errorMessage(body, 'テンプレートを保存できませんでした。'), response.status);
  }
  if (typeof body !== 'object' || body === null || !('template' in body)) {
    throw new Error('サーバーからのテンプレート情報を確認できませんでした。');
  }
  return uniformTemplateSchema.parse(body.template);
}

export default function AdminUniformTemplates() {
  const [catalog, setCatalog] = useState<UniformTemplateList>({ templates: [], total: 0, categories: [] });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<UniformTemplate['status'] | 'all'>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<'12' | '24'>('12');
  const [view, setView] = useState<'front' | 'back'>('front');
  const [reloadKey, setReloadKey] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [editing, setEditing] = useState<UniformTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDesign, setNewDesign] = useState<UniformDesign>(() => createDefaultUniform());
  const [editorKey, setEditorKey] = useState(0);
  const [designDirty, setDesignDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState('');
  const [editorError, setEditorError] = useState('');
  const [conflict, setConflict] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const {
    register, reset, trigger, getValues,
    formState: { errors, isDirty: metadataDirty },
  } = useForm<UniformTemplateMetadata>({
    resolver: zodResolver(uniformTemplateMetadataSchema), defaultValues: EMPTY_METADATA,
  });
  const hasUnsaved = creating || metadataDirty || designDirty;
  const busy = saving || duplicatingId !== null;
  const editorOpen = creating || editing !== null;
  const pageCount = Math.max(1, Math.ceil(catalog.total / Number(limit)));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError('');
    void (async () => {
      try {
        const response = await client.api.admin['uniform-templates'].$get({ query: {
          search: debouncedSearch, category, status, page: String(page), limit,
        } });
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error(errorMessage(body, 'テンプレート一覧を読み込めませんでした。'));
        }
        const result = uniformTemplateListSchema.parse(body);
        if (!active) return;
        setCatalog(result);
        const lastPage = Math.max(1, Math.ceil(result.total / Number(limit)));
        if (page > lastPage) setPage(lastPage);
      } catch (error) {
        if (active) setListError(error instanceof Error ? error.message : 'テンプレート一覧を読み込めませんでした。');
      } finally {
        if (active) setListLoading(false);
      }
    })();
    return () => { active = false; };
  }, [debouncedSearch, category, status, page, limit, reloadKey]);

  useEffect(() => {
    if (editorKey > 0) editorHeading.current?.focus({ preventScroll: true });
  }, [editorKey]);

  const mayReplaceDraft = () => !hasUnsaved || window.confirm('未保存の変更を破棄して、別のテンプレートを開きますか？');

  const openTemplate = (template: UniformTemplate) => {
    setEditing(template);
    setCreating(false);
    reset(metadataOf(template));
    setDesignDirty(false);
    setEditorError('');
    setConflict(false);
    setEditorKey(key => key + 1);
  };

  const startNew = () => {
    if (busy || !mayReplaceDraft()) return;
    setEditing(null);
    setCreating(true);
    setNewDesign(createDefaultUniform());
    reset(EMPTY_METADATA);
    setDesignDirty(false);
    setNotice('');
    setEditorError('');
    setConflict(false);
    setEditorKey(key => key + 1);
  };

  const refreshList = () => {
    if (busy) return;
    if (hasUnsaved && !window.confirm('未保存の編集内容を保持したまま、一覧を更新しますか？')) return;
    setReloadKey(key => key + 1);
  };

  const duplicateTemplate = async (template: UniformTemplate) => {
    if (busy || !online || !mayReplaceDraft()) return;
    setDuplicatingId(template.id);
    setNotice('');
    setEditorError('');
    try {
      const result = await readTemplateResponse(await client.api.admin['uniform-templates'][':id'].duplicate.$post({
        param: { id: template.id },
      }));
      openTemplate(result);
      setSearch('');
      setDebouncedSearch('');
      setCategory('');
      setStatus('all');
      setPage(1);
      setReloadKey(key => key + 1);
      setNotice(`「${result.name}」を下書きとして複製しました。`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : '複製できませんでした。');
    } finally { setDuplicatingId(null); }
  };

  const saveTemplate = async (design: UniformDesign, revision: number) => {
    if (!online) throw new Error('オンラインで保存してください。');
    setSaving(true);
    setEditorError('');
    setConflict(false);
    setNotice('');
    try {
      if (!await trigger()) throw new Error('テンプレート名・カテゴリなどの入力内容を確認してください。');
      const value = saveUniformTemplateSchema.parse({ ...getValues(), design, revision });
      const response = creating
        ? await client.api.admin['uniform-templates'].$post({ json: { ...value, revision: 0 } })
        : editing
          ? await client.api.admin['uniform-templates'][':id'].$put({ param: { id: editing.id }, json: value })
          : null;
      if (!response) throw new Error('編集するテンプレートを選択してください。');
      const result = await readTemplateResponse(response);
      setEditing(result);
      setCreating(false);
      reset(metadataOf(result));
      setDesignDirty(false);
      setReloadKey(key => key + 1);
      setNotice(`「${result.name}」を${STATUS_LABELS[result.status]}で保存しました。`);
    } catch (error) {
      setConflict(error instanceof TemplateRequestError && error.status === 409);
      setEditorError(error instanceof Error ? error.message : '保存できませんでした。');
      throw error;
    } finally { setSaving(false); }
  };

  return <section className="pp-admin-uniforms pp-uniform-section" aria-labelledby="admin-uniform-templates-title">
    <header className="pp-admin-uniforms-heading">
      <div><span className="pp-uniform-kicker">TEMPLATE STUDIO</span><h2 id="admin-uniform-templates-title">ユニフォームテンプレート</h2>
        <p>公開中のみユーザーに表示。変更しても、保存済みのユニフォームには影響しません。</p></div>
      <div className="pp-admin-uniforms-toolbar">
        <button type="button" className="pp-uniform-save" onClick={startNew} disabled={busy}>新規作成</button>
        <button type="button" onClick={refreshList} disabled={busy || listLoading}>一覧を更新</button>
      </div>
    </header>
    {!online && <p className="pp-admin-uniforms-error" role="alert">オフラインです。保存・複製にはオンライン接続が必要です。</p>}
    {notice && <p className="pp-admin-uniforms-notice" role="status">{notice}</p>}
    {editorError && <div className="pp-admin-uniforms-error" role="alert"><p>{editorError}</p>
      {conflict && <><p>編集内容は保持しています。一覧を更新し、編集ボタンから最新の内容を開き直してください。</p>
        <button type="button" onClick={refreshList} disabled={busy || listLoading}>最新の一覧を読み込む</button></>}
    </div>}

    <div className="pp-admin-uniforms-filters">
      <label className="pp-admin-uniforms-search">テンプレート検索
        <input type="search" aria-label="テンプレート検索" value={search} maxLength={80} autoComplete="off"
          placeholder="名前・カテゴリ・説明で検索" disabled={busy}
          onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>公開状態<select aria-label="テンプレートの公開状態で絞り込み" value={status} disabled={busy}
        onChange={event => { setStatus(event.target.value as typeof status); setPage(1); }}>
        <option value="all">すべて</option><option value="draft">下書き</option><option value="published">公開中</option><option value="hidden">非表示</option>
      </select></label>
      <label>カテゴリ<select aria-label="テンプレートのカテゴリで絞り込み" value={category} disabled={busy}
        onChange={event => { setCategory(event.target.value); setPage(1); }}>
        <option value="">すべて</option>
        {category && !catalog.categories.includes(category) && <option value={category}>{category}</option>}
        {catalog.categories.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>

    <div className="pp-admin-uniforms-list-heading">
      <span>{catalog.total}件{listLoading ? ' · 読み込み中…' : ''}</span>
      <div className="pp-admin-uniforms-view" role="group" aria-label="テンプレート一覧の向き">
        <button type="button" aria-pressed={view === 'front'} onClick={() => setView('front')}>正面</button>
        <button type="button" aria-pressed={view === 'back'} onClick={() => setView('back')}>背面</button>
      </div>
    </div>
    {listError && <p className="pp-admin-uniforms-error" role="alert">{listError}<button type="button" onClick={refreshList} disabled={busy || listLoading}>再試行</button></p>}
    <div className="pp-admin-uniforms-catalog" aria-busy={listLoading}>
      {catalog.templates.map(template => <article key={template.id} className="pp-admin-uniforms-card"
        data-selected={editing?.id === template.id && !creating}>
        <UniformPreview design={template.design} view={view} compact label={`${template.name}・${view === 'front' ? '正面' : '背面'}`} />
        <div className="pp-admin-uniforms-card-top"><span className="pp-admin-uniforms-badge" data-status={template.status}>{STATUS_LABELS[template.status]}</span>
          <small>表示順 {template.sort_order}</small></div>
        <h3>{template.name}</h3><span className="pp-admin-uniforms-category">{template.category}</span>
        {template.description && <p>{template.description}</p>}
        <div className="pp-admin-uniforms-card-actions">
          <button type="button" aria-label={`${template.name}を編集`} disabled={busy || listLoading}
            onClick={() => { if (mayReplaceDraft()) { openTemplate(template); setNotice(''); } }}>編集</button>
          <button type="button" aria-label={`${template.name}を複製`} disabled={busy || listLoading || !online}
            onClick={() => void duplicateTemplate(template)}>{duplicatingId === template.id ? '複製中…' : '複製'}</button>
        </div>
      </article>)}
    </div>
    {!listLoading && !listError && catalog.templates.length === 0 && <p className="pp-admin-uniforms-empty">
      {search || category || status !== 'all' ? '条件に一致するテンプレートがありません。' : 'テンプレートはまだありません。新規作成から追加できます。'}
    </p>}
    <nav className="pp-admin-uniforms-pagination" aria-label="テンプレート一覧のページ">
      <div><button type="button" disabled={busy || listLoading || page <= 1} onClick={() => setPage(value => value - 1)}>前へ</button>
        <span aria-live="polite">{page} / {pageCount}</span>
        <button type="button" disabled={busy || listLoading || page >= pageCount} onClick={() => setPage(value => value + 1)}>次へ</button></div>
      <label>表示件数<select aria-label="テンプレートの表示件数" value={limit} disabled={busy}
        onChange={event => { setLimit(event.target.value as typeof limit); setPage(1); }}><option value="12">12件</option><option value="24">24件</option></select></label>
    </nav>

    {editorOpen && <div className="pp-admin-uniforms-editing">
      <header className="pp-admin-uniforms-editor-heading"><h3 ref={editorHeading} tabIndex={-1}>
        {creating ? '新しいテンプレート' : `「${editing?.name}」を編集`}</h3>
        <button type="button" disabled={busy} onClick={() => {
          if (!mayReplaceDraft()) return;
          setEditing(null); setCreating(false); setDesignDirty(false); reset(EMPTY_METADATA);
          setEditorError(''); setConflict(false);
        }}>編集を閉じる</button></header>
      <fieldset className="pp-admin-uniforms-metadata" disabled={busy}>
        <legend>テンプレート情報</legend>
        <label>テンプレート名<input {...register('name')} aria-label="テンプレート名" maxLength={50} autoComplete="off" aria-invalid={!!errors.name} />
          {errors.name && <small role="alert">{errors.name.message}</small>}</label>
        <label>カテゴリ<input {...register('category')} aria-label="テンプレートカテゴリ" maxLength={30} autoComplete="off" placeholder="例：スポーツ / インク" aria-invalid={!!errors.category} />
          {errors.category && <small role="alert">{errors.category.message}</small>}</label>
        <label className="pp-admin-uniforms-description">説明<textarea {...register('description')} aria-label="テンプレート説明" maxLength={160} rows={2} aria-invalid={!!errors.description} />
          {errors.description && <small role="alert">{errors.description.message}</small>}</label>
        <label>公開設定<select {...register('status')} aria-label="テンプレート公開設定"><option value="draft">下書き</option><option value="published">公開中</option><option value="hidden">非表示</option></select>
          {errors.status && <small role="alert">{errors.status.message}</small>}</label>
        <label>表示順<input type="number" {...register('sort_order', { valueAsNumber: true })} aria-label="テンプレート表示順" min={0} max={999999} step={1} inputMode="numeric" aria-invalid={!!errors.sort_order} />
          {errors.sort_order && <small role="alert">0〜999999の整数を入力してください。</small>}</label>
        <p>表示順は小さい値が先頭。公開状態の変更は保存後に反映されます。</p>
      </fieldset>
      <UniformDesignEditor key={editorKey} design={editing?.design ?? newDesign} revision={editing?.revision ?? 0}
        isTeam={false} editable={!duplicatingId} online={online} onSave={saveTemplate}
        saveLabel="テンプレートを保存" externalDirty={creating || metadataDirty} onDirtyChange={setDesignDirty} showPresets />
    </div>}
  </section>;
}
