import React, { useState } from 'react';
import client from '../lib/hc';

interface RPGStatsSectionProps {
  currentUser: {
    uid: string;
    level?: number;
    xp?: number;
    status_points?: number;
    stat_str?: number;
    stat_agi?: number;
    stat_def?: number;
    stat_vit?: number;
  };
  onReloadProfile: () => Promise<void>;
  triggerAchievementUnlock: (achievements: any[]) => void;
}

const RPGStatsSection: React.FC<RPGStatsSectionProps> = ({
  currentUser,
  onReloadProfile,
  triggerAchievementUnlock
}) => {
  const level = currentUser.level || 1;
  const xp = currentUser.xp || 0;
  const xpNeeded = level * 100;
  const availablePoints = currentUser.status_points || 0;

  // Local state for pending allocations
  const [allocated, setAllocated] = useState({
    str: 0,
    agi: 0,
    def: 0,
    vit: 0
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingSpent = allocated.str + allocated.agi + allocated.def + allocated.vit;
  const remainingPoints = availablePoints - pendingSpent;

  const handleIncrement = (stat: 'str' | 'agi' | 'def' | 'vit') => {
    if (remainingPoints <= 0) return;
    setAllocated(prev => ({
      ...prev,
      [stat]: prev[stat] + 1
    }));
  };

  const handleDecrement = (stat: 'str' | 'agi' | 'def' | 'vit') => {
    if (allocated[stat] <= 0) return;
    setAllocated(prev => ({
      ...prev,
      [stat]: prev[stat] - 1
    }));
  };

  const handleReset = () => {
    setAllocated({ str: 0, agi: 0, def: 0, vit: 0 });
    setError(null);
  };

  const handleApply = async () => {
    if (pendingSpent <= 0) return;
    setSaving(true);
    setError(null);

    try {
      const res = await client.api.users.me['allocate-stats'].$post({
        json: {
          str: allocated.str,
          agi: allocated.agi,
          def: allocated.def,
          vit: allocated.vit
        }
      });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        alert('ステータスポイントを割り振りました！');
        setAllocated({ str: 0, agi: 0, def: 0, vit: 0 });
        await onReloadProfile();
      } else {
        setError((data as any).error || 'ステータスの更新に失敗しました。');
      }
    } catch (err) {
      console.error('Failed to allocate stats:', err);
      setError('通信エラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  const baseStr = currentUser.stat_str || 10;
  const baseAgi = currentUser.stat_agi || 10;
  const baseDef = currentUser.stat_def || 10;
  const baseVit = currentUser.stat_vit || 10;

  const statList = [
    {
      key: 'str' as const,
      name: '筋力 (STR)',
      icon: '💪',
      base: baseStr,
      added: allocated.str,
      description: '腕立て伏せなどの運動時の消費カロリー推定値が上がります（1点ごとに約1%アップ）'
    },
    {
      key: 'agi' as const,
      name: '俊敏 (AGI)',
      icon: '🏃‍♂️',
      base: baseAgi,
      added: allocated.agi,
      description: 'ランニング時の領土獲得エリア面積が上がります（1点ごとに約1%アップ）'
    },
    {
      key: 'def' as const,
      name: '防御 (DEF)',
      icon: '🛡️',
      base: baseDef,
      added: allocated.def,
      description: '他人に領土を奪われにくくする防衛体制（将来的な防衛コストの緩和等に影響）'
    },
    {
      key: 'vit' as const,
      name: '生命力 (VIT)',
      icon: '❤️',
      base: baseVit,
      added: allocated.vit,
      description: '保有できる最大領土数の上限が上がります（1点ごとに保有上限+1個）'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
      {/* レベル・経験値ステータス */}
      <div className="cyber-glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', color: '#00d4ff', fontSize: '1.1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏆</span> キャラクター成長ステータス
        </h3>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>現在のレベル:</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--neon-green)', textShadow: '0 0 10px rgba(0,255,136,0.3)' }}>
            Lv. {level}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          <span>経験値 (XP):</span>
          <span>{xp} / {xpNeeded} XP</span>
        </div>
        <div style={{ width: '100%', height: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden', marginBottom: '1.2rem' }}>
          <div style={{
            width: `${Math.min(100, (xp / xpNeeded) * 100)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ff007f, #00d4ff)',
            borderRadius: '5px',
            transition: 'width 0.4s ease'
          }} />
        </div>

        {/* 割り振り可能ポイント */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.8rem 1.2rem',
          backgroundColor: availablePoints > 0 ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255,255,255,0.01)',
          border: availablePoints > 0 ? '1px solid var(--neon-green)' : '1px solid var(--border-light)',
          borderRadius: '12px',
          boxShadow: availablePoints > 0 ? '0 0 15px rgba(0, 255, 136, 0.1)' : 'none'
        }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: availablePoints > 0 ? '#fff' : 'var(--text-secondary)' }}>
              未使用のステータスポイント
            </div>
            {availablePoints > 0 && (
              <div style={{ fontSize: '0.68rem', color: 'var(--neon-green)', marginTop: '2px' }}>
                レベルアップ報酬ポイントを割り振れます！
              </div>
            )}
          </div>
          <span style={{
            fontSize: '1.5rem',
            fontWeight: '900',
            color: remainingPoints > 0 ? 'var(--neon-green)' : '#fff',
            fontFamily: "'Outfit', sans-serif"
          }}>
            {remainingPoints}
          </span>
        </div>
      </div>

      {/* ステータス一覧 */}
      <div className="cyber-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem', fontWeight: 'bold' }}>
          📊 アトリビュート（能力値）
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {statList.map(s => {
            const hasPendingAdd = s.added > 0;
            return (
              <div key={s.key} style={{
                padding: '10px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.03)',
                backgroundColor: 'rgba(255,255,255,0.005)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{s.icon}</span>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{s.name}</span>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.3' }}>
                        {s.description}
                      </div>
                    </div>
                  </div>

                  {/* コントロール */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {availablePoints > 0 && (
                      <button
                        onClick={() => handleDecrement(s.key)}
                        disabled={s.added <= 0}
                        style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          border: '1px solid rgba(255,255,255,0.1)',
                          backgroundColor: s.added > 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)',
                          color: s.added > 0 ? '#fff' : '#666',
                          fontWeight: 'bold', cursor: s.added > 0 ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        -
                      </button>
                    )}

                    <span style={{
                      minWidth: '36px', textAlign: 'center', fontSize: '1.05rem', fontWeight: 'bold',
                      color: hasPendingAdd ? 'var(--neon-green)' : '#fff'
                    }}>
                      {s.base} {hasPendingAdd ? `+ ${s.added}` : ''}
                    </span>

                    {availablePoints > 0 && (
                      <button
                        onClick={() => handleIncrement(s.key)}
                        disabled={remainingPoints <= 0}
                        style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          border: remainingPoints > 0 ? '1px solid var(--neon-green)' : '1px solid rgba(255,255,255,0.1)',
                          backgroundColor: remainingPoints > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.01)',
                          color: remainingPoints > 0 ? 'var(--neon-green)' : '#666',
                          fontWeight: 'bold', cursor: remainingPoints > 0 ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ color: '#ff4444', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>
            ⚠️ {error}
          </div>
        )}

        {/* 決定 / リセットボタン */}
        {pendingSpent > 0 && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
            <button
              onClick={handleReset}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: 'transparent', color: 'var(--text-secondary)',
                fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              リセット
            </button>
            <button
              onClick={handleApply}
              disabled={saving}
              style={{
                flex: 2, padding: '10px', borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, var(--neon-green), #00d4ff)',
                color: '#000', fontWeight: 'bold', cursor: 'pointer',
                fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0, 255, 136, 0.2)'
              }}
            >
              {saving ? '適用中...' : '割り振りを確定する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RPGStatsSection;
