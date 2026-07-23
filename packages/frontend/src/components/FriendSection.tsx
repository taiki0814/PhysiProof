import React, { useState, useEffect } from 'react';
import client from '../lib/hc';
import { getUserAvatarSrc } from '../pages/Dashboard';

interface FriendUser {
  id: string;
  name: string;
  login_id?: string;
  avatar_id?: string | null;
  avatar_image?: string | null;
  level?: number;
  friend_since?: string;
  friend_status?: 'none' | 'pending_sent' | 'pending_received' | 'friend';
}

interface FriendRequest {
  request_id: string;
  sender_id: string;
  created_at: string;
  sender_name: string;
  sender_login_id?: string;
  sender_avatar_id?: string | null;
  sender_avatar_image?: string | null;
  sender_level?: number;
}

export const FriendSection: React.FC<{ currentUserId?: string }> = ({ currentUserId }) => {
  const [subTab, setSubTab] = useState<'list' | 'requests' | 'search'>('list');
  
  // Data states
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchFriends = async () => {
    try {
      const res = await client.api.friends.$get();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setFriends(data.friends || []);
        }
      }
    } catch (e) {
      console.error('Failed to fetch friends:', e);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await client.api.friends.requests.$get();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setRequests(data.requests || []);
        }
      }
    } catch (e) {
      console.error('Failed to fetch friend requests:', e);
    }
  };

  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await client.api.friends.search.$get({ query: { q: searchQuery.trim() } });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setSearchResults(data.users || []);
        }
      }
    } catch (e) {
      console.error('Failed to search users:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (targetUserId: string) => {
    try {
      const res = await client.api.friends.request.$post({ json: { target_user_id: targetUserId } });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'フレンド申請を送信しました。' });
        // Update search results status locally
        setSearchResults(prev => prev.map(u => u.id === targetUserId ? { ...u, friend_status: 'pending_sent' } : u));
      } else {
        setMessage({ type: 'error', text: data.error || '申請の送信に失敗しました。' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '通信エラーが発生しました。' });
    }
  };

  const handleRespondRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const res = await client.api.friends.request.respond.$post({ json: { request_id: requestId, action } });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: action === 'accept' ? 'フレンド申請を承認しました！' : '申請を拒否しました。' });
        fetchRequests();
        fetchFriends();
      } else {
        setMessage({ type: 'error', text: data.error || '処理に失敗しました。' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '通信エラーが発生しました。' });
    }
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (!window.confirm(`${friendName} さんをフレンド解除しますか？`)) return;
    try {
      const res = await client.api.friends[':friendId'].$delete({ param: { friendId } });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'フレンドを解除しました。' });
        fetchFriends();
      } else {
        setMessage({ type: 'error', text: data.error || '解除に失敗しました。' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '通信エラーが発生しました。' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '0.2rem' }}>
      
      {/* Toast Notification */}
      {message && (
        <div style={{
          padding: '0.8rem 1rem',
          borderRadius: '12px',
          backgroundColor: message.type === 'success' ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 68, 68, 0.12)',
          border: message.type === 'success' ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 68, 68, 0.3)',
          color: message.type === 'success' ? '#00ff88' : '#ff4444',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* Sub Tabs */}
      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.6)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { key: 'list', label: `👥 フレンド (${friends.length})` },
          { key: 'requests', label: `📩 申請 (${requests.length})`, badge: requests.length > 0 },
          { key: 'search', label: '🔍 ユーザー検索' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key as any)}
            style={{
              flex: 1,
              padding: '0.6rem 0.4rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              backgroundColor: subTab === t.key ? '#00ff88' : 'transparent',
              color: subTab === t.key ? '#000' : '#8a8a93',
              position: 'relative'
            }}
          >
            {t.label}
            {t.badge && subTab !== t.key && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '6px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#ff4444',
                boxShadow: '0 0 6px #ff4444'
              }} />
            )}
          </button>
        ))}
      </div>

      {/* --- SubTab: Friends List --- */}
      {subTab === 'list' && (
        <div>
          {friends.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#8a8a93', borderRadius: '16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>👥</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#d1d1d6', marginBottom: '0.4rem' }}>まだフレンドがいません</div>
              <div style={{ fontSize: '0.8rem', color: '#8a8a93', marginBottom: '1.2rem' }}>「ユーザー検索」から仲間を探してフレンド申請を送ってみよう！</div>
              <button
                onClick={() => setSubTab('search')}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                  border: 'none',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                🔍 ユーザーを探す
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {friends.map(f => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.9rem 1.1rem',
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <img
                      src={getUserAvatarSrc(f.avatar_id, f.avatar_image)}
                      alt={f.name}
                      style={{ width: '42px', height: '42px', borderRadius: '50%', border: '1.5px solid rgba(0,255,136,0.3)', objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#ffffff' }}>{f.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#8a8a93', marginTop: '2px' }}>
                        Lv.{f.level || 1} {f.login_id ? `@${f.login_id}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFriend(f.id, f.name)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,68,68,0.25)',
                      backgroundColor: 'rgba(255,68,68,0.08)',
                      color: '#ff6666',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    解除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- SubTab: Requests --- */}
      {subTab === 'requests' && (
        <div>
          {requests.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#8a8a93', borderRadius: '16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>📭</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#d1d1d6' }}>届いているフレンド申請はありません</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {requests.map(req => (
                <div
                  key={req.request_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.9rem 1.1rem',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(0,212,255,0.02) 100%)',
                    border: '1px solid rgba(0, 255, 136, 0.2)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <img
                      src={getUserAvatarSrc(req.sender_avatar_id, req.sender_avatar_image)}
                      alt={req.sender_name}
                      style={{ width: '42px', height: '42px', borderRadius: '50%', border: '1.5px solid #00ff88', objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#ffffff' }}>{req.sender_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#8a8a93', marginTop: '2px' }}>
                        Lv.{req.sender_level || 1} {req.sender_login_id ? `@${req.sender_login_id}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleRespondRequest(req.request_id, 'accept')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                        color: '#000',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleRespondRequest(req.request_id, 'reject')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        color: '#8a8a93',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      拒否
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- SubTab: Search --- */}
      {subTab === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="ユーザー名またはログインIDで検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.2rem',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                color: '#000',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? '検索中...' : '検索'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {searchResults.map(u => (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.9rem 1.1rem',
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <img
                      src={getUserAvatarSrc(u.avatar_id, u.avatar_image)}
                      alt={u.name}
                      style={{ width: '42px', height: '42px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#ffffff' }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#8a8a93', marginTop: '2px' }}>
                        Lv.{u.level || 1} {u.login_id ? `@${u.login_id}` : ''}
                      </div>
                    </div>
                  </div>

                  <div>
                    {u.friend_status === 'friend' && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00ff88', padding: '0.4rem 0.8rem', borderRadius: '8px', backgroundColor: 'rgba(0,255,136,0.1)' }}>
                        ✓ フレンド
                      </span>
                    )}
                    {u.friend_status === 'pending_sent' && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00d4ff', padding: '0.4rem 0.8rem', borderRadius: '8px', backgroundColor: 'rgba(0,212,255,0.1)' }}>
                        申請中
                      </span>
                    )}
                    {u.friend_status === 'pending_received' && (
                      <button
                        onClick={() => setSubTab('requests')}
                        style={{
                          padding: '0.45rem 0.8rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#ffcc00',
                          color: '#000',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        申請が届いています
                      </button>
                    )}
                    {(!u.friend_status || u.friend_status === 'none') && (
                      <button
                        onClick={() => handleSendRequest(u.id)}
                        style={{
                          padding: '0.45rem 0.9rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                          color: '#000',
                          fontSize: '0.78rem',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        ＋ フレンド申請
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
