import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, signupSchema, type LoginRequest, type SignupRequest } from '@my-app/shared';
import { useNavigate } from 'react-router-dom';
import client from '../lib/hc';
import AppIcon from '../components/AppIcon';

const LoginPage: React.FC = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleError = (err: any) => {
    if (typeof err === 'string') return setError(err);
    if (err && typeof err === 'object') {
      const parts = [];
      if (err.error) parts.push(err.error);
      if (err.details) parts.push(`詳細: ${err.details}`);
      if (err.hint) parts.push(`ヒント: ${err.hint}`);
      if (parts.length > 0) return setError(parts.join('\n'));
    }
    setError(JSON.stringify(err));
  };

  const navigate = useNavigate();

  const loginForm = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
  });

  const signupForm = useForm<SignupRequest>({
    resolver: zodResolver(signupSchema),
  });

  const onLogin = async (data: LoginRequest) => {
    console.log('Login attempt:', data.loginId);
    setError(null);
    try {
      const res = await client.api.auth.login.$post({ json: data });
      const result = await res.json();
      
      if (!res.ok || 'error' in result) {
        handleError(result);
      } else {
        localStorage.setItem('physiproof_user', JSON.stringify(result));
        localStorage.setItem('physiproof_test_uid', (result as any).userId);
        if ((result as any).role === 'admin') {
          console.log('Navigating to admin dashboard...');
          navigate('/admin');
        } else {
          console.log('Navigating to dashboard...');
          navigate('/dashboard');
        }
      }
    } catch (e) {
      console.error('Login error:', e);
      handleError('サーバーとの通信に失敗しました。');
    }
  };

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const onSignup = async (data: SignupRequest) => {
    console.log('Signup attempt:', data.loginId);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await client.api.auth.signup.$post({ json: data });
      const result = await res.json();
      
      if (!res.ok || 'error' in result) {
        handleError(result);
      } else {
        setSuccessMessage('アカウントを作成しました。ログインしてください。');
        setIsSignup(false);
        signupForm.reset();
      }
    } catch (e) {
      console.error('Signup error:', e);
      setError('サーバーとの通信に失敗しました。');
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#030303',
      backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0, 255, 136, 0.07) 0%, transparent 60%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      boxSizing: 'border-box'
    }}>
      <div className="cyber-glass" style={{ 
        width: '100%',
        maxWidth: '420px',
        padding: '2.5rem 2rem',
        borderRadius: '24px',
        boxShadow: '0 20px 80px rgba(0,0,0,0.8), 0 0 40px rgba(0,255,136,0.02)',
        boxSizing: 'border-box'
      }}>
        <h1 style={{ 
          fontSize: '2.2rem',
          fontWeight: '900',
          marginBottom: '0.3rem',
          textAlign: 'center',
          background: 'linear-gradient(45deg, #00ff88, #00d4ff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontFamily: "'Outfit', sans-serif",
          letterSpacing: '-0.03em',
          filter: 'drop-shadow(0 0 10px rgba(0,255,136,0.25))'
        }}>
          PhysiProof
        </h1>
        <p style={{ color: '#8a8a93', textAlign: 'center', marginBottom: '2rem', fontSize: '0.85rem', fontWeight: 500 }}>
          {isSignup ? '次世代運動証明システム・新規登録' : 'GPS陣地ゲーム・サインイン'}
        </p>
 
        {error && (
          <div style={{ backgroundColor: 'rgba(255,68,68,0.08)', color: '#ff4444', padding: '0.9rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.8rem', border: '1px solid rgba(255,68,68,0.2)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
            <AppIcon name="warning" /> {error}
          </div>
        )}
 
        {successMessage && (
          <div style={{ backgroundColor: 'rgba(0,255,136,0.08)', color: '#00ff88', padding: '0.9rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.8rem', border: '1px solid rgba(0,255,136,0.2)', lineHeight: '1.4' }}>
            <AppIcon name="success" /> {successMessage}
          </div>
        )}
 
        <form onSubmit={isSignup ? signupForm.handleSubmit(onSignup) : loginForm.handleSubmit(onLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {isSignup && (
            <div>
              <label style={labelStyle}>表示名</label>
              <input {...signupForm.register('name')} style={inputStyle} placeholder="山田 太郎" />
              {signupForm.formState.errors.name && <span style={errorStyle}>{signupForm.formState.errors.name.message}</span>}
            </div>
          )}
          <div>
            <label style={labelStyle}>ログインID</label>
            <input {...(isSignup ? signupForm.register('loginId') : loginForm.register('loginId'))} style={inputStyle} placeholder="username" />
            {(isSignup ? signupForm.formState.errors.loginId : loginForm.formState.errors.loginId) && (
              <span style={errorStyle}>{(isSignup ? signupForm.formState.errors.loginId : loginForm.formState.errors.loginId)?.message}</span>
            )}
          </div>
          <div>
            <label style={labelStyle}>パスワード</label>
            <input type="password" {...(isSignup ? signupForm.register('password') : loginForm.register('password'))} style={inputStyle} placeholder="••••••••" />
            {(isSignup ? signupForm.formState.errors.password : loginForm.formState.errors.password) && (
              <span style={errorStyle}>{(isSignup ? signupForm.formState.errors.password : loginForm.formState.errors.password)?.message}</span>
            )}
          </div>
 
          <button type="submit" style={{ 
            backgroundColor: '#00ff88',
            color: '#000',
            border: 'none',
            padding: '1rem',
            borderRadius: '14px',
            fontWeight: '800',
            cursor: 'pointer',
            marginTop: '0.8rem',
            fontSize: '1rem',
            transition: 'all 0.2s ease',
            boxShadow: '0 8px 24px rgba(0,255,136,0.2)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,255,136,0.35)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,255,136,0.2)';
          }}
          >
            {isSignup ? 'アカウントを作成' : 'ログインして開始'}
          </button>
        </form>
 
        <div style={{ marginTop: '2.2rem', textAlign: 'center', fontSize: '0.85rem' }}>
          <button 
            onClick={() => setIsSignup(!isSignup)} 
            style={{ background: 'none', border: 'none', color: '#00d4ff', cursor: 'pointer', fontWeight: '700', transition: '0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#00ff88'}
            onMouseLeave={e => e.currentTarget.style.color = '#00d4ff'}
          >
            {isSignup ? '既にアカウントをお持ちですか？ ログイン' : '新規アカウントをお持ちでないですか？ 登録'}
          </button>
        </div>
      </div>
    </div>
  );
};
 
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', color: '#8a8a93', marginBottom: '0.5rem', fontWeight: '700', letterSpacing: '0.02em' };
const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: 'rgba(5, 5, 5, 0.75)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.9rem', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' };
const errorStyle: React.CSSProperties = { color: '#ff4444', fontSize: '0.75rem', marginTop: '0.3rem', display: 'block', fontWeight: '500' };
 
export default LoginPage;
