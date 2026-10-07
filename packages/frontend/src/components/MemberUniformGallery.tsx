import React, { useEffect, useState } from 'react';
import { memberUniformStateSchema } from '@my-app/shared';
import type { MemberUniformState } from '@my-app/shared';
import client from '../lib/hc';
import UniformPreview from './UniformPreview';
import './UniformSection.css';

export default function MemberUniformGallery({ userId }: { userId: string }) {
  const [uniforms, setUniforms] = useState<MemberUniformState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setUniforms(null); setError('');
    void (async () => {
      try {
        const res = await client.api.uniforms.members[':userId'].$get({ param: { userId } });
        const data = await res.json();
        if (!res.ok || !('uniforms' in data)) throw new Error('ユニフォームを読み込めませんでした。');
        const value = memberUniformStateSchema.parse(data.uniforms);
        if (!cancelled) setUniforms(value);
      } catch { if (!cancelled) setError('ユニフォームを読み込めませんでした。'); }
    })();
    return () => { cancelled = true; };
  }, [userId]);
  if (!uniforms) return <p role={error ? 'alert' : 'status'} style={{ fontSize: '.75rem', color: '#a6b5c8' }}>{error || 'ユニフォームを読み込み中…'}</p>;
  return <div className="pp-uniform-member-gallery">
    <div><span>個人ユニフォーム</span><UniformPreview design={uniforms.personal} compact label="メンバーの個人ユニフォーム" /></div>
    <div><span>チームユニフォーム</span><UniformPreview design={uniforms.team} compact label="メンバーのチームユニフォーム" /></div>
  </div>;
}
