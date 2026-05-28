import { useState } from 'react';
import { API_BASE_URL } from '../lib/hc';

type CheckResult = {
  name: string;
  status: 'pending' | 'ok' | 'error';
  detail: string;
  latency?: number;
};

const HealthCheck = () => {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const updateResult = (name: string, update: Partial<CheckResult>) => {
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...update } : r));
  };

  const runChecks = async () => {
    setRunning(true);

    const checks: CheckResult[] = [
      { name: 'API Base URL', status: 'pending', detail: '確認中...' },
      { name: 'Backend Reachability', status: 'pending', detail: '確認中...' },
      { name: 'Signup Endpoint', status: 'pending', detail: '確認中...' },
      { name: 'CORS Headers', status: 'pending', detail: '確認中...' },
      { name: 'Database (D1)', status: 'pending', detail: '確認中...' },
    ];
    setResults([...checks]);

    // 1. API Base URL Check
    const resolvedUrl = API_BASE_URL || window.location.origin;
    updateResult('API Base URL', {
      status: API_BASE_URL ? 'ok' : 'ok',
      detail: `VITE_API_URL = "${API_BASE_URL || '(empty / same-origin)'}" → Resolved: ${resolvedUrl}`,
    });

    // 2. Backend Reachability (GET /api/territories as a simple endpoint)
    const apiUrl = `${resolvedUrl}/api/territories`;
    try {
      const start = performance.now();
      const res = await fetch(apiUrl);
      const latency = Math.round(performance.now() - start);
      updateResult('Backend Reachability', {
        status: res.ok ? 'ok' : 'error',
        detail: `GET ${apiUrl} → ${res.status} ${res.statusText}`,
        latency,
      });

      // 3. CORS Headers
      const corsHeader = res.headers.get('access-control-allow-origin');
      updateResult('CORS Headers', {
        status: corsHeader ? 'ok' : 'error',
        detail: corsHeader
          ? `Access-Control-Allow-Origin: ${corsHeader}`
          : 'CORS ヘッダーが見つかりません。バックエンドの cors() 設定を確認してください。',
      });
    } catch (err: any) {
      updateResult('Backend Reachability', {
        status: 'error',
        detail: `接続失敗: ${err.message}. URL: ${apiUrl}`,
      });
      updateResult('CORS Headers', {
        status: 'error',
        detail: 'バックエンドに接続できないため検証不可',
      });
    }

    // 4. Signup Endpoint (POST /api/auth/signup with intentionally bad data to test reachability)
    const signupUrl = `${resolvedUrl}/api/auth/signup`;
    try {
      const start = performance.now();
      const res = await fetch(signupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: '', password: '', name: '' }),
      });
      const latency = Math.round(performance.now() - start);
      const body = await res.json().catch(() => null);

      if (res.status === 400) {
        // Validation error = endpoint is reachable and working
        updateResult('Signup Endpoint', {
          status: 'ok',
          detail: `POST ${signupUrl} → ${res.status} (バリデーションエラー = 正常到達)`,
          latency,
        });
      } else if (res.ok) {
        updateResult('Signup Endpoint', {
          status: 'ok',
          detail: `POST ${signupUrl} → ${res.status} (成功)`,
          latency,
        });
      } else {
        updateResult('Signup Endpoint', {
          status: 'error',
          detail: `POST ${signupUrl} → ${res.status}: ${JSON.stringify(body)}`,
          latency,
        });
      }

      // 5. Database check from signup response
      const bodyStr = JSON.stringify(body || {});
      if (bodyStr.includes('no such table')) {
        updateResult('Database (D1)', {
          status: 'error',
          detail: 'テーブルが存在しません。マイグレーションが適用されていない可能性があります。',
        });
      } else if (res.status === 500 && bodyStr.includes('database')) {
        updateResult('Database (D1)', {
          status: 'error',
          detail: `データベース接続エラー: ${bodyStr}`,
        });
      } else {
        updateResult('Database (D1)', {
          status: 'ok',
          detail: 'Signup エンドポイントが DB に正常接続しています。',
        });
      }
    } catch (err: any) {
      updateResult('Signup Endpoint', {
        status: 'error',
        detail: `接続失敗: ${err.message}`,
      });
      updateResult('Database (D1)', {
        status: 'error',
        detail: 'Signup エンドポイントに接続できないため検証不可',
      });
    }

    setRunning(false);
  };

  const statusIcon = (status: CheckResult['status']) => {
    if (status === 'ok') return '✅';
    if (status === 'error') return '❌';
    return '⏳';
  };

  const statusColor = (status: CheckResult['status']) => {
    if (status === 'ok') return '#4ade80';
    if (status === 'error') return '#f87171';
    return '#fbbf24';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: '2rem',
    }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          🩺 PhysiProof Health Check
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          フロントエンド ↔ バックエンド間の接続状態を診断します。
        </p>

        <button
          onClick={runChecks}
          disabled={running}
          style={{
            padding: '0.75rem 2rem',
            borderRadius: '8px',
            border: 'none',
            background: running
              ? '#475569'
              : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: running ? 'not-allowed' : 'pointer',
            marginBottom: '1.5rem',
            transition: 'all 0.2s',
          }}
        >
          {running ? '⏳ 診断中...' : '🚀 診断を実行'}
        </button>

        {results.length > 0 && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: '12px',
            border: '1px solid #334155',
            overflow: 'hidden',
          }}>
            {results.map((r, i) => (
              <div
                key={r.name}
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: i < results.length - 1 ? '1px solid #334155' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{statusIcon(r.status)}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.name}</span>
                  {r.latency !== undefined && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      background: '#1e293b',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}>
                      {r.latency}ms
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: statusColor(r.status),
                  wordBreak: 'break-all',
                  lineHeight: 1.4,
                }}>
                  {r.detail}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '8px',
          border: '1px solid #334155',
          fontSize: '0.8rem',
          color: '#64748b',
        }}>
          <strong>Environment Info</strong>
          <div style={{ marginTop: '0.5rem' }}>
            <div>VITE_API_URL: <code style={{ color: '#93c5fd' }}>{import.meta.env.VITE_API_URL || '(未設定)'}</code></div>
            <div>Current Origin: <code style={{ color: '#93c5fd' }}>{window.location.origin}</code></div>
            <div>Mode: <code style={{ color: '#93c5fd' }}>{import.meta.env.MODE}</code></div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a
            href="/"
            style={{
              color: '#60a5fa',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            ← アプリに戻る
          </a>
        </div>
      </div>
    </div>
  );
};

export default HealthCheck;
