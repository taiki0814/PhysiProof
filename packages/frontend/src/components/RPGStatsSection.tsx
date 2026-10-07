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
      description: '領域の重なりは防御力に関係なく通常どおり塗り替わります。'
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

  const hudStatsCss = `
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

    .hud-stats-container {
      font-family: 'Share Tech Mono', 'Courier New', monospace;
      color: #00ff88;
    }

    .hud-stats-card {
      background: rgba(6, 10, 20, 0.8);
      border: 1px solid rgba(0, 255, 136, 0.25);
      border-radius: 6px;
      padding: 20px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 0 15px rgba(0, 255, 136, 0.08), inset 0 0 8px rgba(0, 255, 136, 0.03);
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
    }

    .hud-stats-card::before, .hud-stats-card::after {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      border-color: #00ff88;
      border-style: solid;
      pointer-events: none;
    }
    .hud-stats-card::before {
      top: -1px; left: -1px;
      border-width: 1.5px 0 0 1.5px;
    }
    .hud-stats-card::after {
      bottom: -1px; right: -1px;
      border-width: 0 1.5px 1.5px 0;
    }

    .hud-stats-title {
      font-size: 0.85rem;
      font-weight: bold;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin: 0 0 16px 0;
      border-left: 3px solid #00ff88;
      padding-left: 8px;
      text-align: left;
    }

    .hud-stats-btn {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 136, 0.3);
      background: rgba(0, 255, 136, 0.05);
      color: #00ff88;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      outline: none;
    }

    .hud-stats-btn:hover:not(:disabled) {
      background: rgba(0, 255, 136, 0.2);
      box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
      transform: scale(1.05);
    }

    .hud-stats-btn:disabled {
      border-color: rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      color: #444;
      cursor: not-allowed;
    }

    .hud-stats-apply-btn {
      flex: 2;
      padding: 10px;
      border-radius: 4px;
      border: none;
      background: linear-gradient(135deg, #00ff88, #00d4ff);
      color: #000;
      fontWeight: bold;
      cursor: pointer;
      font-size: 0.8rem;
      boxShadow: 0 4px 15px rgba(0, 255, 136, 0.25);
      transition: all 0.2s;
      font-family: 'Share Tech Mono', monospace;
      font-weight: bold;
    }

    .hud-stats-apply-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
    }

    .hud-stats-reset-btn {
      flex: 1;
      padding: 10px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: transparent;
      color: #8a8a93;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s;
      font-family: 'Share Tech Mono', monospace;
    }

    .hud-stats-reset-btn:hover {
      border-color: rgba(0, 229, 255, 0.4);
      color: #00e5ff;
    }
  `;

  return (
    <div className="hud-stats-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', textAlign: 'left' }}>
      <style dangerouslySetInnerHTML={{ __html: hudStatsCss }} />

      {/* Attributes Allocation Panel */}
      <div className="hud-stats-card">
        <div className="hud-stats-title">ATTRIBUTE POINTS ALLOCATION</div>

        {availablePoints > 0 ? (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 255, 136, 0.04)',
            border: '1px solid rgba(0, 255, 136, 0.25)',
            borderRadius: '4px',
            marginBottom: '15px',
            boxShadow: '0 0 10px rgba(0, 255, 136, 0.05)'
          }}>
            <div>
              <div style={{ fontSize: '0.74rem', fontWeight: 'bold', color: '#fff' }}>
                AVAILABLE STAT POINTS:
              </div>
              <div style={{ fontSize: '0.58rem', color: '#00ff88', marginTop: '2px', letterSpacing: '0.5px' }}>
                ALLOCATE POINTS TO STRENGTHEN CHARACTER
              </div>
            </div>
            <span style={{
              fontSize: '1.4rem',
              fontWeight: '900',
              color: remainingPoints > 0 ? '#00ff88' : '#fff',
              fontFamily: 'monospace',
              textShadow: remainingPoints > 0 ? '0 0 8px rgba(0,255,136,0.3)' : 'none'
            }}>
              {remainingPoints}
            </span>
          </div>
        ) : (
          <div style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '4px',
            fontSize: '0.62rem',
            color: '#8a8a93',
            marginBottom: '15px',
            letterSpacing: '0.5px'
          }}>
            GAIN STAT POINTS BY LEVELING UP FROM COMPLETING MISSIONS AND EXERCISING
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {statList.map(s => {
            const hasPendingAdd = s.added > 0;
            return (
              <div key={s.key} style={{
                padding: '8px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.03)',
                backgroundColor: 'rgba(255,255,255,0.005)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>{s.name}</span>
                      <div style={{ fontSize: '0.58rem', color: '#8a8a93', marginTop: '2px', lineHeight: '1.3' }}>
                        {s.description}
                      </div>
                    </div>
                  </div>

                  {/* Increment/Decrement Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {availablePoints > 0 && (
                      <button
                        onClick={() => handleDecrement(s.key)}
                        disabled={s.added <= 0}
                        className="hud-stats-btn"
                      >
                        -
                      </button>
                    )}

                    <span style={{
                      minWidth: '38px',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: hasPendingAdd ? '#00ff88' : '#fff',
                      fontFamily: 'monospace'
                    }}>
                      {s.base} {hasPendingAdd ? `+${s.added}` : ''}
                    </span>

                    {availablePoints > 0 && (
                      <button
                        onClick={() => handleIncrement(s.key)}
                        disabled={remainingPoints <= 0}
                        className="hud-stats-btn"
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
          <div style={{ color: '#ff4444', fontSize: '0.7rem', textAlign: 'center', marginTop: '10px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Action Buttons */}
        {pendingSpent > 0 && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={handleReset}
              className="hud-stats-reset-btn"
            >
              RESET
            </button>
            <button
              onClick={handleApply}
              disabled={saving}
              className="hud-stats-apply-btn"
            >
              {saving ? 'SAVING...' : 'COMMIT ALLOCATION'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RPGStatsSection;
