import { useEffect, useRef, useState } from 'react';
import { androidAuthStartResultSchema, androidAuthExchangeResultSchema, type AuthSessionResponse } from '@my-app/shared';
import client from '../lib/hc';
import { createAndroidProof, openAndroidBrowser } from '../lib/androidApp';
import { readGoogleResponse } from '../lib/googleIdentity';
import './GoogleAuth.css';

type Attempt = { requestId: string; proof: string; expires: number };
export default function AndroidSignIn({ onSignedIn, onBusyChange, disabled = false }: {
  onSignedIn: (session: AuthSessionResponse) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean;
}) {
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const generation = useRef(0);
  const polling = useRef(false);
  const callbacks = useRef({ onSignedIn, onBusyChange });
  callbacks.current = { onSignedIn, onBusyChange };

  const cancel = () => {
    generation.current++; attempt.current = null; setWaiting(false); setCode(''); callbacks.current.onBusyChange(false);
  };
  useEffect(() => () => { generation.current++; attempt.current = null; }, []);

  useEffect(() => {
    if (!waiting) return;
    const poll = async () => {
      const current = attempt.current;
      if (!current || polling.current || document.visibilityState === 'hidden') return;
      polling.current = true;
      try {
        if (Date.now() >= current.expires) throw new Error('ログインの有効期限が切れました。もう一度お試しください。');
        const result = androidAuthExchangeResultSchema.parse(await readGoogleResponse(
          await client.api.auth.android[':request_id'].exchange.$post({ param: { request_id: current.requestId }, json: { proof: current.proof } }),
        ));
        if (attempt.current !== current) return;
        if (result.status === 'signed_in') {
          cancel(); callbacks.current.onSignedIn(result.session);
        }
      } catch (cause) {
        if (attempt.current !== current) return;
        cancel(); setError(cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'ログインを確認できませんでした。やり直してください。');
      } finally { polling.current = false; }
    };
    const timer = window.setInterval(() => { void poll(); }, 2500);
    const resume = () => { void poll(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    void poll();
    return () => { window.clearInterval(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [waiting]);

  const start = async () => {
    if (waiting || disabled) return;
    const run = ++generation.current;
    setWaiting(true); setError(null); callbacks.current.onBusyChange(true);
    try {
      const { proof, proof_hash } = await createAndroidProof();
      const result = androidAuthStartResultSchema.parse(await readGoogleResponse(await client.api.auth.android.start.$post({ json: { proof_hash } })));
      if (generation.current !== run) return;
      attempt.current = { proof, requestId: result.request_id, expires: Math.min(Date.parse(result.expires_at), Date.now() + 5 * 60 * 1000) };
      setCode(result.confirmation_code);
      await openAndroidBrowser(result.request_id);
    } catch (cause) {
      if (generation.current !== run) return;
      cancel(); setError(cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'ログインを開始できませんでした。再試行してください。');
    }
  };

  return <section className="google-auth" aria-label="AndroidのGoogleログイン">
    <h4>Googleでログイン</h4>
    {waiting ? <>
      <p className="google-auth__note" role="status">ブラウザーでログインし、このコードを入力して許可してください。完了したらfoopeアプリに戻ってください。</p>
      {code && <output className="android-auth__code" aria-label="アプリの確認コード">{code.slice(0, 4)} {code.slice(4)}</output>}
      <button type="button" className="google-auth__secondary" disabled={!code} onClick={() => { const current = attempt.current; if (current) void openAndroidBrowser(current.requestId).catch(() => setError('ブラウザーを開けません。端末の設定を確認してください。')); }}>ブラウザーをもう一度開く</button>
      <button type="button" className="google-auth__secondary" onClick={cancel}>キャンセル</button>
    </> : <>
      <p className="google-auth__note">Chromeなどのブラウザーで本人確認し、同じアカウントでアプリに戻ります。初回は確認コードを入力します。</p>
      <button type="button" className="google-auth__primary" disabled={disabled} onClick={() => { void start(); }}>Googleでログインする</button>
    </>}
    {error && <p className="google-auth__error" role="alert">{error}</p>}
  </section>;
}
