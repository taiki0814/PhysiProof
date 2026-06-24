import React, { useState, useEffect } from 'react';
import client from '../lib/hc';
import { ACHIEVEMENT_DEFINITIONS } from '@my-app/shared';
import { getUserAvatarSrc } from '../pages/Dashboard';

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
  fontSize: '1rem', 
  WebkitAppearance: 'none' 
};

interface ProfileModalProps {
  currentUser: { 
    name: string; 
    avatar_id: string; 
    avatar_image?: string | null; 
    login_id?: string; 
  };
  onClose: () => void;
  onSave: (name: string, avatar: string, avatarImage: string | null, loginId?: string, password?: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ 
  currentUser, 
  onClose, 
  onSave 
}) => {
  const [name, setName] = useState(currentUser.name);
  const [avatar, setAvatar] = useState(currentUser.avatar_id);
  const [avatarImage, setAvatarImage] = useState<string | null>(currentUser.avatar_image || null);
  const [loginId, setLoginId] = useState(currentUser.login_id || '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        const res = await client.api.achievements.me.$get();
        if (res.ok) {
          const data = await res.json();
          setUnlockedAchievements((data as any).achievements.map((a: any) => a.achievement_id));
        }
      } catch (err) {
        console.error('Failed to fetch achievements:', err);
      }
    };
    fetchAchievements();
  }, []);

  const presets = ['male1', 'male2', 'male3', 'female1', 'female2', 'female3'];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max_size = 128;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        try {
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setAvatarImage(compressed);
          setAvatar('custom');
        } catch (err) {
          setError('画像の読み込み・圧縮処理に失敗しました。');
        }
      };
      img.onerror = () => setError('有効な画像ファイルを選択してください。');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('表示名を入力してください。');
      return;
    }

    if (loginId.trim().length < 3) {
      setError('ログインIDは3文字以上である必要があります。');
      return;
    }

    if (password) {
      if (password.length < 6) {
        setError('新しいパスワードは6文字以上である必要があります。');
        return;
      }
      if (password !== passwordConfirm) {
        setError('確認用パスワードが一致しません。');
        return;
      }
    }

    onSave(name, avatar, avatar === 'custom' ? avatarImage : null, loginId, password || undefined);
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
          アカウント設定
        </h3>

        {error && (
          <div style={{ backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', padding: '0.75rem', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(255,68,68,0.2)', marginBottom: '1rem' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          
          {/* Avatar Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <img
                src={getUserAvatarSrc(avatar, avatarImage)}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid #00ff88',
                  boxShadow: '0 0 16px rgba(0,255,136,0.3)'
                }}
                alt="preview"
              />
              {avatar === 'custom' && (
                <span style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#00ff88', color: '#000', fontSize: '0.6rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '8px' }}>
                  CUSTOM
                </span>
              )}
            </div>
            <label htmlFor="avatar-file-input" style={{
              fontSize: '0.8rem',
              color: '#00d4ff',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: 'rgba(0,212,255,0.1)',
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid rgba(0,212,255,0.2)',
              transition: '0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,212,255,0.1)'; }}
            >
              📂 独自の画像をアップロード
            </label>
            <input
              type="file"
              id="avatar-file-input"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Avatar presets selection */}
          <div>
            <label style={labelStyle}>またはプリセットから選択</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
              {presets.map(av => (
                <img
                  key={av}
                  src={`/avatars/${av}.png`}
                  onClick={() => {
                    setAvatar(av);
                    setAvatarImage(null);
                  }}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    objectFit: 'cover',
                    border: avatar === av ? '2px solid #00ff88' : '2px solid transparent',
                    boxShadow: avatar === av ? '0 0 8px rgba(0,255,136,0.4)' : 'none',
                    opacity: avatar === av ? 1 : 0.4,
                    transition: 'all 0.2s'
                  }}
                  alt={av}
                />
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>表示名</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="表示名" />
          </div>

          <div>
            <label style={labelStyle}>ログインID</label>
            <input value={loginId} onChange={e => setLoginId(e.target.value)} style={inputStyle} placeholder="ログインID" />
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#ffcc00', fontWeight: 'bold', marginBottom: '0.8rem' }}>
              🔑 パスワードを変更する場合のみ入力してください
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div>
                <label style={labelStyle}>新しいパスワード</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="新しいパスワード（6文字以上）" />
              </div>
              <div>
                <label style={labelStyle}>新しいパスワード（確認）</label>
                <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} style={inputStyle} placeholder="確認のためもう一度入力" />
              </div>
            </div>
          </div>

          {/* Achievements (Cyber Badges) */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <span style={{ display: 'block', fontSize: '0.8rem', color: '#00ff88', fontWeight: 'bold', marginBottom: '0.8rem', letterSpacing: '0.04em' }}>
              🏆 獲得実績（サイバーバッジ）
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              {Object.values(ACHIEVEMENT_DEFINITIONS).map((def) => {
                const isUnlocked = unlockedAchievements.includes(def.id);
                return (
                  <div 
                    key={def.id} 
                    className={isUnlocked ? "badge-neon-glow" : "badge-locked"}
                    title={`${def.title}: ${def.description}`}
                    style={{
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '12px',
                      padding: '0.6rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.3s ease',
                      cursor: 'help',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ fontSize: '1.5rem', filter: isUnlocked ? 'none' : 'grayscale(1)' }}>{def.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isUnlocked ? '#ffffff' : '#666' }}>{def.title}</span>
                      <span style={{ fontSize: '0.6rem', color: isUnlocked ? '#00ff88' : '#444', fontWeight: 'bold' }}>
                        {isUnlocked ? 'UNLOCKED' : 'LOCKED'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1,
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
              キャンセル
            </button>
            <button type="submit" style={{
              flex: 1,
              padding: '0.85rem',
              backgroundColor: '#00ff88',
              border: 'none',
              color: '#000',
              fontWeight: '900',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(0,255,136,0.2)'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,255,136,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,255,136,0.2)'; }}
            >
              設定を保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
