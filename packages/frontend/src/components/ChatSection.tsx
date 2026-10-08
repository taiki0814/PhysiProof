import React, { useEffect, useState, useRef } from 'react';
import client from '../lib/hc';
import { getUserAvatarSrc } from '../pages/Dashboard';
import AppIcon from './AppIcon';

interface ChatSectionProps {
  keyboardOffset?: number;
  triggerAchievementUnlock: (achievements: any[]) => void;
}

const ChatSection: React.FC<ChatSectionProps> = ({
  keyboardOffset = 0,
  triggerAchievementUnlock
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<{ name: string; avatar_id: string; avatar_image?: string | null } | null>(null);

  useEffect(() => {
    if (keyboardOffset <= 0) return;
    const lockScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
      }
    };
    window.addEventListener('scroll', lockScroll);
    return () => window.removeEventListener('scroll', lockScroll);
  }, [keyboardOffset]);

  useEffect(() => {
    const userData = localStorage.getItem('physiproof_user');
    if (userData) {
      const parsed = JSON.parse(userData);
      setUser({
        name: parsed.name,
        avatar_id: parsed.avatar_id || 'default',
        avatar_image: parsed.avatar_image || null
      });
    }
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await client.api.chat.history.$get();
      if (res.ok) {
        const data = await res.json();
        setMessages((data as any).messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending) return;

    const userMessageText = inputText;
    setInputText('');
    setSending(true);

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender: 'user' as const,
      message: userMessageText,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await client.api.chat.$post({
        json: { message: userMessageText }
      });
      if (res.ok) {
        const data = await res.json();
        if ((data as any).newAchievements) triggerAchievementUnlock((data as any).newAchievements);
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, (data as any).userMessage, (data as any).aiMessage];
        });
      } else {
        const errData = await res.json();
        alert(`送信エラー: ${(errData as any).error || 'AI応答の取得に失敗しました'}`);
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      }
    } catch (err) {
      console.error('Send message error:', err);
      alert('通信エラーが発生しました。');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const navHeight = 64;
  const headerHeight = 56;
  const chatBottom = navHeight + keyboardOffset;
  
  const chatContainerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: `${headerHeight}px`,
        bottom: `${chatBottom}px`,
        left: 0,
        right: 0,
        height: `calc(100dvh - ${headerHeight}px - ${chatBottom}px)`,
        zIndex: 99,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        borderRadius: 0,
        border: 'none',
        background: '#030303'
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        position: 'relative',
        height: '600px'
      };

  return (
    <div className="pp-content-card pp-chat-container" style={chatContainerStyle}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0.5rem 0.25rem',
        marginBottom: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        WebkitOverflowScrolling: 'touch',
      }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '0.8rem' }}>
            <div style={{ color: '#00ff88' }}><AppIcon name="loading" size={24} className="pp-icon-spin" /></div>
            <div style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: 'bold' }}>AIコーチが履歴を読み込み中...</div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '1rem', color: '#8a8a93', padding: '1.5rem', textAlign: 'center' }}>
            <div><AppIcon name="chat" size={32} /></div>
            <div>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold', color: '#00ff88', fontSize: '0.95rem' }}>専属AIコーチ</p>
              <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', lineHeight: '1.6', color: '#8a8a93' }}>
                トレーニング・食事・体調なんでも相談できます
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
                {[
                  '今日の筋トレメニューは？',
                  'タンパク質が多い食事を教えて',
                  'スクワット100回の消費カロリーは？',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInputText(q)}
                    style={{
                      backgroundColor: 'rgba(0,255,136,0.06)',
                      border: '1px solid rgba(0,255,136,0.15)',
                      color: '#00ff88',
                      borderRadius: '10px',
                      padding: '0.5rem 0.8rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    <AppIcon name="chat" /> {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isAI = msg.sender === 'ai';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: isAI ? 'row' : 'row-reverse',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  maxWidth: '85%',
                  alignSelf: isAI ? 'flex-start' : 'flex-end'
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  {isAI ? (
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0, 255, 136, 0.15)',
                      border: '2px solid #00ff88',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      boxShadow: '0 0 8px rgba(0, 255, 136, 0.3)'
                    }}>
                      <AppIcon name="bot" size={24} />
                    </div>
                  ) : (
                    <img
                      src={getUserAvatarSrc(user?.avatar_id, user?.avatar_image)}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: '2px solid #00d4ff',
                        objectFit: 'cover',
                        boxShadow: '0 0 8px rgba(0, 212, 255, 0.3)'
                      }}
                      alt="user avatar"
                    />
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAI ? 'flex-start' : 'flex-end', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.65rem', color: '#666', fontWeight: 'bold', marginBottom: '2px', marginLeft: isAI ? '4px' : '0', marginRight: isAI ? '0' : '4px' }}>
                    {isAI ? 'AIコーチ' : (user?.name || 'ユーザー')}
                  </span>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: isAI ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                      backgroundColor: isAI ? 'rgba(0, 255, 136, 0.08)' : 'rgba(0, 212, 255, 0.08)',
                      border: isAI ? '1px solid rgba(0, 255, 136, 0.2)' : '1px solid rgba(0, 212, 255, 0.2)',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      boxShadow: isAI ? '0 4px 15px rgba(0, 255, 136, 0.03)' : '0 4px 15px rgba(0, 212, 255, 0.03)'
                    }}
                  >
                    {msg.message}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {sending && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: '0.6rem',
              maxWidth: '85%',
              alignSelf: 'flex-start'
            }}
          >
            <div style={{ flexShrink: 0 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 255, 136, 0.15)',
                border: '2px solid #00ff88',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                boxShadow: '0 0 8px rgba(0, 255, 136, 0.3)',
                animation: 'pulse 1s infinite'
              }}>
                <AppIcon name="bot" size={24} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span style={{ fontSize: '0.65rem', color: '#666', fontWeight: 'bold', marginBottom: '2px', marginLeft: '4px' }}>
                AIコーチ
              </span>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '16px 16px 16px 4px',
                  backgroundColor: 'rgba(0, 255, 136, 0.04)',
                  border: '1px solid rgba(0, 255, 136, 0.1)',
                  color: '#8a8a93',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <span>思考中...</span>
                <span className="dot-pulse-animation"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSendMessage}
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexShrink: 0,
          paddingTop: '0.5rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="AIコーチに質問する..."
          style={{
            flex: 1,
            backgroundColor: '#0c0c0c',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '0.8rem 1rem',
            color: '#fff',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          aria-label="メッセージを送信"
          title="メッセージを送信"
          style={{
            backgroundColor: inputText.trim() ? '#00ff88' : 'rgba(255,255,255,0.02)',
            color: '#000',
            border: 'none',
            borderRadius: '12px',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() ? 'pointer' : 'not-allowed',
            fontSize: '1.2rem',
            transition: 'all 0.2s',
            fontWeight: 'bold'
          }}
        >
          <AppIcon name={sending ? 'loading' : 'send'} size={20} className={sending ? 'pp-icon-spin' : undefined} />
        </button>
      </form>
    </div>
  );
};

export default ChatSection;
