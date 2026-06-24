import React from 'react';
import { getUserAvatarSrc } from '../pages/Dashboard';

interface HomeHubSectionProps {
  currentUser: {
    uid: string;
    name: string;
    avatar_id: string;
    avatar_image?: string | null;
    level?: number;
    xp?: number;
    current_weight?: number | null;
    target_weight?: number | null;
    target_calories_burned?: number | null;
    target_calories_consumed?: number | null;
    stat_str?: number;
    stat_agi?: number;
    stat_def?: number;
    stat_vit?: number;
  };
  todayMission: any | null;
  onNavigateTab: (tab: 'map' | 'exercise' | 'ai-predict' | 'meal' | 'ranking' | 'chat') => void;
  onStartQuickRun: () => void;
  caloriesBurnedToday: number;
  caloriesConsumedToday: number;
  onExpandMission: () => void;
}

const HomeHubSection: React.FC<HomeHubSectionProps> = ({
  currentUser,
  todayMission,
  onNavigateTab,
  onStartQuickRun,
  caloriesBurnedToday,
  caloriesConsumedToday,
  onExpandMission
}) => {
  const currentWeightVal = currentUser.current_weight || 70;
  const targetWeightVal = currentUser.target_weight || 68;

  // Calorie Targets (fallback to defaults if not set)
  const targetBurn = currentUser.target_calories_burned || 500;
  const targetConsume = currentUser.target_calories_consumed || 2000;

  // Progress Calculations (capped at 1)
  const burnProgress = Math.min(1, caloriesBurnedToday / (targetBurn || 1));
  const consumeProgress = Math.min(1, caloriesConsumedToday / (targetConsume || 1));

  // XP Progress (1 level = 100 * level XP required)
  const currentLevel = currentUser.level || 1;
  const currentXp = currentUser.xp || 0;
  const xpNeeded = currentLevel * 100;
  const xpProgress = Math.min(1, currentXp / xpNeeded);

  // SVG parameters for calorie rings
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffsetBurn = circumference - burnProgress * circumference;
  const strokeDashoffsetConsume = circumference - consumeProgress * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ユーザープロフィール概要 & レベル */}
      <div className="cyber-glass" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <img
          src={getUserAvatarSrc(currentUser.avatar_id, currentUser.avatar_image)}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '2px solid var(--neon-green)',
            boxShadow: '0 0 15px rgba(0, 255, 136, 0.25)',
            objectFit: 'cover'
          }}
          alt="User Avatar"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {currentUser.name}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <span style={{
              background: 'linear-gradient(135deg, #ff007f, #00d4ff)',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '6px',
              color: '#fff'
            }}>
              Lv.{currentLevel}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {currentXp} / {xpNeeded} XP
            </span>
          </div>
          {/* XP Progress Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${xpProgress * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #ff007f, #00d4ff)',
              borderRadius: '3px',
              transition: 'width 0.5s ease-in-out'
            }} />
          </div>
        </div>
      </div>

      {/* 目標カロリーリング (Apple Watch風アクティビティビジュアライザー) */}
      <div className="cyber-glass" style={{ padding: '1.5rem' }}>
        <h4 style={{ margin: '0 0 1.2rem', color: '#fff', fontSize: '0.95rem', fontWeight: 'bold', textAlign: 'left' }}>
          🎯 今日のカロリーバランス
        </h4>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          {/* 消費カロリーリング */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '110px', height: '110px' }}>
              <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="55" cy="55" r={radius} fill="transparent" stroke="rgba(255, 153, 0, 0.1)" strokeWidth="8" />
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="transparent"
                  stroke="url(#burnGrad)"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffsetBurn}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                />
                <defs>
                  <linearGradient id="burnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ff9900" />
                    <stop offset="100%" stopColor="#ff5500" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>消費</span>
                <span style={{ fontSize: '0.95rem', color: '#ffaa00', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>
                  {Math.round(caloriesBurnedToday)}
                </span>
                <span style={{ fontSize: '0.55rem', color: '#666' }}>/ {targetBurn} kcal</span>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ffaa00' }}>アクティブ消費</span>
          </div>

          {/* 摂取カロリーリング */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '110px', height: '110px' }}>
              <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="55" cy="55" r={radius} fill="transparent" stroke="rgba(0, 212, 255, 0.1)" strokeWidth="8" />
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="transparent"
                  stroke="url(#consumeGrad)"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffsetConsume}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                />
                <defs>
                  <linearGradient id="consumeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00d4ff" />
                    <stop offset="100%" stopColor="#0066ff" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>摂取</span>
                <span style={{ fontSize: '0.95rem', color: '#00bfff', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>
                  {Math.round(caloriesConsumedToday)}
                </span>
                <span style={{ fontSize: '0.55rem', color: '#666' }}>/ {targetConsume} kcal</span>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00bfff' }}>食事摂取カロリー</span>
          </div>
        </div>

        {/* カロリーバランス状態テキスト */}
        <div style={{ marginTop: '1.2rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
          カロリー差分: <span style={{ fontWeight: 'bold', color: caloriesConsumedToday > caloriesBurnedToday ? '#00bfff' : '#00ff88' }}>
            {(caloriesConsumedToday - caloriesBurnedToday).toFixed(1)} kcal
          </span> (現在の体重 {currentWeightVal}kg | 目標 {targetWeightVal}kg)
        </div>
      </div>

      {/* デイリーミッションカード */}
      <div className="cyber-glass" style={{ padding: '1.5rem', position: 'relative' }}>
        <h4 style={{ margin: '0 0 0.8rem', color: '#fff', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'left' }}>
          <span>⚔️</span> 本日の防衛・健康ミッション
        </h4>
        {todayMission ? (
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: todayMission.is_completed === 1 ? 'var(--neon-green)' : '#fff' }}>
              {todayMission.title} {todayMission.is_completed === 1 ? ' (達成！)' : ''}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              {todayMission.description}
            </div>
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <span>進捗: {todayMission.current_count} / {todayMission.target_count}</span>
                <span>{Math.round((todayMission.current_count / todayMission.target_count) * 100)}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, (todayMission.current_count / todayMission.target_count) * 100)}%`,
                  height: '100%',
                  backgroundColor: todayMission.is_completed === 1 ? 'var(--neon-green)' : '#ffcc00',
                  borderRadius: '4px',
                  boxShadow: todayMission.is_completed === 1 ? '0 0 10px rgba(0,255,136,0.3)' : 'none',
                  transition: 'width 0.4s ease'
                }} />
              </div>
            </div>

            {todayMission.is_completed === 1 && todayMission.claimed === 0 && (
              <button
                onClick={onExpandMission}
                style={{
                  marginTop: '12px',
                  width: '100%',
                  padding: '8px',
                  background: 'linear-gradient(135deg, var(--neon-green), #00d4ff)',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0,255,136,0.25)',
                  transition: 'transform 0.2s'
                }}
              >
                🎁 ミッション報酬を受け取る（領土要塞化）
              </button>
            )}
            {todayMission.claimed === 1 && (
              <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--neon-green)', fontWeight: 'bold' }}>
                ✅ 本日の報酬は獲得済みです
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '1rem', textAlign: 'center' }}>
            ミッション情報を読み込み中...
          </div>
        )}
      </div>

      {/* クイックアクション一覧 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <button
          onClick={onStartQuickRun}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            background: 'rgba(0, 255, 136, 0.04)',
            border: '1px solid rgba(0, 255, 136, 0.12)',
            padding: '12px 6px',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.08)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.04)'}
        >
          <span style={{ fontSize: '1.5rem' }}>🏃‍♂️</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--neon-green)' }}>領土ラン開始</span>
        </button>

        <button
          onClick={() => onNavigateTab('exercise')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            background: 'rgba(255, 0, 127, 0.04)',
            border: '1px solid rgba(255, 0, 127, 0.12)',
            padding: '12px 6px',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 0, 127, 0.08)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255, 0, 127, 0.04)'}
        >
          <span style={{ fontSize: '1.5rem' }}>💪</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--neon-pink)' }}>筋トレ記録</span>
        </button>

        <button
          onClick={() => onNavigateTab('meal')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            background: 'rgba(0, 212, 255, 0.04)',
            border: '1px solid rgba(0, 212, 255, 0.12)',
            padding: '12px 6px',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.08)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.04)'}
        >
          <span style={{ fontSize: '1.5rem' }}>🥗</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--neon-blue)' }}>食事画像解析</span>
        </button>
      </div>
    </div>
  );
};

export default HomeHubSection;
