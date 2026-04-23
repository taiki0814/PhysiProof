import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { testRequestSchema, type TestRequest } from '@my-app/shared';
import client from '../lib/hc';

const TestPage: React.FC = () => {
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TestRequest>({
    resolver: zodResolver(testRequestSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: TestRequest) => {
    setIsLoading(true);
    setResponseMessage(null);
    try {
      const res = await client.api.test.$post({ json: data });
      if (res.ok) {
        const json = await res.json();
        setResponseMessage(json.message);
      } else {
        setResponseMessage('APIエラーが発生しました。');
      }
    } catch (err) {
      console.error(err);
      setResponseMessage('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>テストページ</h1>
      <p style={{ textAlign: 'center' }}>ZodとHono RPCを利用したフルスタック型安全テスト</p>

      <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '8px', marginTop: '2rem' }}>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>名前:</label>
            <input
              id="name"
              {...register('name')}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              placeholder="名前を入力してください"
            />
            {errors.name && (
              <span style={{ color: 'red', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                {errors.name.message}
              </span>
            )}
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            style={{ 
              padding: '0.75rem', 
              background: isLoading ? '#ccc' : '#007BFF', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? '送信中...' : '送信する'}
          </button>
        </form>

        {responseMessage && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#e6ffe6', border: '1px solid #b3ffb3', borderRadius: '4px' }}>
            <strong>レスポンス:</strong> {responseMessage}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <Link to="/" style={{ color: 'blue', textDecoration: 'underline' }}>
          トップページに戻る
        </Link>
      </div>
    </div>
  );
};

export default TestPage;
