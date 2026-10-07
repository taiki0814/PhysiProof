import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { uniformDesignSchema, uniformPersonalizationSchema, uniformStateSchema, personalizeUniform,
  UNIFORM_BASES, UNIFORM_PATTERNS, UNIFORM_LINES, UNIFORM_EMBLEMS, UNIFORM_POSITIONS, UNIFORM_FONTS, UNIFORM_PRESETS } from '@my-app/shared';
import type { UniformDesign, UniformPersonalization, UniformState } from '@my-app/shared';
import client from '../lib/hc';
import InfoHint from './InfoHint';
import UniformPreview from './UniformPreview';
import UniformTemplatePicker from './UniformTemplatePicker';
import './UniformSection.css';

export async function fetchUniformState(): Promise<UniformState> {
  const res = await client.api.uniforms.me.$get();
  const data = await res.json();
  if (!res.ok || !('uniforms' in data)) throw new Error('error' in data ? data.error : 'ユニフォームを読み込めませんでした。');
  return uniformStateSchema.parse(data.uniforms);
}

async function savedRevision(res: Response): Promise<number> {
  const data = await res.json() as { error?: string; revision?: number };
  if (!res.ok || typeof data.revision !== 'number') throw new Error(data.error || '保存できませんでした。');
  return data.revision;
}

function Choice<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { id: T; name: string }[]; value: T; onChange: (value: T) => void;
}) {
  return <div className="pp-uniform-field"><span>{label}</span><div className="pp-uniform-choices" role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.id} aria-pressed={value === option.id}
      onClick={() => onChange(option.id)}>{option.name}</button>)}
  </div></div>;
}

function LetteringForm({ team, online, onSaved, onPreview }: {
  team: NonNullable<UniformState['team']>; online: boolean;
  onSaved: (value: UniformPersonalization, revision: number) => void;
  onPreview: (value: UniformPersonalization) => void;
}) {
  const { register, handleSubmit, watch, reset, formState: { errors, isDirty, isSubmitting } } = useForm<UniformPersonalization>({
    resolver: zodResolver(uniformPersonalizationSchema), defaultValues: team.personalization,
  });
  const [message, setMessage] = useState('');
  const name = watch('jersey_name');
  const number = watch('number');
  useEffect(() => { reset(team.personalization); }, [team.personalization_revision, team.id, reset]);
  useEffect(() => { onPreview({ jersey_name: name, number }); }, [name, number, onPreview]);
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
  return <form className="pp-uniform-lettering" onSubmit={handleSubmit(async value => {
    if (!online) { setMessage('オンラインで保存してください。'); return; }
    setMessage('');
    try {
      const revision = await savedRevision(await client.api.uniforms.team[':teamId'].personalization.$put({
        param: { teamId: team.id }, json: { personalization: value, revision: team.personalization_revision },
      }));
      reset(value); onSaved(value, revision); setMessage('自分の名前・背番号を保存しました。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存できませんでした。'); }
  })}>
    <div className="pp-uniform-heading"><h3>自分の名前・背番号</h3><InfoHint label="チームの名前・背番号" text="共通の柄や色はそのままに、自分の名前と背番号だけ変更できます。他のメンバーには影響しません。" /></div>
    <div className="pp-uniform-input-grid">
      <label>ユニフォーム名札<input {...register('jersey_name')} aria-label="ユニフォーム名札" maxLength={12} autoComplete="off" placeholder="表示名" aria-invalid={!!errors.jersey_name} /></label>
      <label>背番号<input {...register('number')} aria-label="背番号" maxLength={3} inputMode="numeric" autoComplete="off" placeholder="00" aria-invalid={!!errors.number} /></label>
    </div>
    {(errors.jersey_name || errors.number) && <p role="alert">{errors.jersey_name?.message || errors.number?.message}</p>}
    <button type="submit" className="pp-uniform-save" disabled={!online || !isDirty || isSubmitting}>{isSubmitting ? '保存中…' : '名前・背番号を保存'}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}

export function UniformDesignEditor({ design: saved, revision, isTeam, editable, lettering, online, onSave,
  saveLabel, externalDirty = false, onDirtyChange, selectedPreset, showPresets = true }: {
  design: UniformDesign; revision: number; isTeam: boolean; editable: boolean;
  lettering?: UniformPersonalization; online: boolean;
  onSave: (value: UniformDesign, revision: number) => Promise<void>;
  saveLabel?: string; externalDirty?: boolean; onDirtyChange?: (dirty: boolean) => void;
  selectedPreset?: UniformDesign; showPresets?: boolean;
}) {
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty, isSubmitting } } = useForm<UniformDesign>({
    resolver: zodResolver(uniformDesignSchema), defaultValues: saved,
  });
  const design = watch();
  const [view, setView] = useState<'front' | 'back'>('front');
  const [message, setMessage] = useState('');
  useEffect(() => { reset(saved); }, [revision, reset]);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => {
    if (selectedPreset) { reset({ ...selectedPreset, jersey_name: watch('jersey_name'), number: watch('number') }, { keepDefaultValues: true }); setMessage(''); }
  }, [selectedPreset, reset, watch]);
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
  const change = <K extends keyof UniformDesign>(key: K, value: UniformDesign[K]) => {
    setValue(key, value as never, { shouldDirty: true, shouldValidate: true }); setMessage('');
  };
  const preview = isTeam && lettering ? personalizeUniform(design, lettering) : design;
  const colors = [{ id: 'body', name: '本体' }, { id: 'secondary', name: '袖・サブ' }, { id: 'collar', name: '襟' },
    { id: 'pattern', name: '柄' }, { id: 'line', name: 'ライン' }, { id: 'emblem', name: 'エンブレム' }, { id: 'text', name: '文字' }] as const;
  return <form className="pp-uniform-editor" onSubmit={handleSubmit(async value => {
    if (!editable || !online) return;
    setMessage('');
    try { await onSave(value, revision); reset(value); setMessage('ユニフォームを保存しました。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存できませんでした。'); }
  })}>
    <div className="pp-uniform-preview-panel">
      <div className="pp-uniform-preview-top"><span className="pp-uniform-kicker">{saveLabel ? 'TEMPLATE' : isTeam ? 'TEAM KIT' : 'PERSONAL KIT'}</span><span>{isDirty || externalDirty ? '未保存の変更あり' : revision ? '保存済み' : '初期デザイン'}</span></div>
      <UniformPreview design={preview} view={view} label={`${isTeam ? 'チーム' : '個人'}ユニフォーム・${view === 'front' ? '正面' : '背面'}`} />
      <div className="pp-uniform-view-switch" role="group" aria-label="プレビューの向き">
        <button type="button" aria-pressed={view === 'front'} onClick={() => setView('front')}>正面</button>
        <button type="button" aria-pressed={view === 'back'} onClick={() => setView('back')}>背面</button>
      </div>
      <small>独自デザイン / 2Dプレビュー</small>
      {message && <p className="pp-uniform-message" role="status">{message}</p>}
      {Object.keys(errors).length > 0 && <p role="alert" className="pp-uniform-error">入力内容を確認してください。名前は12文字以内、背番号は3桁以内の数字です。</p>}
      {editable && <div className="pp-uniform-actions">
        <button type="submit" className="pp-uniform-save" disabled={!online || !(isDirty || externalDirty) || isSubmitting}>{isSubmitting ? '保存中…' : saveLabel || (isTeam ? 'チーム共通デザインを保存' : '個人ユニフォームを保存')}</button>
        <button type="button" disabled={!isDirty || isSubmitting} onClick={() => {
          if (window.confirm('未保存の変更を破棄して、保存済みのデザインに戻しますか？')) { reset(saved); setMessage(''); }
        }}>保存済みに戻す</button>
      </div>}
    </div>
    <fieldset className="pp-uniform-controls" disabled={!editable || isSubmitting}>
      <legend className="pp-uniform-sr-only">ユニフォームデザイン</legend>
      {showPresets && <section><div className="pp-uniform-heading"><h3>完成品から選ぶ</h3><InfoHint label="ユニフォームテンプレート" text="テンプレートを選んでから、柄・色・装飾を自由に調整できます。選択だけでは保存されません。" /></div>
        <div className="pp-uniform-presets">{UNIFORM_PRESETS.map(preset => <button type="button" key={preset.id} aria-label={`${preset.name}のテンプレートを使う`}
          onClick={() => { reset({ ...preset.design, jersey_name: design.jersey_name, number: design.number }, { keepDefaultValues: true }); setMessage(''); }}>
          <UniformPreview design={preset.design} compact label={preset.name} /><span>{preset.name}</span>
        </button>)}</div>
      </section>}
      <section><h3>形・柄・ライン</h3>
        <Choice label="服の形" options={UNIFORM_BASES} value={design.base_id} onChange={v => change('base_id', v)} />
        <Choice label="柄" options={UNIFORM_PATTERNS} value={design.pattern_id} onChange={v => change('pattern_id', v)} />
        <Choice label="ライン" options={UNIFORM_LINES} value={design.line_id} onChange={v => change('line_id', v)} />
        <label className="pp-uniform-range">ラインの太さ <output>{design.line_width}</output><input type="range" min="2" max="12" step="1" {...register('line_width', { valueAsNumber: true })} /></label>
      </section>
      <section><h3>配色</h3><div className="pp-uniform-colors">{colors.map(color => <label key={color.id}>
        <input type="color" aria-label={`${color.name}の色`} {...register(`colors.${color.id}`)} /><span>{color.name}</span>
      </label>)}</div></section>
      <section><h3>エンブレム</h3>
        <Choice label="エンブレムの種類" options={UNIFORM_EMBLEMS} value={design.emblem_id} onChange={v => change('emblem_id', v)} />
        <Choice label="取り付け位置" options={UNIFORM_POSITIONS} value={design.emblem_position} onChange={v => change('emblem_position', v)} />
        <label className="pp-uniform-range">大きさ <output>{design.emblem_size.toFixed(1)}倍</output><input type="range" min="0.7" max="1.5" step="0.1" {...register('emblem_size', { valueAsNumber: true })} /></label>
        <label className="pp-uniform-range">左右の微調整 <output>{design.emblem_offset_x}</output><input type="range" min="-8" max="8" step="1" {...register('emblem_offset_x', { valueAsNumber: true })} /></label>
        <label className="pp-uniform-range">上下の微調整 <output>{design.emblem_offset_y}</output><input type="range" min="-8" max="8" step="1" {...register('emblem_offset_y', { valueAsNumber: true })} /></label>
      </section>
      <section><h3>{isTeam ? '共通の文字スタイル' : '名前・背番号'}</h3>
        {!isTeam && <div className="pp-uniform-input-grid">
          <label>ユニフォーム名札<input {...register('jersey_name')} aria-label="ユニフォーム名札" maxLength={12} autoComplete="off" placeholder="表示名" aria-invalid={!!errors.jersey_name} />{errors.jersey_name && <small>{errors.jersey_name.message}</small>}</label>
          <label>背番号<input {...register('number')} aria-label="背番号" maxLength={3} inputMode="numeric" autoComplete="off" placeholder="00" aria-invalid={!!errors.number} />{errors.number && <small>{errors.number.message}</small>}</label>
        </div>}
        <Choice label="書体" options={UNIFORM_FONTS} value={design.font_id} onChange={v => change('font_id', v)} />
      </section>
    </fieldset>
  </form>;
}

export default function UniformSection({ state, error, onChange, onReload }: {
  state: UniformState | null; error: string; onChange: (update: (value: UniformState) => UniformState) => void; onReload: () => Promise<boolean>;
}) {
  const [scope, setScope] = useState<'personal' | 'team'>('personal');
  const [online, setOnline] = useState(navigator.onLine);
  const [lettering, setLettering] = useState<UniformPersonalization>({ jersey_name: '', number: '' });
  const [reloadKey, setReloadKey] = useState(0);
  const [personalPreset, setPersonalPreset] = useState<UniformDesign>();
  const [teamPreset, setTeamPreset] = useState<{ teamId: string; design: UniformDesign }>();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (!state) return <div className="pp-uniform-section">{error ? <><p role="alert">{error}</p><button onClick={() => void onReload()}>再読み込み</button></> : <p role="status">ユニフォームを読み込み中…</p>}</div>;
  return <div className="pp-uniform-section">
    <header className="pp-uniform-heading"><div><span className="pp-uniform-kicker">MAKE YOUR RUN</span><h2>ユニフォーム工房</h2></div>
      <InfoHint label="ユニフォーム編集" text="個人用は自分専用。チーム共通の柄・配色はリーダーが編集し、名前・背番号は各メンバーが設定します。外見だけの変更で、走行距離や得点には影響しません。" />
    </header>
    <div className="pp-uniform-toolbar"><div className="pp-uniform-scopes" role="group" aria-label="編集するユニフォーム">
      <button type="button" aria-pressed={scope === 'personal'} onClick={() => setScope('personal')}>個人用</button>
      <button type="button" aria-pressed={scope === 'team'} onClick={() => setScope('team')}>チーム用</button>
    </div><button type="button" onClick={() => { if (window.confirm('未保存の変更を破棄して最新の設定を読み込みますか？')) {
      void onReload().then(success => { if (success) { setPersonalPreset(undefined); setTeamPreset(undefined); setReloadKey(key => key + 1); } });
    } }}>最新を読み込む</button></div>
    {!online && <p role="alert" className="pp-uniform-error">オフラインです。保存にはオンライン接続が必要です。</p>}
    {error && <p role="alert" className="pp-uniform-error">{error}</p>}
    {(scope === 'personal' || state.team) && <UniformTemplatePicker editable={online && (scope === 'personal' || !!state.team?.can_edit)} refreshKey={reloadKey}
      onSelect={design => { if (scope === 'personal') setPersonalPreset(design); else if (state.team) setTeamPreset({ teamId: state.team.id, design }); }} />}
    <div hidden={scope !== 'personal'}><UniformDesignEditor key={`personal-${reloadKey}`} {...state.personal} editable online={online} isTeam={false} showPresets={false} selectedPreset={personalPreset}
      onSave={async (design, revision) => {
        const next = await savedRevision(await client.api.uniforms.personal.$put({ json: { design, revision } }));
        onChange(current => ({ ...current, personal: { design, revision: next } }));
      }} /></div>
    <div hidden={scope !== 'team'}>{state.team ? <>
      <div className="pp-uniform-team-note"><strong>{state.team.name}</strong><span>{state.team.can_edit ? 'リーダー · 共通デザインを編集できます' : '共通デザインはリーダーが編集します'}</span></div>
      <LetteringForm key={`lettering-${state.team.id}-${reloadKey}`} team={state.team} online={online} onPreview={setLettering}
        onSaved={(personalization, revision) => onChange(current => ({ ...current, team: current.team && current.team.id === state.team?.id ? { ...current.team, personalization, personalization_revision: revision } : current.team }))} />
      <UniformDesignEditor key={`team-${state.team.id}-${reloadKey}`} design={state.team.design} revision={state.team.revision}
        editable={state.team.can_edit} lettering={lettering} online={online} isTeam showPresets={false} selectedPreset={teamPreset?.teamId === state.team.id ? teamPreset.design : undefined}
        onSave={async (design, revision) => {
          if (!state.team?.can_edit) return;
          const next = await savedRevision(await client.api.uniforms.team[':teamId'].$put({ param: { teamId: state.team.id }, json: { design, revision } }));
          onChange(current => ({ ...current, team: current.team && current.team.id === state.team?.id ? { ...current.team, design, revision: next } : current.team }));
        }} />
    </> : <div className="pp-uniform-empty">チームに所属すると、共通ユニフォームと自分の背番号を設定できます。</div>}</div>
  </div>;
}
