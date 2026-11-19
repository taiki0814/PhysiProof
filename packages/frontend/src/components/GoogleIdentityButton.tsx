import { useEffect, useRef, useState } from 'react';
import { googleAuthChallengeSchema, type GoogleAuthRequest } from '@my-app/shared';
import { loadGoogleIdentity } from '../lib/googleIdentity';
import { hasNativeRunBridge } from '../lib/nativeRun';
import { hasNativeHealthBridge } from '../lib/nativeHealth';
import { isAndroidApp, openAndroidBrowser } from '../lib/androidApp';
import './GoogleAuth.css';

interface GoogleIdentityButtonProps {
  clientId: string;
  createChallenge: () => Promise<unknown>;
  onCredential: (request: GoogleAuthRequest, expiresAt: number) => void;
  disabled?: boolean;
  linking?: boolean;
}

export default function GoogleIdentityButton({ clientId, createChallenge, onCredential, disabled = false, linking = false }: GoogleIdentityButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ createChallenge, onCredential, disabled });
  callbacks.current = { createChallenge, onCredential, disabled };
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consumed, setConsumed] = useState(false);
  const isNative = isAndroidApp() || hasNativeRunBridge() || hasNativeHealthBridge();

  useEffect(() => {
    if (isNative) return;
    let active = true;
    let used = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const element = container.current;
    setLoading(true);
    setError(null);
    setConsumed(false);

    const prepare = async () => {
      try {
        // Load first so a slow SDK download does not shorten the challenge's five-minute lifetime.
        const identity = await loadGoogleIdentity();
        if (!active) return;
        const startedAt = Date.now();
        const challenge = googleAuthChallengeSchema.parse(await callbacks.current.createChallenge());
        if (!active || !element) return;
        if (challenge.client_id !== clientId) throw new Error('Googleの認証情報が更新されました。画面を開き直してください。');
        const expire = () => {
          used = true;
          element.replaceChildren();
          setError('認証の有効期限が切れました。再試行してください。');
        };
        // Expire slightly before the server deadline, including time spent obtaining the challenge.
        const remaining = 4.5 * 60 * 1000 - (Date.now() - startedAt);
        if (remaining <= 0) { expire(); setLoading(false); return; }
        expiry = setTimeout(expire, remaining);
        identity.initialize({
          client_id: challenge.client_id,
          nonce: challenge.nonce,
          ux_mode: 'popup',
          auto_select: false,
          itp_support: false,
          callback: response => {
            if (!active || used || callbacks.current.disabled) return;
            used = true;
            clearTimeout(expiry);
            element.replaceChildren();
            setConsumed(true);
            callbacks.current.onCredential({ challenge_id: challenge.challenge_id, credential: response.credential }, startedAt + 4.5 * 60 * 1000);
          },
        });
        element.replaceChildren();
        identity.renderButton(element, {
          type: 'standard', theme: 'outline', size: 'large',
          text: linking ? 'continue_with' : 'signin_with',
          width: Math.min(400, Math.max(200, Math.floor(element.parentElement?.getBoundingClientRect().width ?? 200))),
          locale: 'ja',
        });
        setLoading(false);
      } catch (cause) {
        if (!active) return;
        clearTimeout(expiry);
        element?.replaceChildren();
        setLoading(false);
        setError(cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'Googleの認証を準備できませんでした。再試行してください。');
      }
    };
    void prepare();
    return () => {
      active = false;
      used = true;
      clearTimeout(expiry);
      element?.replaceChildren();
    };
  }, [attempt, clientId, isNative, linking]);

  if (isNative) return <>
    <p className="google-auth__note">Googleの連携はブラウザーのプロフィール設定から行います。アプリと同じアカウントでログインして連携してください。連携後はアプリのGoogleログインも使えます。</p>
    <button type="button" className="google-auth__secondary" onClick={() => { void openAndroidBrowser().catch(cause => setError(cause instanceof Error ? cause.message : 'ブラウザーを開けませんでした。')); }}>ブラウザーでfoopeを開く</button>
    {error && <p className="google-auth__error" role="alert">{error}</p>}
  </>;

  return (
    <div aria-busy={loading || disabled}>
      {loading && <p className="google-auth__note" role="status">Google認証を準備しています…</p>}
      <div ref={container} className="google-auth__button" hidden={consumed || !!error || disabled} style={{ visibility: loading ? 'hidden' : undefined }} />
      {error && <p className="google-auth__error" role="alert">{error}</p>}
      {error && <button type="button" className="google-auth__secondary" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Google認証を再試行</button>}
    </div>
  );
}
