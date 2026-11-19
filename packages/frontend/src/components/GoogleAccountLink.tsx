import { useEffect, useRef, useState } from 'react';
import { googleLinkStatusSchema, googleAuthRequestSchema, type GoogleAuthRequest } from '@my-app/shared';
import client from '../lib/hc';
import { readGoogleResponse } from '../lib/googleIdentity';
import GoogleIdentityButton from './GoogleIdentityButton';

type LinkStatus = ReturnType<typeof googleLinkStatusSchema.parse>;
const createChallenge = async () => readGoogleResponse(await client.api.auth.google.link.challenge.$post());

export default function GoogleAccountLink() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const next = googleLinkStatusSchema.parse(await readGoogleResponse(await client.api.auth.google.link.$get()));
        if (active) setStatus(next);
      } catch {
        if (active) setError('Googleの連携状態を確認できませんでした。再試行してください。');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [attempt]);

  const link = async (request: GoogleAuthRequest) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const json = googleAuthRequestSchema.parse(request);
      const result = await readGoogleResponse(await client.api.auth.google.link.$post({ json }));
      if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true) {
        throw new Error('Googleの連携を確認できませんでした。連携状態を再確認してください。');
      }
      const next = googleLinkStatusSchema.parse(await readGoogleResponse(await client.api.auth.google.link.$get()));
      if (!next.linked) throw new Error('Googleの連携状態を再確認してください。');
      if (mounted.current) setStatus(next);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'Googleを連携できませんでした。再試行してください。');
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  if (loading) return null;
  if (status && !status.client_id) return null;

  return (
    <section className="google-auth" aria-label="Googleアカウント連携" aria-busy={submitting}>
      <h4>Googleアカウント連携</h4>
      {status?.linked ? (
        <p className="google-auth__success" role="status">連携済み{status.email ? `：${status.email}` : ''}</p>
      ) : <p className="google-auth__note">このアカウントにGoogleを連携すると、次回からGoogleでもログインできます。プロフィールの保存とは別に連携します。</p>}
      {error && <p className="google-auth__error" role="alert">{error}</p>}
      {submitting && <p className="google-auth__note" role="status">Googleを連携しています…</p>}
      {error ? (
        <button type="button" className="google-auth__secondary" disabled={submitting} onClick={() => setAttempt(value => value + 1)}>連携状態を再確認してやり直す</button>
      ) : status?.client_id && !status.linked ? (
        <GoogleIdentityButton key={attempt} clientId={status.client_id} createChallenge={createChallenge} onCredential={request => { void link(request); }} disabled={submitting} linking />
      ) : null}
    </section>
  );
}
