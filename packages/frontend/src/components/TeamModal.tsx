import React, { useState, useEffect } from 'react';
import client from '../lib/hc';
import { getUserAvatarSrc } from '../pages/Dashboard';
import AppIcon from './AppIcon';

interface TeamModalProps {
  currentUser: { uid: string; team_id?: string | null; team_name?: string | null };
  onClose: () => void;
  onRefreshUser: () => void;
}

export const TeamModal: React.FC<TeamModalProps> = ({ currentUser, onClose, onRefreshUser }) => {
  const [teamNameInput, setTeamNameInput] = useState('');
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [myTeam, setMyTeam] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyTeam = async () => {
    try {
      const res = await client.api.teams.me.$get();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setMyTeam(data.team);
        }
      }
    } catch (e) {
      console.error('Failed to fetch my team:', e);
    }
  };

  const fetchAllTeams = async () => {
    try {
      const res = await client.api.teams.$get();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setAllTeams(data.teams);
        }
      }
    } catch (e) {
      console.error('Failed to fetch all teams:', e);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchMyTeam(), fetchAllTeams()]).finally(() => setIsLoading(false));
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamNameInput.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await client.api.teams.$post({ json: { name: teamNameInput } });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setTeamNameInput('');
          onRefreshUser();
          await Promise.all([fetchMyTeam(), fetchAllTeams()]);
        }
      } else {
        const errData = await res.json() as any;
        setError(errData.error || 'チームの作成に失敗しました。');
      }
    } catch (err) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await client.api.teams.join.$post({ json: { team_id: teamId } });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          onRefreshUser();
          await Promise.all([fetchMyTeam(), fetchAllTeams()]);
        }
      } else {
        const errData = await res.json() as any;
        setError(errData.error || 'チームへの参加に失敗しました。');
      }
    } catch (err) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!window.confirm('本当にこのチームから脱退しますか？獲得した領域のチーム紐付けも解除されます。')) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await client.api.teams.leave.$post();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          onRefreshUser();
          await Promise.all([fetchMyTeam(), fetchAllTeams()]);
        }
      } else {
        const errData = await res.json() as any;
        setError(errData.error || 'チームの脱退に失敗しました。');
      }
    } catch (err) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = { 
    display: 'block', 
    fontSize: '0.8rem', 
    color: '#8a8a93', 
    marginBottom: '0.5rem', 
    fontWeight: '700' 
  };

  const inputStyle: React.CSSProperties = { 
    width: '100%', 
    backgroundColor: 'rgba(5, 5, 5, 0.75)', 
    border: '1px solid rgba(255,255,255,0.08)', 
    borderRadius: '12px', 
    padding: '0.9rem', 
    color: '#fff', 
    boxSizing: 'border-box', 
    fontSize: '1rem'
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', boxSizing: 'border-box' }}>
      <div className="cyber-glass" style={{ 
        width: '100%', 
        maxWidth: '440px', 
        padding: '2rem 1.5rem', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        boxShadow: '0 20px 80px rgba(0,0,0,0.8), 0 0 30px rgba(0,255,136,0.05)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.2rem', color: '#00ff88', textAlign: 'center', fontSize: '1.3rem', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>
          <AppIcon name="team" size={24} /> チーム管理
        </h3>

        {error && (
          <div style={{ backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', padding: '0.75rem', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(255,68,68,0.2)', marginBottom: '1rem' }}>
            <AppIcon name="warning" /> {error}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {isLoading && <div style={{ color: '#00ff88', textAlign: 'center', fontSize: '0.85rem' }}>読み込み中...</div>}

          {myTeam ? (
            /* 所属チーム表示 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ border: '1px solid rgba(0,255,136,0.2)', borderRadius: '12px', padding: '1rem', background: 'rgba(0,255,136,0.02)' }}>
                <span style={{ fontSize: '0.7rem', color: '#8a8a93' }}>所属チーム</span>
                <h4 style={{ margin: '0.3rem 0 0 0', fontSize: '1.4rem', color: '#00ff88', fontWeight: 'bold' }}>{myTeam.name}</h4>
              </div>

              <div>
                <label style={labelStyle}>チームメンバー ({myTeam.members?.length || 0}名)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {myTeam.members?.map((member: any) => (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img 
                          src={getUserAvatarSrc(member.avatar_id, member.avatar_image)} 
                          style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} 
                          alt="avatar" 
                        />
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{member.name}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#00d4ff', fontWeight: 'bold' }}>Lv.{member.level}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={handleLeaveTeam} disabled={isLoading} style={{
                width: '100%',
                padding: '0.85rem',
                backgroundColor: 'rgba(255,68,68,0.1)',
                border: '1px solid rgba(255,68,68,0.3)',
                color: '#ff4444',
                borderRadius: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: '0.2s',
                marginTop: '1rem'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,68,68,0.15)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,68,68,0.1)'}
              >
                チームを脱退する
              </button>
            </div>
          ) : (
            /* チーム作成・加入フォーム */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* チーム作成 */}
              <form onSubmit={handleCreateTeam} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <label style={labelStyle}>新規チーム作成</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    value={teamNameInput} 
                    onChange={e => setTeamNameInput(e.target.value)} 
                    style={inputStyle} 
                    placeholder="チーム名を入力" 
                    disabled={isLoading}
                  />
                  <button type="submit" disabled={isLoading || !teamNameInput.trim()} style={{
                    padding: '0 1.2rem',
                    backgroundColor: '#00ff88',
                    border: 'none',
                    color: '#000',
                    fontWeight: '900',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}>
                    作成
                  </button>
                </div>
              </form>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                <label style={labelStyle}>既存のチームに加入</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {allTeams.length > 0 ? (
                    allTeams.map((team: any) => (
                      <div key={team.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>{team.name}</span>
                          <span style={{ fontSize: '0.65rem', color: '#8a8a93' }}>リーダー: {team.owner_name} | メンバー: {team.member_count}名</span>
                        </div>
                        <button onClick={() => handleJoinTeam(team.id)} disabled={isLoading} style={{
                          padding: '0.4rem 0.8rem',
                          backgroundColor: 'rgba(0,212,255,0.1)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          color: '#00d4ff',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: '0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,212,255,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,212,255,0.1)'}
                        >
                          参加
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#444', fontSize: '0.8rem', padding: '1rem', textAlign: 'center' }}>
                      有効なチームがありません
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 閉じるボタン */}
        <div style={{ display: 'flex', marginTop: '1.5rem', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{
            width: '100%',
            padding: '0.85rem',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            borderRadius: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: '0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
