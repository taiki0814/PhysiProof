import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileVitalsSchema, type ProfileVitals, type ProfileVitalsInput } from '@my-app/shared';
import client from '../lib/hc';

export default function ProfileVitalsForm({ current, onSaved }: {
  current: Partial<ProfileVitals>; onSaved?: (vitals: ProfileVitals) => void;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const form = useForm<ProfileVitalsInput, unknown, ProfileVitals>({
    resolver: zodResolver(profileVitalsSchema),
    defaultValues: { current_weight:current.current_weight ?? '', target_weight:current.target_weight ?? '',
      height:current.height ?? '', gender:current.gender ?? '' },
  });
  const submit = form.handleSubmit(async values => {
    setMessage(''); setError('');
    try {
      const res = await client.api.users.me.vitals.$put({ json: values });
      const body = await res.json();
      if (!res.ok || !('vitals' in body)) throw new Error('error' in body ? String(body.error) : '保存できませんでした。');
      onSaved?.(values); form.reset({...values,gender:values.gender ?? ''});
      setMessage('身体プロフィールを保存しました。');
    } catch(e) { setError(e instanceof Error ? e.message : '通信に失敗しました。'); }
  });
  return <form onSubmit={submit} style={{ overflowY:'auto', minHeight:0, display:'grid', gap:16 }}>
    <p style={{ color:'#aebfd0', fontSize:13, lineHeight:1.7, margin:0 }}>入力は任意です。空欄で保存すると値を削除します。ここで入力した値は、走行傾向や他のユーザーのプロフィールには公開されません。年齢は「アカウント」から変更できます。</p>
    {([
      {key:'current_weight',label:'現在の体重（kg）',min:1,max:500},
      {key:'target_weight',label:'目標体重（kg）',min:1,max:500},
      {key:'height',label:'身長（cm）',min:30,max:300},
    ] as const).map(field => <label key={field.key} style={{display:'grid',gap:6,color:'#c5d2de',fontSize:14}}>
      {field.label}<input type="number" inputMode="decimal" step="0.1" min={field.min} max={field.max} {...form.register(field.key)} style={fieldStyle}/>
      {form.formState.errors[field.key] && <span role="alert" style={{color:'#ffb2bd'}}>{form.formState.errors[field.key]?.message}</span>}
    </label>)}
    <label style={{display:'grid',gap:6,color:'#c5d2de',fontSize:14}}>性別（任意）
      <select {...form.register('gender')} style={fieldStyle}><option value="">未設定</option><option value="male">男性</option><option value="female">女性</option><option value="other">その他</option></select>
    </label>
    {message && <p role="status" style={{color:'#bff440'}}>{message}</p>}
    {error && <p role="alert" style={{color:'#ffb2bd'}}>{error}</p>}
    <button type="submit" disabled={form.formState.isSubmitting} style={{...fieldStyle,background:'#bff440',color:'#142000',fontWeight:800,cursor:'pointer'}}>{form.formState.isSubmitting ? '保存中…' : '身体プロフィールを保存'}</button>
  </form>;
}
const fieldStyle: React.CSSProperties = { minHeight:46, minWidth:0, width:'100%', boxSizing:'border-box', borderRadius:10, border:'1px solid #3c5369', padding:'10px 12px', background:'#0c1823', color:'#f0f7ff', fontSize:16 };
