import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  googleAuthConfigSchema, googleAuthRequestSchema, googleSignInResultSchema,
  type AuthSessionResponse, type GoogleAuthRequest,
} from '@my-app/shared';
import client from '../lib/hc';
import { readGoogleResponse } from '../lib/googleIdentity';
import GoogleIdentityButton from './GoogleIdentityButton';

const profileSchema = googleAuthRequestSchema.shape.profile.unwrap();
type GoogleProfile = NonNullable<GoogleAuthRequest['profile']>;
const createChallenge = async () => readGoogleResponse(await client.api.auth.google.challenge.$post());

interface GoogleSignInProps {
  onSignedIn: (session: AuthSessionResponse) => void;
  onPasswordLogin: () => void;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}

export default function GoogleSignIn({ onSignedIn, onPasswordLogin, disabled = false, onBusyChange }: GoogleSignInProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [configError, setConfigError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ request: GoogleAuthRequest; expiresAt: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const profileForm = useForm<GoogleProfile>({ resolver: zodResolver(profileSchema), defaultValues: { name: '' } });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setConfigError(false);
    const load = async () => {
      try {
        const config = googleAuthConfigSchema.parse(await readGoogleResponse(await client.api.auth.google.config.$get()));
        if (active) setClientId(config.client_id || null);
      } catch {
        if (active) setConfigError(true);
      }
    };
    void load();
    return () => { active = false; };
  }, [configAttempt]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setPending(null);
      profileForm.reset();
      setError('認証の有効期限が切れました。Google認証からやり直してください。');
    }, Math.max(0, pending.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pending, profileForm]);

  const submit = async (request: GoogleAuthRequest, expiresAt: number) => {
    if (busy.current || disabled) return;
    busy.current = true;
    setSubmitting(true);
    onBusyChange(true);
    setError(null);
    try {
      if (Date.now() >= expiresAt) throw new Error('認証の有効期限が切れました。Google認証からやり直してください。');
      const json = googleAuthRequestSchema.parse(request);
      const result = googleSignInResultSchema.parse(await readGoogleResponse(await client.api.auth.google.signin.$post({ json })));
      if (!mounted.current) return;
      if (result.status === 'signed_in') {
        setPending(null);
        profileForm.reset();
        onSignedIn(result.session);
      } else {
        if (request.profile) throw new Error('登録を完了できませんでした。Google認証からやり直してください。');
        profileForm.reset({ name: result.default_name.trim().slice(0, 50) });
        setPending({ request: json, expiresAt });
      }
    } catch (cause) {
      if (!mounted.current) return;
      // Never replay a credential after a failed or ambiguous request.
      setPending(null);
      profileForm.reset();
      setError(cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'Googleログインを完了できませんでした。再試行してください。');
    } finally {
      busy.current = false;
      if (mounted.current) {
        setSubmitting(false);
        onBusyChange(false);
      }
    }
  };

  const restart = () => {
    setPending(null);
    profileForm.reset();
    setError(null);
    setAttempt(value => value + 1);
  };

  // Config failures are recoverable without exposing disabled-provider UI or loading Google's SDK.
  if (!clientId) return configError ? <button type="button" className="google-auth__secondary" style={{ marginTop: 20 }} disabled={disabled} onClick={() => setConfigAttempt(value => value + 1)}>別のログイン方法を再読み込み</button> : null;

  return (
    <section className="google-auth" aria-label="Googleログイン">
      <h4>{pending ? 'Googleで新規登録' : 'Googleでログイン'}</h4>
      <p className="google-auth__note">すでにアカウントをお持ちの方は、ID・パスワードでログインし、プロフィール設定でGoogleを連携してください。</p>
      {error && <p className="google-auth__error" role="alert">{error}</p>}
      {submitting && <p className="google-auth__note" role="status">Googleの認証を確認しています…</p>}
      {pending ? (
        <form className="google-auth__form" onSubmit={profileForm.handleSubmit(profile => submit({ ...pending.request, profile }, pending.expiresAt))}>
          <p className="google-auth__note">このGoogleアカウントはまだ連携されていません。新しいアカウントを作成する場合は、表示名と年齢を入力してください。</p>
          <div>
            <label htmlFor="google-profile-name">表示名</label>
            <input id="google-profile-name" autoComplete="nickname" maxLength={50} disabled={submitting || disabled} aria-invalid={!!profileForm.formState.errors.name} aria-describedby={profileForm.formState.errors.name ? 'google-profile-name-error' : undefined} {...profileForm.register('name')} />
            {profileForm.formState.errors.name && <p id="google-profile-name-error" className="google-auth__error" role="alert">{profileForm.formState.errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="google-profile-age">年齢</label>
            <input id="google-profile-age" type="number" inputMode="numeric" min={1} max={120} step={1} disabled={submitting || disabled} aria-invalid={!!profileForm.formState.errors.age} aria-describedby="google-profile-age-note google-profile-age-error" {...profileForm.register('age', { valueAsNumber: true })} />
            <p id="google-profile-age-note" className="google-auth__note">他のユーザーには年齢そのものではなく、年代だけが表示されます。</p>
            <p id="google-profile-age-error" className="google-auth__error" role="alert">{profileForm.formState.errors.age?.message}</p>
          </div>
          <button type="submit" className="google-auth__primary" disabled={submitting || disabled}>新しいアカウントを作成</button>
          <button type="button" className="google-auth__secondary" disabled={submitting || disabled} onClick={() => { restart(); onPasswordLogin(); }}>既存のID・パスワードでログイン</button>
          <button type="button" className="google-auth__secondary" disabled={submitting || disabled} onClick={restart}>別のGoogleアカウントでやり直す</button>
        </form>
      ) : error ? (
        <button type="button" className="google-auth__secondary" disabled={submitting || disabled} onClick={restart}>Google認証からやり直す</button>
      ) : (
        <GoogleIdentityButton key={attempt} clientId={clientId} createChallenge={createChallenge} onCredential={(request, expiresAt) => { void submit(request, expiresAt); }} disabled={submitting || disabled} />
      )}
    </section>
  );
}
