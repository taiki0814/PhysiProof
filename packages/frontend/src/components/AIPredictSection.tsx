import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { predictionRequestSchema, type PredictionRequest, type Prediction } from '@my-app/shared';
import client from '../lib/hc';

interface AIPredictSectionProps {
  currentUser: {
    uid: string;
    current_weight?: number | null;
    target_weight?: number | null;
    target_calories_burned?: number | null;
    target_calories_consumed?: number | null;
    gender?: string | null;
    age?: number | null;
    height?: number | null;
  };
  onUpdatePredictParams: (
    currentWeight: number,
    targetWeight: number,
    targetCaloriesBurned: number,
    targetCaloriesConsumed: number,
    gender: string | null,
    age: number | null,
    height: number | null
  ) => Promise<void>;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 'bold',
  color: '#8a8a93',
  marginBottom: '0.4rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#0c0c0c',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '0.6rem 0.8rem',
  color: '#fff',
  fontSize: '0.85rem',
  boxSizing: 'border-box'
};

const submitButtonStyle = (color: string): React.CSSProperties => ({
  width: '100%',
  padding: '1rem',
  border: 'none',
  borderRadius: '16px',
  backgroundColor: color,
  color: '#000',
  fontWeight: '900',
  fontSize: '0.95rem',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  letterSpacing: '0.04em'
});

const AIPredictSection: React.FC<AIPredictSectionProps> = ({
  currentUser,
  onUpdatePredictParams
}) => {
  const [result, setResult] = useState<Prediction | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<any[]>([]);

  const defaultValues: PredictionRequest = {
    currentWeight: currentUser.current_weight || 70,
    targetWeight: currentUser.target_weight || 68,
    totalCaloriesBurned: currentUser.target_calories_burned || 2200,
    mealCaloriesConsumed: currentUser.target_calories_consumed || 1800,
    gender: (currentUser.gender as any) || 'male',
    age: currentUser.age || 25,
    height: currentUser.height || 170
  };

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<PredictionRequest>({
    resolver: zodResolver(predictionRequestSchema),
    defaultValues
  });

  const currentWeightVal = watch('currentWeight');
  const targetWeightVal = watch('targetWeight');
  const totalCaloriesBurnedVal = watch('totalCaloriesBurned');
  const mealCaloriesConsumedVal = watch('mealCaloriesConsumed');

  const fetchPredictionHistory = async () => {
    try {
      const res = await client.api.predictions.history.$get();
      if (res.ok) {
        const data = await res.json();
        setPredictionHistory((data as any).predictions || []);
      }
    } catch (e) {
      console.error('Failed to fetch prediction history:', e);
    }
  };

  useEffect(() => {
    fetchPredictionHistory();
  }, []);

  const onSubmit = async (data: PredictionRequest) => {
    try {
      const res = await client.api.predict.$post({ json: data });
      const pred = await res.json();
      if (res.ok && !('error' in pred)) {
        setResult(pred as any);
        fetchPredictionHistory();
        await onUpdatePredictParams(
          data.currentWeight,
          data.targetWeight,
          data.totalCaloriesBurned,
          data.mealCaloriesConsumed,
          data.gender || null,
          data.age || null,
          data.height || null
        );
      } else {
        alert(`予測エラー: ${(pred as any).error || '予測に失敗しました。'}`);
      }
    } catch (err) {
      alert('通信エラーが発生しました。');
    }
  };

  const handleSelectHistory = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      setResult(null);
      return;
    }
    const item = predictionHistory.find(p => p.id === selectedId);
    if (item) {
      setResult({
        daysToTarget: item.days_to_target,
        advice: item.advice,
        dailyCalorieDeficit: item.daily_calorie_deficit,
        confidenceScore: 0.9,
        source: 'history'
      } as any);
      setValue('currentWeight', item.current_weight);
      setValue('targetWeight', item.target_weight);
      setValue('totalCaloriesBurned', item.total_calories_burned);
      setValue('mealCaloriesConsumed', item.meal_calories_consumed);
      if (item.gender) setValue('gender', item.gender);
      if (item.age) setValue('age', item.age);
      if (item.height) setValue('height', item.height);
    }
  };

  const renderSVGChart = () => {
    if (!result) return null;

    const width = 360;
    const height = 150;
    const padding = 20;

    const days = result.daysToTarget;
    const startW = currentWeightVal;
    const endW = targetWeightVal;

    const coords = Array.from({ length: 6 }).map((_, idx) => {
      const fraction = idx / 5;
      const x = padding + fraction * (width - padding * 2);
      const w = startW + fraction * (endW - startW);
      
      const minW = Math.min(startW, endW) - 2;
      const maxW = Math.max(startW, endW) + 2;
      const yScale = (height - padding * 2) / (maxW - minW || 1);
      const y = height - padding - (w - minW) * yScale;
      
      return { x, y, weight: w.toFixed(1) };
    });

    const pathD = `M ${coords[0].x} ${coords[0].y} ` + coords.slice(1).map(c => `L ${c.x} ${c.y}`).join(' ');

    return (
      <div style={{ margin: '1rem 0' }}>
        <div style={{ fontSize: '0.68rem', color: '#666', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
          📈 目標体重への減衰・増加予測曲線 (Days: {days}日間)
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
          {coords.map((c, i) => (
            <line key={`grid-${i}`} x1={c.x} y1={padding} x2={c.x} y2={height - padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          ))}
          <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth="2.5" />
          {coords.map((c, i) => (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r="4" fill="#00ff88" />
              <text x={c.x} y={c.y - 8} fill="#888" fontSize="8" fontWeight="bold" textAnchor="middle">{c.weight}kg</text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <div className="pp-predict-grid" style={{ textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      <style>{`
        @media (min-width: 768px) {
          .pp-predict-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {/* Simulator Inputs Card */}
      <div className="cyber-glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.2rem 0', color: '#00d4ff', fontSize: '1.1rem', fontWeight: '900' }}>AI 目標予測シミュレータ</h3>
        
        {/* Prediction History Select */}
        {predictionHistory.length > 0 && (
          <div style={{ marginBottom: '1.2rem' }}>
            <label style={labelStyle}>過去のシミュレーション履歴からロード</label>
            <div style={{ position: 'relative' }}>
              <select
                onChange={handleSelectHistory}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  borderColor: 'rgba(0, 212, 255, 0.25)',
                  boxShadow: '0 0 10px rgba(0, 212, 255, 0.05)',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
              >
                <option value="">-- 過去の予測履歴を選択 --</option>
                {predictionHistory.map((pred) => {
                  const dateStr = new Date(pred.created_at || new Date()).toLocaleDateString('ja-JP', {
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                  });
                  return (
                    <option key={pred.id} value={pred.id} style={{ backgroundColor: '#0c0c0c', color: '#fff' }}>
                      {dateStr} : {pred.current_weight.toFixed(1)}kg → {pred.target_weight.toFixed(1)}kg (予測:{pred.days_to_target}日)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Profile parameters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
            <div>
              <label style={labelStyle}>性別</label>
              <select {...register('gender')} style={inputStyle}>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>年齢</label>
              <input type="number" {...register('age', { valueAsNumber: true })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>身長(cm)</label>
              <input type="number" step="0.1" {...register('height', { valueAsNumber: true })} style={inputStyle} />
            </div>
          </div>

          {/* Current and Target Weight dials */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={labelStyle}>現在体重</label>
                <span style={{ fontSize: '0.8rem', color: '#00d4ff', fontWeight: 'bold' }}>{currentWeightVal.toFixed(1)} kg</span>
              </div>
              <input type="number" step="0.1" {...register('currentWeight', { valueAsNumber: true })} style={inputStyle} />
              <input 
                type="range" 
                min="40" 
                max="150" 
                step="0.5" 
                value={currentWeightVal}
                onChange={e => setValue('currentWeight', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#00d4ff', marginTop: '0.3rem', height: '6px', cursor: 'pointer' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={labelStyle}>目標体重</label>
                <span style={{ fontSize: '0.8rem', color: '#00ff88', fontWeight: 'bold' }}>{targetWeightVal.toFixed(1)} kg</span>
              </div>
              <input type="number" step="0.1" {...register('targetWeight', { valueAsNumber: true })} style={inputStyle} />
              <input 
                type="range" 
                min="40" 
                max="150" 
                step="0.5" 
                value={targetWeightVal}
                onChange={e => setValue('targetWeight', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#00ff88', marginTop: '0.3rem', height: '6px', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Calorie dials */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle}>1日の目標消費カロリー</label>
              <span style={{ fontSize: '0.8rem', color: '#ff4444', fontWeight: 'bold' }}>{totalCaloriesBurnedVal} kcal</span>
            </div>
            <input type="number" {...register('totalCaloriesBurned', { valueAsNumber: true })} style={inputStyle} />
            <input 
              type="range" 
              min="1000" 
              max="5000" 
              step="50" 
              value={totalCaloriesBurnedVal}
              onChange={e => setValue('totalCaloriesBurned', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#ff4444', marginTop: '0.3rem', height: '6px', cursor: 'pointer' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle}>1日の目標摂取カロリー</label>
              <span style={{ fontSize: '0.8rem', color: '#ffcc00', fontWeight: 'bold' }}>{mealCaloriesConsumedVal} kcal</span>
            </div>
            <input type="number" {...register('mealCaloriesConsumed', { valueAsNumber: true })} style={inputStyle} />
            <input 
              type="range" 
              min="1000" 
              max="5000" 
              step="50" 
              value={mealCaloriesConsumedVal}
              onChange={e => setValue('mealCaloriesConsumed', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#ffcc00', marginTop: '0.3rem', height: '6px', cursor: 'pointer' }}
            />
          </div>

          {/* Balance Calculator Preview */}
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.01)',
            border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: '12px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}>
            <div style={{ fontSize: '0.72rem', color: '#8a8a93', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '4px' }}>
              📊 予測パラメータ相関シミュレーション
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ color: '#aaa' }}>目標までの必要差分:</span>
              <span style={{ fontWeight: 'bold', color: '#00d4ff' }}>
                {currentWeightVal > targetWeightVal 
                  ? `減量: -${(currentWeightVal - targetWeightVal).toFixed(1)} kg` 
                  : `増量: +${(targetWeightVal - currentWeightVal).toFixed(1)} kg`}
              </span>
            </div>
            {(() => {
              const deficit = totalCaloriesBurnedVal - mealCaloriesConsumedVal;
              const isGain = targetWeightVal > currentWeightVal;
              const isFavorable = isGain ? (deficit < 0) : (deficit > 0);
              const statusColor = isFavorable ? '#00ff88' : '#ff9f00';
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                  <span style={{ color: '#aaa' }}>想定カロリー収支:</span>
                  <span style={{ fontWeight: 'bold', color: statusColor }}>
                    {deficit > 0 
                      ? `-${deficit} kcal /日 (アンダーカロリー)` 
                      : `+${Math.abs(deficit)} kcal /日 (オーバーカロリー)`}
                  </span>
                </div>
              );
            })()}
          </div>

          <button disabled={isSubmitting} type="submit" style={submitButtonStyle('#00d4ff')}>
            {isSubmitting ? '🤖 AIがモデル解析中...' : '🔮 AI 遷移予測を開始'}
          </button>
        </form>
      </div>

      {/* Simulator Results Card */}
      <div className="cyber-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {result ? (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  backgroundColor: (result as any).source === 'ai' ? '#00ff88' : (result as any).source === 'history' ? '#00d4ff' : '#ffcc00', 
                  display: 'inline-block', 
                  boxShadow: `0 0 8px ${(result as any).source === 'ai' ? '#00ff88' : (result as any).source === 'history' ? '#00d4ff' : '#ffcc00'}` 
                }}></span>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#8a8a93' }}>
                  {(result as any).source === 'ai' ? 'Gemini 2.5 Flash 予測エンジン' : (result as any).source === 'history' ? '保存済みの予測履歴' : '物理熱力学計算モデル'}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#8a8a93', fontWeight: '700', marginBottom: '0.2rem' }}>目標達成までの推定期間</div>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: '900', color: '#00d4ff', fontFamily: "'Outfit', sans-serif" }}>
                  {result.daysToTarget}
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#00d4ff' }}>日</span>
              </div>
            </div>

            <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#666', fontWeight: 'bold', marginBottom: '8px' }}>
                <span>現在</span>
                <span>ターゲット移行</span>
                <span>目標</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fff' }}>{currentWeightVal.toFixed(1)}kg</div>
                <div style={{ flex: 1, height: '4px', backgroundColor: '#222', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '100%', background: 'linear-gradient(90deg, #00d4ff, #00ff88)' }}></div>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#00ff88' }}>{targetWeightVal.toFixed(1)}kg</div>
              </div>
            </div>

            {renderSVGChart()}

            <div style={{ 
              padding: '1.2rem', 
              backgroundColor: 'rgba(0, 255, 136, 0.01)', 
              borderRadius: '16px', 
              borderLeft: '4px solid #00ff88',
              border: '1px solid rgba(0, 255, 136, 0.1)',
              boxShadow: '0 4px 15px rgba(0,255,136,0.02)',
              marginTop: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🏃‍♂️</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#00ff88' }}>パーソナルコーチの分析・アドバイス</span>
              </div>
              <p style={{ color: '#d1d1d6', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>
                {result.advice}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#444', padding: '2rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📈</div>
            <h4 style={{ margin: '0 0 0.4rem 0', color: '#777', fontWeight: 'bold' }}>予測モデル未実行</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#555' }}>
              目標データを調整し、モデル解析を開始するとAIのアドバイスや推移グラフがこちらに表示されます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPredictSection;
