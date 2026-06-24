import React, { useEffect, useState, useRef } from 'react';
import client from '../lib/hc';

interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
}

interface NotificationsCenterProps {
  currentUser: { uid: string } | null;
}

const NotificationsCenter: React.FC<NotificationsCenterProps> = ({ currentUser }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => n.is_read === 0).length;

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await client.api.notifications.$get();
      if (res.ok) {
        const data = await res.json();
        setNotifications((data as any).notifications || []);
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Fetch notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await client.api.notifications[':id'].read.$post({
        param: { id }
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
        );
      }
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => n.is_read === 0);
    if (unread.length === 0) return;
    
    // Process sequentially (since we don't have bulk read API, but doing them in parallel is fast)
    try {
      await Promise.all(unread.map(n => 
        client.api.notifications[':id'].read.$post({ param: { id: n.id } })
      ));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* ベルボタン */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#fff',
          fontSize: '1.05rem',
          position: 'relative',
          transition: 'all 0.2s',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            backgroundColor: '#ff3b30',
            color: '#fff',
            borderRadius: '50%',
            width: '16px',
            height: '16px',
            fontSize: '9px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 8px rgba(255,59,48,0.5)',
            border: '2px solid #030303'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '44px',
          right: 0,
          width: '320px',
          maxHeight: '400px',
          overflowY: 'auto',
          backgroundColor: 'rgba(12, 12, 12, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8), 0 0 15px rgba(0,212,255,0.05)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          textAlign: 'left'
        }}>
          {/* ヘッダー */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#fff' }}>戦況・レベルアップ通知</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--neon-blue)',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                すべて既読にする
              </button>
            )}
          </div>

          {/* 通知リスト */}
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: '320px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#666', fontSize: '0.78rem' }}>
                通知はありません
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = n.is_read === 0;
                return (
                  <div
                    key={n.id}
                    onClick={() => isUnread && handleMarkAsRead(n.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      backgroundColor: isUnread ? 'rgba(0, 212, 255, 0.03)' : 'transparent',
                      cursor: isUnread ? 'pointer' : 'default',
                      transition: 'background 0.2s',
                      position: 'relative'
                    }}
                  >
                    {isUnread && (
                      <span style={{
                        position: 'absolute',
                        top: '16px',
                        left: '6px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--neon-blue)',
                        boxShadow: '0 0 6px var(--neon-blue)'
                      }} />
                    )}
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isUnread ? '#fff' : '#8a8a93', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: isUnread ? '#d1d1d6' : '#666', marginTop: '4px', lineHeight: '1.4' }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#444', marginTop: '6px', fontWeight: 'bold' }}>
                      {n.created_at ? new Date(n.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsCenter;
