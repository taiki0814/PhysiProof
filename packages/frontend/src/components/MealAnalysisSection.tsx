import React, { useEffect, useState } from 'react';
import client from '../lib/hc';

interface MealAnalysisResponse {
  name: string;
  calories: number;
  pfc: {
    protein: number;
    fat: number;
    carbs: number;
  };
  advice: string;
  id?: string;
  created_at?: string;
}

interface MealAnalysisSectionProps {
  onActionComplete?: () => void;
  triggerAchievementUnlock: (achievements: any[]) => void;
}

const MealAnalysisSection: React.FC<MealAnalysisSectionProps> = ({
  onActionComplete,
  triggerAchievementUnlock
}) => {
  const [result, setResult] = useState<MealAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const fetchMealHistory = async () => {
    try {
      const res = await client.api.meals.history.$get();
      if (res.ok) {
        const data = await res.json();
        setHistory((data as any).meals || []);
      }
    } catch (e) {
      console.error('Failed to fetch meal history:', e);
    }
  };

  useEffect(() => {
    fetchMealHistory();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setLoading(true);
    try {
      const base64 = await toBase64(file);
      const cleanBase64 = base64.split(',')[1];

      if (!navigator.onLine) {
        alert('オンライン接続がないため、写真は保存されていません。');
        setLoading(false);
        return;
      }

      const res = await client.api.meals.analyze.$post({ json: { image: cleanBase64 } });
      const data = await res.json();
      
      if (!res.ok || 'error' in data) {
        alert(`エラー: ${(data as any).error || '解析に失敗しました。'}`);
        setResult(null);
      } else {
        if ((data as any).newAchievements) triggerAchievementUnlock((data as any).newAchievements);
        setResult(data as any);
        fetchMealHistory();
        onActionComplete?.(); // Update profiles / daily missions
      }
    } catch (err) {
      console.error('Meal analyze error:', err);
      alert('通信エラーのため、写真は保存されていません。オンライン状態を確認して再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  const getPercent = (value: number, max: number) => {
    return Math.min(Math.round((value / max) * 100), 100);
  };

  const mealTargets = { calories: 650, protein: 25, fat: 18, carbs: 80 };

  const renderPFCDonutChart = () => {
    if (!result) return null;
    const pKcal = result.pfc.protein * 4;
    const fKcal = result.pfc.fat * 9;
    const cKcal = result.pfc.carbs * 4;
    const totalKcal = pKcal + fKcal + cKcal || 1;

    const pPct = pKcal / totalKcal;
    const fPct = fKcal / totalKcal;
    const cPct = cKcal / totalKcal;

    const r = 30;
    const circumference = 2 * Math.PI * r;
    const pStroke = circumference * pPct;
    const fStroke = circumference * fPct;
    const cStroke = circumference * cPct;

    const pOffset = circumference;
    const fOffset = circumference - pStroke;
    const cOffset = circumference - pStroke - fStroke;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', padding: '1.2rem', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="120" height="120" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="40" cy="40" r={r} fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
            
            {/* Protein */}
            <circle cx="40" cy="40" r={r} fill="transparent" 
              stroke="#00d4ff" strokeWidth="8"
              strokeDasharray={`${pStroke} ${circumference}`}
              strokeDashoffset={pOffset}
              strokeLinecap="round"
            />
            
            {/* Fat */}
            <circle cx="40" cy="40" r={r} fill="transparent" 
              stroke="#ffcc00" strokeWidth="8"
              strokeDasharray={`${fStroke} ${circumference}`}
              strokeDashoffset={fOffset}
              strokeLinecap="round"
            />
            
            {/* Carbs */}
            <circle cx="40" cy="40" r={r} fill="transparent" 
              stroke="#ff007f" strokeWidth="8"
              strokeDasharray={`${cStroke} ${circumference}`}
              strokeDashoffset={cOffset}
              strokeLinecap="round"
            />
          </svg>
          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#00ff88', fontFamily: "'Outfit', sans-serif" }}>{result.calories}</span>
            <span style={{ fontSize: '0.62rem', color: '#8a8a93', fontWeight: 'bold' }}>kcal</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '150px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#00d4ff', boxShadow: '0 0 8px #00d4ff' }}></span>
            <span style={{ fontSize: '0.8rem', color: '#d1d1d6', fontWeight: '700', flex: 1 }}>タンパク質 (P)</span>
            <span style={{ fontSize: '0.82rem', color: '#00d4ff', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>{Math.round(pPct * 100)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffcc00', boxShadow: '0 0 8px #ffcc00' }}></span>
            <span style={{ fontSize: '0.8rem', color: '#d1d1d6', fontWeight: '700', flex: 1 }}>脂質 (F)</span>
            <span style={{ fontSize: '0.82rem', color: '#ffcc00', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>{Math.round(fPct * 100)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff007f', boxShadow: '0 0 8px #ff007f' }}></span>
            <span style={{ fontSize: '0.8rem', color: '#d1d1d6', fontWeight: '700', flex: 1 }}>炭水化物 (C)</span>
            <span style={{ fontSize: '0.82rem', color: '#ff007f', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>{Math.round(cPct * 100)}%</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="pp-meal-layout" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'stretch' }}>
        
        {/* Upload Zone */}
        <div className="pp-meal-upload" style={{ width: '100%' }}>
          <label style={{
            width: '100%', 
            height: '240px', 
            backgroundColor: 'rgba(5,5,5,0.7)', 
            border: `2px dashed ${loading ? '#00ff88' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '20px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: loading ? 'not-allowed' : 'pointer', 
            overflow: 'hidden', 
            position: 'relative', 
            transition: 'all 0.3s ease',
            boxShadow: loading ? '0 0 20px rgba(0,255,136,0.1)' : 'none'
          }}
          className="meal-dropzone"
          >
            {preview ? (
              <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loading ? 0.3 : 1 }} alt="preview" />
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.6rem' }}>📸</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>食事の写真をアップロード</div>
                <div style={{ fontSize: '0.72rem', color: '#666', fontWeight: 'bold' }}>タップして画像を選択</div>
              </div>
            )}
            
            {loading && (
              <div style={{ 
                position: 'absolute', 
                backgroundColor: 'rgba(0,0,0,0.85)',
                padding: '0.8rem 1.5rem',
                borderRadius: '30px',
                border: '1px solid rgba(0,255,136,0.25)',
                color: '#00ff88', 
                fontWeight: '900',
                fontSize: '0.85rem',
                letterSpacing: '0.04em',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
              }}>
                🤖 AI管理栄養士が画像を解析中...
              </div>
            )}
            <input type="file" accept="image/*" disabled={loading} onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Results Dashboard */}
        {result && !loading && (
          <div className="pp-meal-result" style={{ 
            backgroundColor: 'rgba(10, 10, 10, 0.3)', 
            padding: '1.5rem', 
            borderRadius: '20px', 
            border: '1px solid rgba(0,255,136,0.12)', 
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(0,255,136,0.02)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '900', margin: 0, letterSpacing: '-0.01em' }}>
                🍽️ {result.name}
              </h3>
              <div style={{ 
                backgroundColor: 'rgba(0,255,136,0.08)', 
                color: '#00ff88', 
                padding: '4px 12px', 
                borderRadius: '20px', 
                fontSize: '0.72rem', 
                fontWeight: 'bold',
                border: '1px solid rgba(0,255,136,0.15)'
              }}>
                AI NUTRITIONIST
              </div>
            </div>

            {/* PFC 円グラフ表示 */}
            {renderPFCDonutChart()}

            {/* PFC Balance Card Gauges */}
            <div className="pp-pfc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              
              {/* Calories Item */}
              <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '0.9rem 1.1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: '700' }}>摂取エネルギー</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#00ff88', fontFamily: "'Outfit', sans-serif" }}>
                    {result.calories} <span style={{ fontSize: '0.75rem', color: '#666', fontWeight: 'bold' }}>/ 目標 {mealTargets.calories} kcal</span>
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${getPercent(result.calories, mealTargets.calories)}%`, height: '100%', backgroundColor: '#00ff88', borderRadius: '3px', boxShadow: '0 0 8px #00ff88' }}></div>
                </div>
              </div>

              {/* PFC Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                
                {/* Protein */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8a8a93', fontWeight: '700', display: 'block', marginBottom: '2px' }}>タンパク質 (P)</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#00d4ff', fontFamily: "'Outfit', sans-serif" }}>{result.pfc.protein}g</span>
                  <span style={{ fontSize: '0.62rem', color: '#555', display: 'block', fontWeight: 'bold' }}>目標 {mealTargets.protein}g</span>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${getPercent(result.pfc.protein, mealTargets.protein)}%`, height: '100%', backgroundColor: '#00d4ff', borderRadius: '2px', boxShadow: '0 0 6px #00d4ff' }}></div>
                  </div>
                </div>

                {/* Fat */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8a8a93', fontWeight: '700', display: 'block', marginBottom: '2px' }}>脂質 (F)</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ffcc00', fontFamily: "'Outfit', sans-serif" }}>{result.pfc.fat}g</span>
                  <span style={{ fontSize: '0.62rem', color: '#555', display: 'block', fontWeight: 'bold' }}>目標 {mealTargets.fat}g</span>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${getPercent(result.pfc.fat, mealTargets.fat)}%`, height: '100%', backgroundColor: '#ffcc00', borderRadius: '2px', boxShadow: '0 0 6px #ffcc00' }}></div>
                  </div>
                </div>

                {/* Carbs */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8a8a93', fontWeight: '700', display: 'block', marginBottom: '2px' }}>炭水化物 (C)</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ff007f', fontFamily: "'Outfit', sans-serif" }}>{result.pfc.carbs}g</span>
                  <span style={{ fontSize: '0.62rem', color: '#555', display: 'block', fontWeight: 'bold' }}>目標 {mealTargets.carbs}g</span>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${getPercent(result.pfc.carbs, mealTargets.carbs)}%`, height: '100%', backgroundColor: '#ff007f', borderRadius: '2px', boxShadow: '0 0 6px #ff007f' }}></div>
                  </div>
                </div>

              </div>

            </div>

            {/* Daily Total Allowance Gauge */}
            {(() => {
              const dailyTargetIntake = 1800; // Daily default
              const remainingAllowance = dailyTargetIntake - result.calories;
              const isOverBudget = remainingAllowance < 0;
              const percent = Math.min(Math.round((result.calories / dailyTargetIntake) * 100), 100);

              const getPfcStatus = (p: number, f: number, c: number) => {
                const total = p * 4 + f * 9 + c * 4 || 1;
                const pPct = (p * 4) / total;
                const fPct = (f * 9) / total;
                const cPct = (c * 4) / total;

                const pStatus = pPct < 0.15 ? { label: 'タンパク質: 不足 🟡', color: '#ffcc00' } : pPct > 0.25 ? { label: 'タンパク質: 豊富 🟢', color: '#00ff88' } : { label: 'タンパク質: 適正 🟢', color: '#00ff88' };
                const fStatus = fPct < 0.20 ? { label: '脂質: 控えめ 🟢', color: '#00ff88' } : fPct > 0.30 ? { label: '脂質: 過剰 🔴', color: '#ff4444' } : { label: '脂質: 適正 🟢', color: '#00ff88' };
                const cStatus = cPct < 0.50 ? { label: '炭水化物: 控えめ 🟢', color: '#00ff88' } : cPct > 0.65 ? { label: '炭水化物: 過剰 🔴', color: '#ff4444' } : { label: '炭水化物: 適正 🟢', color: '#00ff88' };

                return { pStatus, fStatus, cStatus };
              };
              const { pStatus, fStatus, cStatus } = getPfcStatus(result.pfc.protein, result.pfc.fat, result.pfc.carbs);

              return (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem', 
                  backgroundColor: 'rgba(0,0,0,0.4)', 
                  padding: '1.2rem', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.03)', 
                  marginBottom: '1.5rem',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold' }}>📅 1日の摂取目標残量 (予算: {dailyTargetIntake} kcal)</span>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: 'bold', 
                      color: isOverBudget ? '#ff4444' : '#00ff88',
                      textShadow: isOverBudget ? '0 0 10px rgba(255,68,68,0.2)' : '0 0 10px rgba(0,255,136,0.2)'
                    }}>
                      {isOverBudget ? `超過: ${Math.abs(remainingAllowance)} kcal ⚠️` : `残り許容量: ${remainingAllowance} kcal`}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ 
                      width: `${percent}%`, 
                      height: '100%', 
                      background: isOverBudget ? 'linear-gradient(90deg, #ffcc00, #ff4444)' : 'linear-gradient(90deg, #00d4ff, #00ff88)', 
                      borderRadius: '4px', 
                      boxShadow: isOverBudget ? '0 0 10px #ff4444' : '0 0 10px #00ff88',
                      transition: 'width 0.5s ease'
                    }}></div>
                  </div>
                  
                  {/* PFC バランス簡易診断バッジ */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: '6px', border: `1px solid ${pStatus.color}44`, backgroundColor: `${pStatus.color}08`, color: pStatus.color }}>
                      {pStatus.label}
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: '6px', border: `1px solid ${fStatus.color}44`, backgroundColor: `${fStatus.color}08`, color: fStatus.color }}>
                      {fStatus.label}
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: '6px', border: `1px solid ${cStatus.color}44`, backgroundColor: `${cStatus.color}08`, color: cStatus.color }}>
                      {cStatus.label}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* AI Advisor Card */}
            <div style={{ 
              padding: '1.2rem', 
              backgroundColor: 'rgba(0, 255, 136, 0.01)', 
              borderRadius: '16px', 
              borderLeft: '4px solid #00ff88',
              borderTop: '1px solid rgba(0, 255, 136, 0.1)',
              borderRight: '1px solid rgba(0, 255, 136, 0.1)',
              borderBottom: '1px solid rgba(0, 255, 136, 0.1)',
              boxShadow: '0 4px 15px rgba(0,255,136,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🥗</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#00ff88' }}>管理栄養士AIの分析アドバイス</span>
              </div>
              <p style={{ 
                color: '#d1d1d6', 
                fontSize: '0.85rem', 
                lineHeight: '1.6', 
                margin: 0,
                textAlign: 'left'
              }}>
                {result.advice}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* History timeline list */}
      <div className="cyber-glass" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.2rem 0', color: '#00d4ff', fontSize: '1.1rem', fontWeight: '900' }}>食事履歴</h3>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#444', fontSize: '0.85rem' }}>
            ログがまだありません。食事写真をアップロードして計測しましょう。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {history.map((item, idx) => (
              <div key={item.id || idx} style={{
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.03)',
                backgroundColor: 'rgba(255,255,255,0.005)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#fff' }}>{item.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#666', marginTop: '4px' }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#00ff88', fontFamily: "'Outfit', sans-serif" }}>
                    {item.calories}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#8a8a93', fontWeight: 'bold', marginLeft: '2px' }}>kcal</span>
                  <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '2px', fontWeight: 'bold' }}>
                    P:{Math.round(item.protein)}g | F:{Math.round(item.fat)}g | C:{Math.round(item.carbs)}g
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MealAnalysisSection;
