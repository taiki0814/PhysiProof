import React, { useState, useEffect } from 'react';
import client from '../lib/hc';

interface FortifyTerritorySelectorProps {
  missionId: string;
  onClose: () => void;
  onSuccess: () => void;
  triggerAchievementUnlock: (achievements: any[]) => void;
}

export const FortifyTerritorySelector: React.FC<FortifyTerritorySelectorProps> = ({
  missionId,
  onClose,
  onSuccess,
  triggerAchievementUnlock
}) => {
  const [myTerritories, setMyTerritories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMyTerritories = async () => {
      try {
        const userData = localStorage.getItem('physiproof_user');
        if (!userData) {
          setError('ユーザー情報が見つかりません');
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(userData);
        const myUid = parsed.userId;

        const res = await client.api.territories.$get();
        if (res.ok) {
          const data = await res.json();
          const allTerritories = (data as any).territories || [];
          const filtered = allTerritories.filter((t: any) => t.user_id === myUid);
          setMyTerritories(filtered);
          if (filtered.length > 0) {
            setSelectedId(filtered[0].id);
          }
        } else {
          setError('領域データの取得に失敗しました');
        }
      } catch (err) {
        console.error('Failed to fetch user territories:', err);
        setError('通信エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchMyTerritories();
  }, []);

  const handleClaim = async () => {
    if (!selectedId) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await client.api.missions.claim.$post({
        json: {
          missionId,
          territoryId: selectedId
        }
      });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        if ((data as any).newAchievements) triggerAchievementUnlock((data as any).newAchievements);
        alert(`領土の要塞化に成功しました！(新しいレベル: ${(data as any).newFortificationLevel})`);
        onSuccess();
      } else {
        setError((data as any).error || '報酬の受け取りに失敗しました');
      }
    } catch (err) {
      console.error('Failed to claim reward:', err);
      setError('通信エラーが発生しました');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#8a8a93', fontSize: '0.85rem' }}>
        <div className="dot-pulse-animation">領域データを読み込み中</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        <div style={{ color: '#ff453a', fontSize: '0.8rem', marginBottom: '0.5rem' }}>⚠️ {error}</div>
        <button onClick={onClose} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>閉じる</button>
      </div>
    );
  }

  if (myTerritories.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(255,69,58,0.05)', border: '1px solid rgba(255,69,58,0.15)', borderRadius: '12px' }}>
        <div style={{ color: '#ff453a', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>支配領域が見つかりません</div>
        <div style={{ color: '#8a8a93', fontSize: '0.7rem', lineHeight: '1.4', marginBottom: '0.8rem' }}>
          ミッションをクリアして領土を強化するには、まず「マップ」タブからご自身の支配領域を獲得する必要があります。
        </div>
        <button onClick={onClose} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>閉じる</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.2rem', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '16px', backgroundColor: 'rgba(0, 255, 136, 0.02)', textAlign: 'left' }}>
      <span style={{ display: 'block', fontSize: '0.8rem', color: '#00ff88', fontWeight: 'bold', marginBottom: '0.6rem' }}>
        🛡️ 要塞化する領域を選択
      </span>
      <select
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        style={{
          width: '100%',
          backgroundColor: '#000',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '0.6rem',
          borderRadius: '8px',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          outline: 'none'
        }}
      >
        {myTerritories.map((t, idx) => (
          <option key={t.id} value={t.id}>
            領域 #{idx + 1} ({Math.floor(t.area_sqm)}㎡ | Lv.{t.fortification_level || 0})
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'none',
            color: '#8a8a93',
            fontSize: '0.78rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          キャンセル
        </button>
        <button
          onClick={handleClaim}
          disabled={claiming || !selectedId}
          style={{
            flex: 2,
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: claiming ? 'rgba(0, 255, 136, 0.3)' : 'linear-gradient(135deg, #00ff88, #00d4ff)',
            color: '#000',
            fontSize: '0.78rem',
            fontWeight: '900',
            cursor: claiming || !selectedId ? 'not-allowed' : 'pointer',
            boxShadow: claiming ? 'none' : '0 4px 12px rgba(0, 255, 136, 0.15)',
          }}
        >
          {claiming ? '要塞化処理中...' : '要塞化を実行 🛡️'}
        </button>
      </div>
    </div>
  );
};
