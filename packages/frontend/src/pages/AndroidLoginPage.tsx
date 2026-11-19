import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { androidAuthRequestSchema, androidAuthApproveSchema } from '@my-app/shared';
import client from '../lib/hc';
import { androidRequestId } from '../lib/androidApp';
import { readGoogleResponse } from '../lib/googleIdentity';
import '../components/GoogleAuth.css';

export default function AndroidLoginPage() {
  const [params] = useSearchParams();
  const id = androidRequestId(params.get('request'));
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const [sessionSnapshot] = useState(() => localStorage.getItem('physiproof_access_token'));
  let name = '';
  try { name = String(JSON.parse(localStorage.getItem('physiproof_user') || '{}').name || ''); } catch { /* Display only. The server authenticates the approving account. */ }
  const signedIn = !!localStorage.getItem('physiproof_access_token');

  useEffect(() => {
    const checkSession = () => {
      if (localStorage.getItem('physiproof_access_token') !== sessionSnapshot) {
        setSessionChanged(true); setReady(false); setCode('');
        setError('別の画面でログイン状態が変わりました。再読み込みしてアカウントを確認してください。');
      }
    };
    window.addEventListener('storage', checkSession);
    window.addEventListener('focus', checkSession);
    return () => { window.removeEventListener('storage', checkSession); window.removeEventListener('focus', checkSession); };
  }, [sessionSnapshot]);

  useEffect(() => {
    let live = true;
    setReady(false); setError(null);
    if (!id) { setError('ログインの依頼を確認できません。foopeアプリからやり直してください。'); return; }
    void (async () => {
      try {
        androidAuthRequestSchema.parse(await readGoogleResponse(await client.api.auth.android[':request_id'].$get({ param: { request_id: id } })));
        if (live) setReady(true);
      } catch { if (live) setError('ログインの依頼が期限切れか、完了済みです。foopeアプリからやり直してください。'); }
    })();
    return () => { live = false; };
  }, [id]);

  const approve = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || busy || done || sessionChanged) return;
    if (!sessionSnapshot || localStorage.getItem('physiproof_access_token') !== sessionSnapshot) {
      setSessionChanged(true); setReady(false); setCode('');
      setError('ログイン状態が変わりました。再読み込みしてアカウントを確認してください。'); return;
    }
    const parsed = androidAuthApproveSchema.safeParse({ confirmation_code: code.replace(/[\s-]/g, '') });
    if (!parsed.success) { setError('アプリに表示された8桁の確認コードを入力してください。'); return; }
    setBusy(true); setError(null);
    try {
      const result = await readGoogleResponse(await client.api.auth.android[':request_id'].approve.$post(
        { param: { request_id: id }, json: parsed.data }, { headers: { Authorization: 'Bearer ' + sessionSnapshot } },
      ));
      if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true) throw new Error('ログインを許可できませんでした。アプリからやり直してください。');
      setDone(true); setCode('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ログインを許可できませんでした。'); }
    finally { setBusy(false); }
  };

  return <main className="android-auth__page">
    <section className="android-auth__card" aria-busy={busy}>
      <p className="android-auth__brand">foope</p>
      <h1>Androidアプリにログイン</h1>
      {done ? <>
        <p className="google-auth__success" role="status">ログインを許可しました。foopeアプリに戻ってください。</p>
        <a className="google-auth__primary android-auth__link" href="foope://auth/return">foopeアプリを開く</a>
        <p className="google-auth__note">開かない場合は、アプリ一覧からfoopeに切り替えてください。</p>
      </> : ready && signedIn ? <form onSubmit={event => { void approve(event); }}>
        <p className="google-auth__note"><strong>{name || '現在のアカウント'}</strong>で、操作中のfoopeアプリへのログインを許可します。</p>
        <label htmlFor="android-confirmation">アプリに表示された確認コード</label>
        <input id="android-confirmation" className="android-auth__input" value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="off" maxLength={11} placeholder="8桁の数字" disabled={busy} required />
        <p className="google-auth__note">ご自身でfoopeアプリから開始した場合だけ入力してください。確認コードの有効期限は5分です。</p>
        <button type="submit" className="google-auth__primary" disabled={busy}>{busy ? '確認しています…' : 'このアカウントでアプリにログイン'}</button>
        <Link className="android-auth__link" to={'/login?app_request=' + id}>別のアカウントでログイン</Link>
      </form> : ready ? <>
        <p className="google-auth__note">GoogleまたはID・パスワードでfoopeにログインした後、アプリの確認コードを入力します。</p>
        <Link className="google-auth__primary android-auth__link" to={'/login?app_request=' + id}>ログインへ進む</Link>
      </> : !error ? <p role="status">ログインの依頼を確認しています…</p> : null}
      {error && <p className="google-auth__error" role="alert">{error}</p>}
      {sessionChanged && <button type="button" className="google-auth__secondary" onClick={() => window.location.reload()}>アカウントを再確認</button>}
    </section>
  </main>;
}
