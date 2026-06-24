import React from 'react';
import { getUserAvatarSrc } from '../pages/Dashboard';

interface RankingViewProps {
  ranking: any[];
  period: string;
  setPeriod: (p: any) => void;
  duration: string;
  setDuration: (d: any) => void;
}

export const RankingView: React.FC<RankingViewProps> = ({ 
  ranking, 
  period, 
  setPeriod, 
  duration, 
  setDuration 
}) => {
  const getRankBadge = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getRankCardStyle = (rank: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.9rem 1.1rem',
      borderRadius: '16px',
      marginBottom: '0.75rem',
      transition: 'all 0.2s ease',
      boxSizing: 'border-box'
    };

    if (rank === 1) {
      return {
        ...base,
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.08) 0%, rgba(255, 215, 0, 0.01) 100%)',
        border: '1px solid rgba(255, 215, 0, 0.25)',
        boxShadow: '0 4px 20px rgba(255, 215, 0, 0.04)'
      };
    }
    if (rank === 2) {
      return {
        ...base,
        background: 'linear-gradient(135deg, rgba(192, 192, 192, 0.06) 0%, rgba(192, 192, 192, 0.01) 100%)',
        border: '1px solid rgba(192, 192, 192, 0.18)',
      };
    }
    if (rank === 3) {
      return {
        ...base,
        background: 'linear-gradient(135deg, rgba(205, 127, 50, 0.05) 0%, rgba(205, 127, 50, 0.01) 100%)',
        border: '1px solid rgba(205, 127, 50, 0.12)',
      };
    }
    return {
      ...base,
      background: 'rgba(255, 255, 255, 0.01)',
      border: '1px solid rgba(255, 255, 255, 0.03)',
    };
  };

  const getRankBadgeStyle = (rank: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: '0.95rem',
      fontWeight: '900',
      width: '26px',
      height: '26px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      marginRight: '0.7rem',
      flexShrink: 0
    };

    if (rank === 1) return { ...base, fontSize: '1.2rem' };
    if (rank === 2) return { ...base, fontSize: '1.2rem' };
    if (rank === 3) return { ...base, fontSize: '1.2rem' };
    return { ...base, color: '#8a8a93', backgroundColor: 'rgba(255,255,255,0.04)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Dynamic Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.6)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['daily', 'weekly', 'yearly', 'all'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: '700',
                transition: 'all 0.2s',
                backgroundColor: duration === d ? '#00ff88' : 'transparent',
                color: duration === d ? '#000' : '#8a8a93'
              }}
            >
              {d === 'daily' ? '今日' : d === 'weekly' ? '今週' : d === 'yearly' ? '今年' : '全期間'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.6)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['all', 'morning', 'afternoon', 'night'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: '700',
                transition: 'all 0.2s',
                backgroundColor: period === p ? '#00d4ff' : 'transparent',
                color: period === p ? '#000' : '#8a8a93'
              }}
            >
              {p === 'all' ? '総合' : p === 'morning' ? '朝' : p === 'afternoon' ? '昼' : '夜'}
            </button>
          ))}
        </div>
      </div>

      {/* List Container */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.2rem' }}>
        {ranking.length > 0 && ranking[0].name !== 'NO DATA' ? (
          ranking.map((row, i) => (
            <div 
              key={i} 
              style={getRankCardStyle(row.rank)}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.borderColor = row.rank === 1 ? 'rgba(255, 215, 0, 0.4)' : row.rank === 2 ? 'rgba(192, 192, 192, 0.3)' : row.rank === 3 ? 'rgba(205, 127, 50, 0.25)' : 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = row.rank === 1 ? 'rgba(255, 215, 0, 0.25)' : row.rank === 2 ? 'rgba(192, 192, 192, 0.18)' : row.rank === 3 ? 'rgba(205, 127, 50, 0.12)' : 'rgba(255,255,255,0.03)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                {/* Badge */}
                <div style={getRankBadgeStyle(row.rank)}>
                  {getRankBadge(row.rank)}
                </div>
                {/* Avatar */}
                <img
                  src={getUserAvatarSrc(row.avatar_id, row.avatar_image)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    marginRight: '0.75rem',
                    border: row.rank <= 3 
                      ? `1.5px solid ${row.rank === 1 ? '#ffd700' : row.rank === 2 ? '#c0c0c0' : '#cd7f32'}`
                      : '1.5px solid rgba(255,255,255,0.08)',
                    flexShrink: 0
                  }}
                  alt="avatar"
                />
                {/* Username */}
                <span style={{ 
                  fontWeight: '700', 
                  fontSize: '0.9rem',
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  color: row.rank === 1 ? '#ffd700' : '#ffffff'
                }}>
                  {row.name}
                </span>
              </div>

              {/* Stats */}
              <div style={{ textAlign: 'right', marginLeft: '0.8rem', flexShrink: 0 }}>
                <div style={{ 
                  color: row.rank === 1 ? '#00ff88' : '#00d4ff', 
                  fontWeight: '800', 
                  fontSize: '0.95rem' 
                }}>
                  {row.points.toLocaleString()} <span style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>㎡</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#666', marginTop: '1px', fontWeight: '600' }}>
                  ⚔️ {row.territories} 領域
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#444' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.8rem' }}>🏆</div>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', color: '#555' }}>該当データがありません</p>
          </div>
        )}
      </div>
    </div>
  );
};
export default RankingView;
