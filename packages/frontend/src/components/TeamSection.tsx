import React, { useState, useEffect } from 'react';
import client from '../lib/hc';
import { getUserAvatarSrc } from '../pages/Dashboard';

interface TeamSectionProps {
  currentUser: { uid: string; team_id?: string | null; team_name?: string | null };
  onRefreshUser: () => void;
}

export const TeamSection: React.FC<TeamSectionProps> = ({ currentUser, onRefreshUser }) => {
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
          setMyTeam(null);
          await fetchAllTeams();
        }
      } else {
        const errData = await res.json() as any;
        setError(errData.error || 'チームからの脱退に失敗しました。');
      }
    } catch (err) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '0.2rem' }}>
      {error && (
        <div style={{
          padding: '0.8rem 1rem',
          borderRadius: '12px',
          backgroundColor: 'rgba(255, 68, 68, 0.12)',
          border: '1px solid rgba(255, 68, 68, 0.3)',
          color: '#ff4444',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* --- Current Team Section --- */}
      {myTeam ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.06) 0%, rgba(0, 212, 255, 0.02) 100%)',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          borderRadius: '20px',
          padding: '1.4rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#00ff88', letterSpacing: '0.5px' }}>YOUR TEAM</div>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.4rem', color: '#ffffff', fontWeight: '900' }}>
                🛡️ {myTeam.name}
              </h3>
            </div>
            <button
              onClick={handleLeaveTeam}
              disabled={isLoading}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '10px',
                border: '1px solid rgba(255, 68, 68, 0.3)',
                backgroundColor: 'rgba(255, 68, 68, 0.08)',
                color: '#ff6666',
                fontSize: '0.78rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              チーム脱退
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.2rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: '0.7rem', color: '#8a8a93', fontWeight: 'bold' }}>総支配面積</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#00ff88', fontFamily: "'Outfit', sans-serif" }}>
                {Math.floor(myTeam.total_area_sqm || 0).toLocaleString()} m²
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: '0.7rem', color: '#8a8a93', fontWeight: 'bold' }}>獲得領土数</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#00d4ff', fontFamily: "'Outfit', sans-serif" }}>
                {myTeam.territories_count || 0} 個
              </div>
            </div>
          </div>

          <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            👥 チームメンバー ({(myTeam.members || []).length}名)
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(myTeam.members || []).map((member: any) => (
              <div key={member.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.8rem',
                borderRadius: '10px',
                backgroundColor: member.id === currentUser.uid ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.02)',
                border: member.id === currentUser.uid ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <img
                    src={getUserAvatarSrc(member.avatar_id, member.avatar_image)}
                    alt={member.name}
                    style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>
                      {member.name} {member.id === currentUser.uid && <span style={{ fontSize: '0.7rem', color: '#00ff88' }}>(あなた)</span>}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#8a8a93' }}>Lv.{member.level || 1}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#00ff88' }}>
                    {Math.floor(member.user_total_area || 0).toLocaleString()} m²
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* --- Create Team Form --- */
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '20px',
          padding: '1.2rem'
        }}>
          <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '1rem', color: '#ffffff', fontWeight: 'bold' }}>
            ➕ 新規チーム結成
          </h3>
          <form onSubmit={handleCreateTeam} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="チーム名を入力 (例: リバイアサン)"
              value={teamNameInput}
              onChange={(e) => setTeamNameInput(e.target.value)}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                backgroundColor: 'rgba(5, 5, 5, 0.75)',
                border: '1px solid rgba(0, 255, 136, 0.2)',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none'
              }}
              maxLength={30}
              required
            />
            <button
              type="submit"
              disabled={isLoading || !teamNameInput.trim()}
              style={{
                padding: '0.75rem 1.2rem',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                color: '#000',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              結成
            </button>
          </form>
        </div>
      )}

      {/* --- All Teams List --- */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '20px',
        padding: '1.2rem'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#ffffff', fontWeight: 'bold' }}>
          🛡️ 既存チーム一覧
        </h3>

        {allTeams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#8a8a93', fontSize: '0.85rem' }}>
            まだ作成されたチームはありません。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {allTeams.map((t) => {
              const isJoined = currentUser.team_id === t.id;
              return (
                <div key={t.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.8rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: isJoined ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.01)',
                  border: isJoined ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.04)'
                }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#8a8a93', marginTop: '2px' }}>
                      メンバー: {t.member_count}名 | 総面積: {Math.floor(t.total_area_sqm || 0).toLocaleString()} m²
                    </div>
                  </div>

                  <div>
                    {isJoined ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00ff88', backgroundColor: 'rgba(0,255,136,0.1)', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
                        所属中
                      </span>
                    ) : (
                      <button
                        onClick={() => handleJoinTeam(t.id)}
                        disabled={isLoading || !!currentUser.team_id}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: currentUser.team_id ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00ff88, #00d4ff)',
                          color: currentUser.team_id ? '#666' : '#000',
                          fontSize: '0.78rem',
                          fontWeight: 'bold',
                          cursor: currentUser.team_id ? 'not-allowed' : 'pointer'
                        }}
                      >
                        参加
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
