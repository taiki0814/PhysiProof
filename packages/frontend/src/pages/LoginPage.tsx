import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, signupSchema, type LoginRequest, type SignupRequest } from '@my-app/shared';
import { useNavigate } from 'react-router-dom';
import client from '../lib/hc';

const LoginPage: React.FC = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleError = (err: any) => {
    if (typeof err === 'string') return setError(err);
    if (err && typeof err === 'object') {
      const parts = [];
      if (err.error) parts.push(err.error);
      if (err.details) parts.push(`詳細: ${err.details}`);
      if (err.hint) parts.push(`💡ヒント: ${err.hint}`);
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
        console.log('Navigating to dashboard...');
        navigate('/dashboard');
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
      minHeight: '100vh', backgroundColor: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" 
    }}>
      <div style={{ 
        width: '100%', maxWidth: '400px', backgroundColor: '#0a0a0a', padding: '3rem', borderRadius: '24px', border: '1px solid #1a1a1a', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' 
      }}>
        <h1 style={{ 
          fontSize: '2rem', fontWeight: '900', marginBottom: '0.5rem', textAlign: 'center', background: 'linear-gradient(45deg, #00ff88, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' 
        }}>
          PhysiProof
        </h1>
        <p style={{ color: '#555', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
          {isSignup ? '新規アカウント作成' : '既存アカウントでサインイン'}
        </p>

        {error && (
          <div style={{ backgroundColor: '#ff444422', color: '#ff4444', padding: '0.8rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', border: '1px solid #ff444444', whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        {successMessage && (
          <div style={{ backgroundColor: '#00ff8822', color: '#00ff88', padding: '0.8rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', border: '1px solid #00ff8844' }}>
            {successMessage}
          </div>
        )}

        <form onSubmit={isSignup ? signupForm.handleSubmit(onSignup) : loginForm.handleSubmit(onLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {isSignup && (
            <div>
              <label style={labelStyle}>表示名</label>
              <input {...signupForm.register('name')} style={inputStyle} placeholder="名前" />
              {signupForm.formState.errors.name && <span style={errorStyle}>{signupForm.formState.errors.name.message}</span>}
            </div>
          )}
          <div>
            <label style={labelStyle}>ログインID</label>
            <input {...(isSignup ? signupForm.register('loginId') : loginForm.register('loginId'))} style={inputStyle} placeholder="example_id" />
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
            backgroundColor: '#00ff88', color: '#000', border: 'none', padding: '1rem', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem', transition: '0.3s' 
          }}>
            {isSignup ? 'アカウントを作成' : 'ログイン'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.8rem' }}>
          <button 
            onClick={() => setIsSignup(!isSignup)} 
            style={{ background: 'none', border: 'none', color: '#00d4ff', cursor: 'pointer', fontWeight: '600' }}
          >
            {isSignup ? '既にアカウントをお持ちですか？ ログイン' : 'アカウントを新規作成しますか？'}
          </button>
        </div>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#444', marginBottom: '0.4rem', fontWeight: 'bold' };
const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: '#000', border: '1px solid #222', borderRadius: '10px', padding: '0.8rem', color: '#fff', fontSize: '1rem' };
const errorStyle: React.CSSProperties = { color: '#ff4444', fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' };

export default LoginPage;
