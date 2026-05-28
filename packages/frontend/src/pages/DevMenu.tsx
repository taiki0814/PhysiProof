import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { devLogger } from '../lib/devLogger';

const DevMenu: React.FC = () => {
  const [logs, setLogs] = useState(devLogger.getLogs());
  const [sensor, setSensor] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    const unsub = devLogger.subscribe(() => setLogs(devLogger.getLogs()));
    
    // Web ブラウザ環境での加速度センサー取得（モバイル端末のみ）
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (acc) {
        setSensor({
          x: acc.x || 0,
          y: acc.y || 0,
          z: acc.z || 0
        });
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => {
      unsub();
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, []);

  return (
    <div style={{ padding: '1.5rem', backgroundColor: '#0a0a0a', color: '#00ff88', minHeight: '100vh', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
          PhysiProof 開発者メニュー
        </h1>
        <Link to="/" style={{ 
          color: '#00ff88', 
          textDecoration: 'none', 
          fontSize: '11px', 
          border: '1px solid #00ff88', 
          padding: '4px 8px', 
          borderRadius: '4px' 
        }}>
          ← ユーザー画面に戻る
        </Link>
      </div>
      
      {/* センサー可視化セクション */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#00ff88' }}>📡 リアルタイムセンサーデータ</h2>
        <div style={{ backgroundColor: '#000', padding: '1rem', borderRadius: '8px', border: '1px solid #00ff8833', boxShadow: '0 0 15px #00ff8811' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '1rem', fontWeight: 'bold' }}>
            <span style={{ color: '#ff4444' }}>X: {sensor.x.toFixed(3)}</span>
            <span style={{ color: '#44ff44' }}>Y: {sensor.y.toFixed(3)}</span>
            <span style={{ color: '#4444ff' }}>Z: {sensor.z.toFixed(3)}</span>
          </div>
          <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end', gap: '3px' }}>
            {Array.from({ length: 40 }).map((_, i) => (
              <div 
                key={i} 
                style={{ 
                  flex: 1, 
                  backgroundColor: '#00ff88', 
                  height: `${Math.max(5, Math.min(100, (Math.abs(sensor.x) + Math.abs(sensor.y) + Math.abs(sensor.z)) * 8))}%`,
                  opacity: 0.8,
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.1s ease'
                }} 
              />
            ))}
          </div>
        </div>
      </section>

      {/* AI プロンプト・デバッグセクション */}
      <section style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#00d4ff' }}>🤖 AI プロンプト検証</h2>
          <button 
            onClick={() => {
              // RPC クライアント経由で予測 API をテスト呼び出しするシミュレーション
              import('../lib/hc').then(({ default: client }) => {
                client.api.predict.$post({
                  json: {
                    currentWeight: 75,
                    targetWeight: 70,
                    totalCaloriesBurned: 1500,
                    mealCaloriesConsumed: 12000
                  }
                });
              });
            }}
            style={{ 
              padding: '4px 12px', 
              backgroundColor: '#00d4ff', 
              color: '#000', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            AI予測シミュレート
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '1rem' }}>
          ※ ボタンを押すとバックエンドへダミーのリクエストを送信し、実際に使用されたプロンプトを確認できます。
        </div>
      </section>

      {/* RPC ＆ AI 通信ログ */}
      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#ffcc00' }}>📜 システム通信ログ (最新50件)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#444', border: '1px dashed #333', borderRadius: '8px' }}>
              ログがまだありません。API 通信が発生するとここに表示されます。
            </div>
          ) : (
            logs.map(log => {
              const isAIResponse = log.type === 'response' && log.data?.debugPrompt;
              return (
                <div key={log.id} style={{ 
                  backgroundColor: '#050505', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  border: isAIResponse ? '1px solid #00d4ff' : '1px solid #222',
                  boxShadow: isAIResponse ? '0 0 10px #00d4ff22' : 'none'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', marginBottom: '0.75rem', fontSize: '10px' }}>
                    <span style={{ fontWeight: 'bold', color: log.type === 'error' ? '#ff4444' : '#888' }}>
                      [{log.timestamp}] {log.type.toUpperCase()}
                    </span>
                    <span style={{ opacity: 0.5 }}>{log.url}</span>
                  </div>
                  
                  {isAIResponse && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#001a22', borderLeft: '3px solid #00d4ff', color: '#00d4ff' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '11px' }}>[GEMINI SYSTEM PROMPT]</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '10px' }}>{log.data.debugPrompt}</pre>
                    </div>
                  )}

                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#aaa', fontSize: '10px' }}>[DATA]</div>
                  <pre style={{ 
                    overflowX: 'auto', 
                    whiteSpace: 'pre-wrap', 
                    margin: 0, 
                    color: log.type === 'error' ? '#ff4444' : (isAIResponse ? '#00d4ff' : '#00ff88'),
                    fontSize: '11px'
                  }}>
                    {JSON.stringify(log.data, (key, value) => key === 'debugPrompt' ? undefined : value, 2)}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

export default DevMenu;
