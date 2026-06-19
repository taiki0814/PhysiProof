import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pushupMeasurementSchema, predictionRequestSchema, mealAnalysisRequestSchema, type PushupMeasurement, type PredictionRequest, type MealAnalysisResponse, ACHIEVEMENT_DEFINITIONS } from '@my-app/shared';
import { useNavigate } from 'react-router-dom';
import client from '../lib/hc';
import { area } from '@turf/area';
import { polygon, lineString, featureCollection } from '@turf/helpers';
import buffer from '@turf/buffer';
import convex from '@turf/convex';

export const getUserAvatarSrc = (avatarId: string | null | undefined, avatarImage: string | null | undefined) => {
  if (avatarId === 'custom' && avatarImage) {
    return avatarImage;
  }
  if (avatarId && avatarId !== 'default' && avatarId !== 'custom') {
    return `/avatars/${avatarId}.png`;
  }
  return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzU1NSI+PHBhdGggZD0iTTEyIDJDMi4xMiAyIDEwIDYuNDggMTAgMTJzNC40OCAxMCAxMCAxMCAxMCAtNC40OCAxMCAtMTBTMTcuNTIgMiAyMiAyem0wIDNjMS42NiAwIDMgMS4zNCAzIDNzLTEuMzQgMyAtMyAzIC0zIC0xLjM0IC0zIC0zIDEuMzQgLTMgMyAtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHMyLjk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==';
};

type TabType = 'map' | 'exercise' | 'ai-predict' | 'meal' | 'ranking' | 'chat';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [isChatInputFocused, setIsChatInputFocused] = useState<boolean>(false);
  const [rankingPeriod, setRankingPeriod] = useState<'morning' | 'afternoon' | 'night' | 'all'>('all');
  const [rankingDuration, setRankingDuration] = useState<'daily' | 'weekly' | 'yearly' | 'all'>('all');
  const [ranking, setRanking] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ 
    uid: string; 
    name: string; 
    avatar_id: string; 
    avatar_image?: string | null; 
    login_id?: string; 
  } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('physiproof_user');
    if (!userData) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(userData);
    setCurrentUser({ 
      uid: parsed.userId, 
      name: parsed.name, 
      avatar_id: parsed.avatar_id || 'default',
      avatar_image: parsed.avatar_image || null,
      login_id: parsed.login_id || ''
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem('physiproof_test_uid', currentUser.uid);
    fetchRanking();
  }, [currentUser, rankingPeriod, rankingDuration]);

  const fetchRanking = () => {
    client.api.ranking.$get({ query: { period: rankingPeriod, duration: rankingDuration } })
      .then(res => res.json())
      .then(data => setRanking((data as any).ranking))
      .catch(console.error);
  };

  const handleLogout = () => {
    localStorage.removeItem('physiproof_user');
    localStorage.removeItem('physiproof_test_uid');
    navigate('/login');
  };

  const handleSaveProfile = async (
    newName: string, 
    newAvatar: string, 
    newAvatarImage: string | null, 
    newLoginId?: string, 
    newPassword?: string
  ) => {
    try {
      const payload: any = { 
        name: newName, 
        avatar_id: newAvatar,
        avatar_image: newAvatarImage
      };
      if (newLoginId) payload.login_id = newLoginId;
      if (newPassword) payload.password = newPassword;

      const res = await client.api.users.me.$put({ json: payload });
      const result = await res.json();
      
      if (res.ok && 'success' in result && result.success) {
        const updated = { 
          uid: currentUser!.uid, 
          name: newName, 
          avatar_id: newAvatar,
          avatar_image: newAvatarImage,
          login_id: newLoginId || currentUser?.login_id
        };
        setCurrentUser(updated);
        const oldUser = JSON.parse(localStorage.getItem('physiproof_user') || '{}');
        localStorage.setItem('physiproof_user', JSON.stringify({ 
          ...oldUser, 
          name: newName, 
          avatar_id: newAvatar,
          avatar_image: newAvatarImage,
          login_id: newLoginId || oldUser.login_id
        }));
        setShowProfileModal(false);
        fetchRanking();
      } else {
        alert('プロフィールの更新に失敗しました: ' + ((result as any).error || '不明なエラー'));
      }
    } catch (e) {
      console.error(e);
      alert('エラーが発生しました');
    }
  };

  if (!currentUser) return null;

  return (
    <div style={{ fontFamily: "'Inter', 'Outfit', sans-serif", backgroundColor: '#030303', color: '#fff', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes pulseGlow {
          0% { fill-opacity: 0.3; stroke-width: 2.5; filter: drop-shadow(0 0 4px rgba(0,255,136,0.6)); }
          50% { fill-opacity: 0.45; stroke-width: 4; filter: drop-shadow(0 0 12px rgba(0,255,136,0.9)); }
          100% { fill-opacity: 0.3; stroke-width: 2.5; filter: drop-shadow(0 0 4px rgba(0,255,136,0.6)); }
        }
        @keyframes pulseGlowOther {
          0% { fill-opacity: 0.15; stroke-width: 1.5; filter: drop-shadow(0 0 3px rgba(255,0,127,0.4)); }
          50% { fill-opacity: 0.3; stroke-width: 2.5; filter: drop-shadow(0 0 8px rgba(255,0,127,0.7)); }
          100% { fill-opacity: 0.15; stroke-width: 1.5; filter: drop-shadow(0 0 3px rgba(255,0,127,0.4)); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes dotPulse {
          0% { content: ''; }
          33% { content: '.'; }
          66% { content: '..'; }
          100% { content: '...'; }
        }
        .dot-pulse-animation::after {
          content: '';
          animation: dotPulse 1.5s infinite steps(4);
        }
        .own-territory { animation: pulseGlow 4s infinite ease-in-out; transition: all 0.3s ease; }
        .other-territory { animation: pulseGlowOther 5s infinite ease-in-out; transition: all 0.3s ease; }
        .own-territory:hover { fill-opacity: 0.55 !important; stroke-width: 4.5 !important; cursor: pointer; }
        .other-territory:hover { fill-opacity: 0.4 !important; stroke-width: 3 !important; cursor: pointer; }

        /* Custom Scrollbar for premium vibe */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #333; }

        /* --- Mobile-first responsive styles --- */
        .pp-username { display: none; }
        .pp-bottom-nav {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000;
          background: rgba(8, 8, 8, 0.88);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
          display: flex; justify-content: space-around; align-items: center;
          box-shadow: 0 -10px 30px rgba(0,0,0,0.6);
          height: 64px;
          box-sizing: border-box;
        }
        .pp-bottom-nav button {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          background: none; border: none; cursor: pointer; padding: 4px 10px;
          border-radius: 14px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); min-width: 56px;
          height: 48px;
          -webkit-tap-highlight-color: transparent;
        }
        .pp-bottom-nav button .pp-nav-icon { font-size: 1.3rem; line-height: 1; filter: grayscale(0.2) opacity(0.7); transition: all 0.2s; }
        .pp-bottom-nav button .pp-nav-label { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.04em; transition: all 0.2s; }
        .pp-bottom-nav button.pp-active { background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.15); }
        .pp-bottom-nav button.pp-active .pp-nav-icon { filter: grayscale(0) opacity(1); transform: scale(1.1); }
        .pp-bottom-nav button.pp-active .pp-nav-label { color: #00ff88; text-shadow: 0 0 10px rgba(0,255,136,0.3); }
        .pp-bottom-nav button:not(.pp-active) .pp-nav-label { color: #666; }

        .pp-top-bar {
          background: rgba(5, 5, 5, 0.85); border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 0.6rem 1.2rem; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          height: 56px;
          box-sizing: border-box;
          flex-shrink: 0;
        }
        .pp-main {
          flex: 1;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 1rem 1rem 80px; /* space for bottom nav */
          width: 100%;
          box-sizing: border-box;
        }
        .pp-section-header { padding: 0.2rem 1rem 0.6rem; text-align: center; }
        .pp-section-header h2 { font-size: 1.15rem; font-weight: 800; margin: 0 0 0.2rem; letter-spacing: 0.05em; text-transform: uppercase; }
        .pp-content-card {
          background: rgba(15, 15, 15, 0.6);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 1.2rem;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }

        /* Desktop overrides */
        @media (min-width: 768px) {
          .pp-username { display: inline !important; }
          .pp-bottom-nav { display: none; }
          .pp-desktop-tabs { display: flex !important; }
          .pp-main { padding: 2rem 2rem 2rem; max-width: 1200px; margin: 0 auto; overflow-y: visible; }
          .pp-section-header h2 { font-size: 1.6rem; }
          .pp-content-card { padding: 2rem; border-radius: 28px; }
          .pp-exercise-grid { grid-template-columns: 1fr 1fr !important; }
          .pp-predict-grid { grid-template-columns: 1fr 1fr !important; }
          .pp-meal-layout { flex-direction: row !important; }
          .pp-meal-upload { flex: 0 0 350px !important; width: auto !important; }
          .pp-meal-result { flex: 1 !important; }
          .pp-pfc-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }

        /* Chat Container Layout Overrides */
        .pp-chat-container {
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          padding: 1rem;
          position: relative;
        }
        @media (max-width: 767px) {
          .pp-chat-container {
            position: fixed;
            top: 56px;
            bottom: calc(64px + env(safe-area-inset-bottom, 0px));
            left: 0;
            right: 0;
            height: calc(100dvh - 120px - env(safe-area-inset-bottom, 0px));
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
            border-top: 1px solid rgba(255,255,255,0.06) !important;
            background: rgba(10, 10, 10, 0.95) !important;
            z-index: 99;
          }
          .pp-chat-container.keyboard-open {
            bottom: 20px;
            height: calc(100dvh - 76px);
          }
        }
        @media (min-width: 768px) {
          .pp-chat-container {
            height: calc(100dvh - 240px) !important;
            max-height: 780px !important;
            max-width: 800px !important;
            margin: 0 auto !important;
            border-radius: 28px !important;
          }
        }
      `}</style>

      {/* --- Compact Top Bar --- */}
      <div className="pp-top-bar">
        <h1 style={{ fontSize: '1.25rem', fontWeight: '900', margin: 0, background: 'linear-gradient(45deg, #00ff88, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
          PhysiProof
        </h1>

        {/* Desktop-only tabs */}
        <div className="pp-desktop-tabs" style={{ display: 'none', gap: '0.5rem' }}>
          <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} label="マップ" icon="🗺️" />
          <TabButton active={activeTab === 'exercise'} onClick={() => setActiveTab('exercise')} label="記録" icon="💪" />
          <TabButton active={activeTab === 'ai-predict'} onClick={() => setActiveTab('ai-predict')} label="予測" icon="✨" />
          <TabButton active={activeTab === 'meal'} onClick={() => setActiveTab('meal')} label="食事" icon="🥗" />
          <TabButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} label="ランク" icon="🏆" />
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} label="コーチ" icon="💬" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <button
            onClick={() => setShowProfileModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
          >
            <img
              src={getUserAvatarSrc(currentUser.avatar_id, currentUser.avatar_image)}
              style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #00ff88', objectFit: 'cover', boxShadow: '0 0 10px rgba(0,255,136,0.3)' }}
              alt="avatar"
            />
            <span className="pp-username" style={{ fontSize: '0.8rem', color: '#00ff88', fontWeight: 'bold' }}>{currentUser.name}</span>
          </button>
          <button
            onClick={handleLogout}
            style={{ backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', padding: '4px 10px', borderRadius: '8px', transition: '0.2s', WebkitTapHighlightColor: 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,68,68,0.2)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,68,68,0.1)'}
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <main className="pp-main">
        <div className="pp-section-header">
          <h2 style={{ background: 'linear-gradient(90deg, #fff, #888)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {activeTab === 'map' && '支配領域'}
            {activeTab === 'exercise' && '運動証明'}
            {activeTab === 'ai-predict' && '未来予測'}
            {activeTab === 'meal' && '食事解析'}
            {activeTab === 'ranking' && 'グローバル勢力'}
            {activeTab === 'chat' && 'AIコーチチャット'}
          </h2>
          <div style={{ width: '28px', height: '3px', background: 'linear-gradient(90deg, #00ff88, #00d4ff)', margin: '0.2rem auto 0', borderRadius: '2px' }}></div>
        </div>

        {activeTab === 'chat' ? (
          <ChatSection onFocusChange={setIsChatInputFocused} />
        ) : (
          <div className="pp-content-card">
            {activeTab === 'map' && <MapView />}
            {activeTab === 'exercise' && <ExerciseSection uid={currentUser.uid} />}
            {activeTab === 'ai-predict' && <AIPredictSection />}
            {activeTab === 'meal' && <MealAnalysisSection />}
            {activeTab === 'ranking' && <RankingView ranking={ranking} period={rankingPeriod} setPeriod={setRankingPeriod} duration={rankingDuration} setDuration={setRankingDuration} />}
          </div>
        )}
      </main>

      {/* --- Bottom Navigation (Mobile) --- */}
      <nav className="pp-bottom-nav" style={{ display: isChatInputFocused ? 'none' : undefined }}>
        {[
          { key: 'map' as TabType, icon: '🗺️', label: 'マップ' },
          { key: 'exercise' as TabType, icon: '💪', label: '記録' },
          { key: 'ai-predict' as TabType, icon: '✨', label: '予測' },
          { key: 'meal' as TabType, icon: '🥗', label: '食事' },
          { key: 'ranking' as TabType, icon: '🏆', label: 'ランク' },
          { key: 'chat' as TabType, icon: '💬', label: 'コーチ' },
        ].map(tab => (
          <button key={tab.key} className={activeTab === tab.key ? 'pp-active' : ''} onClick={() => setActiveTab(tab.key)}>
            <span className="pp-nav-icon">{tab.icon}</span>
            <span className="pp-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {showProfileModal && (
        <ProfileModal
          currentUser={currentUser}
          onClose={() => setShowProfileModal(false)}
          onSave={handleSaveProfile}
        />
      )}
    </div>
  );
};

// --- Sub-Components ---

const TabButton = ({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: string }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '10px',
    backgroundColor: active ? '#00ff88' : '#111', color: active ? '#000' : '#888',
    border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s', fontSize: '0.85rem'
  }}>
    <span>{icon}</span> {label}
  </button>
);

const getTimePeriod = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  return 'night';
};

const getDistanceMeters = (p1: [number, number], p2: [number, number]): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = (p2[0] - p1[0]) * Math.PI / 180;
  const dLng = (p2[1] - p1[1]) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const MapView = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [currentArea, setCurrentArea] = useState<number>(0);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [routeLayer, setRouteLayer] = useState<any>(null);
  const [markerLayer, setMarkerLayer] = useState<any>(null);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [territories, setTerritories] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');
  const [isFollowing, setIsFollowing] = useState(false); // UI追尾状態
  const [justClaimedId, setJustClaimedId] = useState<string | null>(null); // 新規領域のフラッシュ用
  // 現在地への自動追従フラグ（走行中のみ自動追従、手動スクロール時は停止）
  const autoFollowRef = React.useRef<boolean>(false);
  const currentPosRef = React.useRef<[number, number] | null>(null);
  const hasSetInitialViewRef = React.useRef<boolean>(false); // 初回位置セット済みか

  const fetchTerritories = async () => {
    try {
      const res = await client.api.territories.$get();
      if (res.ok) {
        const data = await res.json();
        setTerritories((data as any).territories || []);
      }
    } catch (e) {
      console.error('Failed to fetch territories:', e);
    }
  };

  useEffect(() => {
    fetchTerritories();
  }, []);

  useEffect(() => {
    // Leaflet の動的読み込み
    if (!(window as any).L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.body.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      const L = (window as any).L;
      if (!L) return;

      const mapContainer = document.getElementById('map-container');
      if (mapContainer && (mapContainer as any)._leaflet_id) {
        return;
      }

      const map = L.map('map-container').setView([35.7126, 139.7619], 15);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }).addTo(map);

      setMapInstance(map);
    }
  }, []);

  useEffect(() => {
    if (!mapInstance) return;
    const L = (window as any).L;
    if (!L) return;

    const territoryLayers: any[] = [];
    const currentUid = localStorage.getItem('physiproof_test_uid') || '';

    // 表示モードが'mine'の場合は自分の領域のみに絞り込む
    const filteredTerritories = territories.filter(t => {
      if (viewMode === 'mine') {
        return t.user_id === currentUid;
      }
      return true;
    });

    filteredTerritories.forEach((t) => {
      try {
        const coords: [number, number][] = JSON.parse(t.area_polygon);
        if (!Array.isArray(coords) || coords.length < 2) return;

        const isOwn = t.user_id === currentUid;
        const isJustClaimed = t.id === justClaimedId;
        const fortificationStars = '🛡️'.repeat(Math.max(1, Math.min(5, t.fortification_level || 1)));

        const options = isOwn ? {
          color: '#00ff88',
          fillColor: '#00ff88',
          fillOpacity: 0.35,
          weight: 3,
          className: isJustClaimed ? 'own-territory just-claimed' : 'own-territory'
        } : {
          color: '#ff007f',
          fillColor: '#ff007f',
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '5, 5',
          className: 'other-territory'
        };

        // 閉じたポリゴンとして描画する座標を構築
        let displayCoords = [...coords];
        if (displayCoords.length >= 3) {
          const first = displayCoords[0];
          const last = displayCoords[displayCoords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            displayCoords.push(first);
          }
        }

        const polyLayer = L.polygon(displayCoords, options)
          .addTo(mapInstance)
          .bindPopup(`
            <div style="color: #fff; background: rgba(5,5,5,0.95); font-family: sans-serif; font-size: 0.82rem; padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 0 15px rgba(0,0,0,0.5); min-width: 160px;">
              <strong style="font-size: 0.95rem; color: ${isOwn ? '#00ff88' : '#ff007f'}; letter-spacing: 0.04em; display: block; margin-bottom: 6px;">
                ${isOwn ? '🟢 マイエリア' : '🔴 ライバルのエリア'}
              </strong>
              <div style="height: 1px; background: rgba(255,255,255,0.08); margin-bottom: 8px;"></div>
              <strong>所有者:</strong> ${t.user_name || '不明'}<br/>
              <strong>面積:</strong> ${(t.area_sqm || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} ㎡<br/>
              <strong>占領日時:</strong> ${new Date(t.captured_at).toLocaleString()}<br/>
              <strong>防衛レベル:</strong> <span style="color: #ffcc00">${fortificationStars}</span>
            </div>
          `);

        territoryLayers.push(polyLayer);
      } catch (e) {
        console.error('Error parsing territory coordinates:', e);
      }
    });

    return () => {
      territoryLayers.forEach((layer) => {
        mapInstance.removeLayer(layer);
      });
    };
  }, [territories, mapInstance, viewMode]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentPos([latitude, longitude]);

        if (isTracking) {
          setRoute(prev => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (last[0] === latitude && last[1] === longitude) return prev;
            }
            return [...prev, [latitude, longitude]];
          });
        }
      },
      (err) => console.error('GPS Error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    setWatchId(id);

    return () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
    };
  }, [isTracking]);

  useEffect(() => {
    const handleOrientation = (e: any) => {
      const compass = e.webkitCompassHeading || (e.alpha ? 360 - e.alpha : null);
      if (compass !== null) setHeading(compass);
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // 現在地参照の更新
  useEffect(() => {
    currentPosRef.current = currentPos;
  }, [currentPos]);

  // 走行開始時に自動追従を有効化
  useEffect(() => {
    if (isTracking) {
      autoFollowRef.current = true;
      setIsFollowing(true);
    } else {
      autoFollowRef.current = false;
      setIsFollowing(false);
    }
  }, [isTracking]);

  // マップのドラッグ/スクロール時に自動追従を停止するリスナーを設定
  useEffect(() => {
    if (!mapInstance) return;
    const stopFollow = (e: any) => {
      // ユーザーの手動ドラッグ、または手動ズーム操作（originalEventがある場合）のみ自動追従を解除
      if (e.type === 'dragstart' || (e.type === 'zoomstart' && e.originalEvent)) {
        autoFollowRef.current = false;
        setIsFollowing(false);
      }
    };
    mapInstance.on('dragstart', stopFollow);
    mapInstance.on('zoomstart', stopFollow);
    return () => {
      mapInstance.off('dragstart', stopFollow);
      mapInstance.off('zoomstart', stopFollow);
    };
  }, [mapInstance]);

  const goToCurrentLocation = () => {
    if (mapInstance && currentPosRef.current) {
      mapInstance.setView(currentPosRef.current, 17);
    }
  };

  const toggleFollow = () => {
    const newState = !autoFollowRef.current;
    autoFollowRef.current = newState;
    setIsFollowing(newState);
    // ONにした瞬間に現在地へ移動
    if (newState) {
      goToCurrentLocation();
    }
  };

  // 1. マーカーの位置と向きの更新 (headingとcurrentPosに依存)
  useEffect(() => {
    if (!mapInstance || !currentPos) return;
    const L = (window as any).L;
    if (!L) return;

    const arrowHtml = `
      <div style="position: relative; width: 24px; height: 24px;">
        <div style="
          position: absolute; top: 50%; left: 50%; 
          width: 14px; height: 14px; 
          background: #00d4ff; border: 2px solid #fff; 
          border-radius: 50%; 
          transform: translate(-50%, -50%);
          box-shadow: 0 0 10px rgba(0,212,255,0.6);
          z-index: 2;
        "></div>
        ${heading !== null ? `
          <div style="
            position: absolute; top: 50%; left: 50%; 
            width: 0; height: 0; 
            border-left: 8px solid transparent; 
            border-right: 8px solid transparent; 
            border-bottom: 12px solid rgba(0, 212, 255, 0.7); 
            transform: translate(-50%, -100%) rotate(${heading}deg);
            transform-origin: 50% 100%;
            z-index: 1;
          "></div>
        ` : ''}
      </div>
    `;
    const icon = L.divIcon({
      className: 'custom-location-icon',
      html: arrowHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (markerLayer) {
      markerLayer.setLatLng(currentPos);
      markerLayer.setIcon(icon);
    } else {
      const newMarker = L.marker(currentPos, { icon }).addTo(mapInstance).bindPopup("現在地");
      setMarkerLayer(newMarker);
    }
  }, [currentPos, heading, mapInstance]);

  // 2. マップのカメラ追尾制御 (currentPosにのみ依存し、headingの微細な変化でカメラが動かないようにする)
  useEffect(() => {
    if (!mapInstance || !currentPos) return;

    // 初回のみ現在地へ移動（1度だけ）
    if (!hasSetInitialViewRef.current) {
      hasSetInitialViewRef.current = true;
      mapInstance.setView(currentPos, 15);
    }

    // 自動追従が有効な場合のみ追従
    if (autoFollowRef.current) {
      mapInstance.setView(currentPos, mapInstance.getZoom());
    }
  }, [currentPos, mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;
    const L = (window as any).L;

    if (routeLayer) {
      mapInstance.removeLayer(routeLayer);
    }

    if (route.length > 0) {
      const newLayer = L.polyline(route, {
        color: '#00ff88',
        weight: 15,
        opacity: 0.6,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(mapInstance);

      setRouteLayer(newLayer);
    }
  }, [route, mapInstance]);

  useEffect(() => {
    if (route.length > 2) {
      try {
        const coordinates = [...route.map(pos => [pos[1], pos[0]]), [route[0][1], route[0][0]]];
        const poly = polygon([coordinates]);
        setCurrentArea(area(poly));
      } catch (e) {
      }
    } else {
      setCurrentArea(0);
    }
  }, [route]);

  const snapRouteToRoads = async (rawRoute: [number, number][]): Promise<[number, number][]> => {
    if (rawRoute.length < 2) return rawRoute;

    let sampledRoute = rawRoute;
    if (rawRoute.length > 100) {
      const step = Math.ceil(rawRoute.length / 100);
      sampledRoute = rawRoute.filter((_, idx) => idx % step === 0);
      if (sampledRoute[sampledRoute.length - 1] !== rawRoute[rawRoute.length - 1]) {
        sampledRoute.push(rawRoute[rawRoute.length - 1]);
      }
    }

    const coordsParam = sampledRoute.map(pos => `${pos[1]},${pos[0]}`).join(';');
    const url = `https://router.project-osrm.org/match/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OSRM Match API failed with status ${response.status}`);
      }
      const data = await response.json();
      if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
        const matchedCoords = data.matchings[0].geometry.coordinates.map(
          (c: any) => [c[1], c[0]]
        );
        return matchedCoords;
      } else {
        return rawRoute;
      }
    } catch (e) {
      console.error('Failed to snap route to roads:', e);
      return rawRoute;
    }
  };

  const toggleTracking = async () => {
    if (isTracking) {
      setIsSaving(true);
      setIsTracking(false);
      if (route.length >= 2) {
        try {
          const snappedRoute = await snapRouteToRoads(route);

          let calculatedArea = 0;
          let finalCoords: [number, number][] = [];
          let isLoopDetected = false;

          // 1. ループ判定：始点と終点の距離が25メートル未満かつ、スナップ後ルートが3点以上ある場合
          if (snappedRoute.length >= 3) {
            const start = snappedRoute[0];
            const end = snappedRoute[snappedRoute.length - 1];
            const distMeters = getDistanceMeters(start, end);
            
            if (distMeters < 25) {
              try {
                const turfPolyCoords = snappedRoute.map(([lat, lng]) => [lng, lat] as [number, number]);
                const first = turfPolyCoords[0];
                const last = turfPolyCoords[turfPolyCoords.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                  turfPolyCoords.push(first);
                }
                const poly = polygon([turfPolyCoords]);
                calculatedArea = area(poly);
                
                // 面積が極小でなければクローズドポリゴンとする
                if (calculatedArea > 0.1) {
                  finalCoords = snappedRoute;
                  isLoopDetected = true;
                }
              } catch (e) {
                console.error('Failed to calculate closed polygon area:', e);
              }
            }
          }

          // 2. ループしていない、またはポリゴン作成に失敗した場合はバッファ領域（通った道のみ）を生成
          if (!isLoopDetected || finalCoords.length === 0) {
            try {
              const lineCoords = snappedRoute.map(([lat, lng]) => [lng, lat] as [number, number]);
              const line = lineString(lineCoords);
              // 通った道の幅として、半径 6メートル (道幅 12メートル相当) のバッファを生成
              const buffered = buffer(line, 6, { units: 'meters' });
              
              if (buffered && buffered.geometry) {
                calculatedArea = area(buffered);
                
                if (buffered.geometry.type === 'Polygon') {
                  finalCoords = buffered.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
                } else if (buffered.geometry.type === 'MultiPolygon') {
                  const parts = buffered.geometry.coordinates;
                  let maxPartArea = 0;
                  let maxPartIndex = 0;
                  for (let i = 0; i < parts.length; i++) {
                    try {
                      const partPoly = polygon(parts[i]);
                      const partArea = area(partPoly);
                      if (partArea > maxPartArea) {
                        maxPartArea = partArea;
                        maxPartIndex = i;
                      }
                    } catch {
                      // skip
                    }
                  }
                  finalCoords = parts[maxPartIndex][0].map(([lng, lat]) => [lat, lng] as [number, number]);
                }
              }
            } catch (e) {
              console.error('Failed to generate buffered path area:', e);
            }
          }

          if (calculatedArea <= 0.1 || finalCoords.length < 3) {
            alert('支配領域の生成に失敗しました。移動距離が短すぎる可能性があります。');
            setIsSaving(false);
            return;
          }

          const timePeriod = getTimePeriod();

          const payload = {
            user_id: localStorage.getItem('physiproof_test_uid') || '',
            latitude: snappedRoute[0][0],
            longitude: snappedRoute[0][1],
            area_sqm: calculatedArea,
            time_period: timePeriod,
            area_polygon: JSON.stringify(finalCoords)
          };

          const res = await client.api.territories.$post({ json: payload as any });
          if (res.ok) {
            const dataJson = await res.json() as any;
            if (dataJson.id) {
              setJustClaimedId(dataJson.id);
              setTimeout(() => setJustClaimedId(null), 5000);
            }
            const timeLabel = timePeriod === 'morning' ? '朝' : timePeriod === 'afternoon' ? '昼' : '夜';
            const modeLabel = isLoopDetected ? '囲まれた範囲' : '通り道（幅12m）の周辺';
            alert(`ルートの記録を終了し、${modeLabel}を支配領域として保存しました！\n面積: ${calculatedArea.toFixed(2)} ㎡\n時間帯: ${timeLabel}`);
            fetchTerritories();
          } else {
            alert('領域の保存に失敗しました。');
          }
        } catch (e) {
          console.error('Area calculation error:', e);
          alert('ルートの記録を終了しました（領域の計算に失敗しました）。');
        } finally {
          setIsSaving(false);
        }
      } else if (route.length > 0) {
        alert('ルートの記録を終了しました（領域を作るには距離が短すぎます）。');
        setIsSaving(false);
      } else {
        setIsSaving(false);
      }
    } else {
      if (!navigator.geolocation) {
        alert('お使いの端末はGPSに対応していません。');
        return;
      }
      setIsTracking(true);
      setRoute([]);
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      {/* ステータス＆ボタン */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'left' }}>
            {isTracking ? '🔴 走行ルートを記録中...' : isSaving ? '⏳ 道路にスナップ処理中...' : '📍 現在の支配領域'}
          </div>
          {isTracking && (
            <div style={{ fontSize: '0.75rem', color: '#00d4ff', backgroundColor: '#00d4ff15', padding: '0.25rem 0.75rem', borderRadius: '20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {currentArea.toFixed(1)} ㎡
            </div>
          )}
        </div>
      </div>

      {/* マップ表示切り替えコントロール（セグメンテッド） */}
      <div style={{ 
        display: 'flex', 
        backgroundColor: 'rgba(10, 10, 10, 0.95)', 
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '0.25rem', 
        borderRadius: '24px', 
        marginBottom: '0.8rem',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)'
      }}>
        <button 
          type="button" 
          onClick={() => setViewMode('all')} 
          style={toggleButtonStyle(viewMode === 'all')}
        >
          🌐 全エリア
        </button>
        <button 
          type="button" 
          onClick={() => setViewMode('mine')} 
          style={toggleButtonStyle(viewMode === 'mine')}
        >
          🟢 マイエリア
        </button>
      </div>

      {/* マップ（現在地ボタン付き） */}
      <div style={{ position: 'relative', width: 'calc(100% + 2rem)', marginLeft: '-1rem' }}>
        <div id="map-container" style={{
          width: '100%',
          height: 'calc(100vh - 240px)',
          minHeight: '300px',
          maxHeight: '600px',
          backgroundColor: '#000',
          borderRadius: '16px',
          border: `2px solid ${isTracking ? '#ff4444' : isSaving ? '#00d4ff' : 'rgba(255,255,255,0.04)'}`,
          overflow: 'hidden',
          boxShadow: isTracking ? '0 0 30px rgba(255,68,68,0.25)' : isSaving ? '0 0 30px rgba(0,212,255,0.25)' : 'none',
          transition: 'border 0.3s, box-shadow 0.3s'
        }} />
        {/* 追尾トグルボタン */}
        <button
          onClick={toggleFollow}
          title={isFollowing ? '現在地を追従中（タップで解除）' : '自由探索中（タップで現在地を追従）'}
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: isFollowing ? 'rgba(0, 212, 255, 0.25)' : 'rgba(10, 10, 10, 0.95)',
            border: `2px solid ${isFollowing ? '#00d4ff' : 'rgba(255,255,255,0.2)'}`,
            color: isFollowing ? '#00d4ff' : '#ffffff',
            fontSize: '1.25rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isFollowing 
              ? '0 0 16px rgba(0,212,255,0.6), inset 0 0 8px rgba(0,212,255,0.4)' 
              : '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.1)';
            if (!isFollowing) e.currentTarget.style.borderColor = '#00d4ff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            if (!isFollowing) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
        >
          {isFollowing ? '📡' : '📍'}
        </button>
      </div>

      {/* アクションボタン（大きめ・ネオングロー） */}
      <button
        onClick={toggleTracking}
        disabled={isSaving}
        style={{
          width: '100%',
          marginTop: '1rem',
          backgroundColor: isSaving ? '#222' : isTracking ? '#ff3b30' : '#00ff88',
          color: isTracking ? '#fff' : '#030303',
          border: 'none',
          padding: '1.1rem',
          borderRadius: '16px',
          fontWeight: '900',
          fontSize: '1.05rem',
          letterSpacing: '0.05em',
          cursor: isSaving ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: isTracking 
            ? '0 8px 24px rgba(255,59,48,0.35), 0 0 12px rgba(255,59,48,0.2)' 
            : isSaving ? 'none' : '0 8px 24px rgba(0,255,136,0.25), 0 0 12px rgba(0,255,136,0.15)',
          outline: 'none'
        }}
        onMouseEnter={e => {
          if (!isSaving) e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          if (!isSaving) e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {isSaving ? '⏳ 処理中...' : isTracking ? '⏹ 記録を終了して領域化' : '▶ ランニングを開始する'}
      </button>

      <div style={{ marginTop: '0.6rem', color: '#666', fontSize: '0.72rem', lineHeight: '1.4', fontWeight: '500' }}>
        ※ 1周して囲むと内側全体が、囲まない場合は通ったルート（幅12m）が支配領域になります
      </div>
    </div>
  );
};

const toggleButtonStyle = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
  color: active ? '#00ff88' : '#777',
  border: 'none',
  padding: '0.55rem 1rem',
  borderRadius: '20px',
  cursor: 'pointer',
  fontWeight: '800',
  transition: 'all 0.2s ease',
  fontSize: '0.82rem',
  flex: 1,
  textAlign: 'center',
  outline: 'none',
  textShadow: active ? '0 0 10px rgba(0,255,136,0.4)' : 'none'
});

const ExerciseSection = ({ uid }: { uid: string }) => {
  const [stats, setStats] = useState<any[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'all'>('all');
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [customType, setCustomType] = useState('');

  const fetchStats = async () => {
    try {
      const res = await client.api.exercises.me.$get({ query: { period } });
      const data = await res.json();
      setStats((data as any).stats || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period]);

  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<PushupMeasurement>({
    resolver: zodResolver(pushupMeasurementSchema),
    defaultValues: {
      user_id: uid,
      exercise_type: '腕立て伏せ',
      count: 0,
      timestamp: new Date().toISOString(),
      nonce: Math.random().toString(36).substring(7),
      sensor_log: [{ x: 0, y: 9.8, z: 0, t: Date.now() }],
      integrity_token: 'web-development-token'
    }
  });

  const selectedType = watch('exercise_type');

  const onSubmit = async (data: any) => {
    // カスタム入力の場合は値を上書き
    if (data.exercise_type === 'カスタム') {
      if (!customType.trim()) {
        alert('カスタム種目名を入力してください');
        return;
      }
      data.exercise_type = customType;
    }

    // 複数回送信してもエラーにならないように毎回更新
    data.nonce = Math.random().toString(36).substring(7);
    data.timestamp = new Date().toISOString();
    data.user_id = uid;

    try {
      const res = await client.api.pushups.$post({ json: data });
      const result = await res.json();
      if (!res.ok) {
        alert('エラー: ' + ((result as any).error || '送信に失敗しました'));
      } else {
        alert((result as any).message || '送信成功');
        fetchStats(); // 成功したら記録を更新
      }
    } catch (e) {
      alert('通信エラー: バックエンドに接続できませんでした。');
    }
  };

  const handleDeleteType = async (type: string) => {
    if (!confirm(`${type} の記録をすべて削除してもよろしいですか？`)) return;
    try {
      const res = await client.api.exercises.type[':type'].$delete({ param: { type } });
      if (res.ok) {
        alert(`${type} を削除しました`);
        fetchStats();
      }
    } catch (e) {
      alert('削除に失敗しました');
    }
  };

  const exercisePresets = [
    { type: '腕立て伏せ', label: '腕立て伏せ', icon: '💪', sub: 'Pushup' },
    { type: 'スクワット', label: 'スクワット', icon: '🦵', sub: 'Squat' },
    { type: '腹筋', label: '腹筋', icon: '🧘', sub: 'Situp' },
    { type: 'カスタム', label: 'その他', icon: '⚙️', sub: 'Custom' }
  ];

  return (
    <div className="pp-exercise-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      
      {/* 選択 & 入力セクション */}
      <div>
        <p style={{ color: '#8a8a93', fontSize: '0.85rem', marginBottom: '1.2rem', fontWeight: 500 }}>
          証明するトレーニング種目を選択してください。
        </p>

        {/* Visual Presets Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.8rem', marginBottom: '1.5rem' }}>
          {exercisePresets.map(item => {
            const isSelected = selectedType === item.type;
            return (
              <div
                key={item.type}
                onClick={() => setValue('exercise_type', item.type as any)}
                style={{
                  padding: '1.1rem 0.8rem',
                  borderRadius: '16px',
                  backgroundColor: isSelected ? 'rgba(0, 255, 136, 0.07)' : 'rgba(255, 255, 255, 0.015)',
                  border: isSelected ? '1.5px solid #00ff88' : '1px solid rgba(255, 255, 255, 0.04)',
                  boxShadow: isSelected ? '0 0 16px rgba(0, 255, 136, 0.1)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                }}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: '0.3rem' }}>{item.icon}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: isSelected ? '#00ff88' : '#ffffff' }}>{item.label}</div>
                <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '2px', fontWeight: 'bold' }}>{item.sub}</div>
              </div>
            );
          })}
        </div>

        {selectedType === 'カスタム' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>カスタム種目名</label>
            <input
              type="text"
              value={customType}
              onChange={e => setCustomType(e.target.value)}
              style={inputStyle}
              placeholder="例: 懸垂, 背筋"
            />
          </div>
        )}

        {/* Action Pathways */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* AI Auto Count Route */}
          <div className="cyber-glass" style={{ padding: '1.2rem', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '16px', background: 'rgba(0, 212, 255, 0.01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🤖</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00d4ff' }}>AI センサー自動計測</span>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#8a8a93', margin: '0 0 1rem 0', lineHeight: '1.4' }}>
              スマホ内蔵センサーを利用してリアルタイムに運動データを解析し、回数を自動測定します。偽装防止証明書が適用されます。
            </p>
            <button
              type="button"
              onClick={() => setIsAutoMode(true)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                border: '1px solid rgba(0, 212, 255, 0.25)',
                color: '#00d4ff',
                padding: '0.85rem',
                borderRadius: '12px',
                fontWeight: '800',
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.2)';
                e.currentTarget.style.borderColor = '#00d4ff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.25)';
              }}
            >
              🚀 自動計測モードを開始
            </button>
          </div>

          {/* Manual Input Route */}
          <div style={{ padding: '1.2rem', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
              <span style={{ fontSize: '1.1rem' }}>✏️</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>手動記録を入力</span>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>実施回数 (Reps)</label>
                <input type="number" {...register('count', { valueAsNumber: true })} style={{ ...inputStyle, padding: '0.75rem' }} placeholder="0" />
              </div>
              <button 
                disabled={isSubmitting} 
                type="submit" 
                style={{
                  ...submitButtonStyle('#00ff88'),
                  padding: '0.85rem',
                  fontSize: '0.9rem',
                  borderRadius: '12px'
                }}
              >
                手動で送信
              </button>
            </form>
          </div>
        </div>
      </div>

      {isAutoMode && (
        <AutoCounterOverlay
          exerciseType={selectedType === 'カスタム' ? (customType || 'カスタム種目') : selectedType}
          onClose={() => setIsAutoMode(false)}
          onFinish={(count) => {
            setValue('count', count);
            setIsAutoMode(false);
            handleSubmit(onSubmit)();
          }}
        />
      )}

      {/* 記録まとめリストセクション */}
      <div className="cyber-glass" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(10, 10, 10, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, color: '#00d4ff', fontSize: '1.1rem', fontWeight: '900', fontFamily: "'Outfit', sans-serif" }}>運動記録まとめ</h3>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as 'daily' | 'weekly' | 'all')}
            style={{ 
              backgroundColor: '#000', 
              color: '#8a8a93', 
              border: '1px solid rgba(255,255,255,0.08)', 
              padding: '0.4rem 0.8rem', 
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700'
            }}
          >
            <option value="all">全期間</option>
            <option value="weekly">今週</option>
            <option value="daily">今日</option>
          </select>
        </div>

        {stats.length > 0 && (
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(255, 136, 0, 0.1) 0%, rgba(255, 136, 0, 0.01) 100%)', 
            padding: '1.1rem', 
            borderRadius: '14px', 
            border: '1px solid rgba(255, 136, 0, 0.25)', 
            marginBottom: '1.2rem', 
            textAlign: 'center',
            boxShadow: '0 4px 15px rgba(255, 136, 0, 0.03)'
          }}>
            <div style={{ fontSize: '0.72rem', color: '#ff9900', marginBottom: '0.3rem', fontWeight: 'bold', letterSpacing: '0.04em' }}>
              {period === 'daily' ? '今日の消費カロリー' : period === 'weekly' ? '今週の消費カロリー' : '累計消費カロリー'}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#ffcc00', fontFamily: "'Outfit', sans-serif" }}>
              {stats.reduce((acc, s) => acc + (s.estimated_calories || 0), 0).toFixed(1)} <span style={{ fontSize: '0.95rem', fontWeight: '700' }}>kcal</span>
            </div>
          </div>
        )}

        {stats.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {stats.map((s, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                backgroundColor: 'rgba(255, 255, 255, 0.012)', 
                border: '1px solid rgba(255, 255, 255, 0.03)',
                padding: '0.9rem 1.1rem',
                borderRadius: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
                  <button
                    onClick={() => handleDeleteType(s.exercise_type)}
                    style={{ 
                      background: 'rgba(255,68,68,0.06)', 
                      border: '1px solid rgba(255,68,68,0.15)', 
                      cursor: 'pointer', 
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                      transition: '0.2s',
                      flexShrink: 0
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,68,68,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,68,68,0.06)'}
                    title="この種目を削除"
                  >
                    🗑️
                  </button>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {s.exercise_type}
                  </span>
                </div>
                
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#00ff88', fontWeight: '800', fontSize: '1.05rem', fontFamily: "'Outfit', sans-serif" }}>
                    {s.total_count.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>回</span>
                  </div>
                  {s.estimated_calories !== undefined && (
                    <div style={{ 
                      fontSize: '0.7rem', 
                      color: '#ffcc00', 
                      backgroundColor: 'rgba(255, 204, 0, 0.08)',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      marginTop: '3px',
                      fontWeight: 'bold',
                      display: 'inline-block'
                    }}>
                      🔥 約 {s.estimated_calories} kcal
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#444' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.8rem' }}>💪</div>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', color: '#555' }}>記録がありません</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ChatSection = ({ onFocusChange }: { onFocusChange?: (focused: boolean) => void }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [viewportHeight, setViewportHeight] = useState<number>(window.innerHeight);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<{ name: string; avatar_id: string; avatar_image?: string | null } | null>(null);

  useEffect(() => {
    onFocusChange?.(isKeyboardOpen);
    if (isKeyboardOpen) {
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
      }, 50);
    }
  }, [isKeyboardOpen, onFocusChange]);

  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const vHeight = window.visualViewport!.height;
      setViewportHeight(vHeight);
      
      // キーボードが有効（高さがウィンドウ高より150px以上縮小）か判定
      const keyboardActive = vHeight < window.innerHeight - 150;
      setIsKeyboardOpen(keyboardActive);

      // Force window scroll back to 0 to prevent iOS layout offset
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isKeyboardOpen) return;

    const lockScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
      }
    };

    window.addEventListener('scroll', lockScroll);
    return () => {
      window.removeEventListener('scroll', lockScroll);
    };
  }, [isKeyboardOpen]);

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

  return (
    <div className={`pp-content-card pp-chat-container ${isKeyboardOpen ? 'keyboard-open' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      position: 'relative',
      height: window.innerWidth < 768 && isKeyboardOpen ? `${viewportHeight - 76}px` : undefined
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        paddingRight: '6px',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem'
      }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '0.8rem' }}>
            <div style={{ fontSize: '1.5rem', animation: 'pulse 1.5s infinite' }}>🤖</div>
            <div style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: 'bold' }}>AIコーチが履歴を読み込み中...</div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '1rem', color: '#8a8a93', padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem' }}>🤖</div>
            <div>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold', color: '#00ff88' }}>専属AIコーチチャットへようこそ！</p>
              <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: '1.5' }}>
                日々のトレーニング、食事のカロリー、PFCバランスについて何でも聞いてください。<br />
                例：「タンパク質を増やすためのメニューは？」「昨日のスクワットの消費カロリーは？」
              </p>
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
                      🤖
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

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAI ? 'flex-start' : 'flex-end' }}>
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
                🤖
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
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

      <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={sending ? 'コーチの返答をお待ちください...' : 'コーチにメッセージを送信...'}
          disabled={sending}
          style={{
            ...inputStyle,
            padding: '0.75rem 1rem',
            fontSize: '16px',
            border: sending ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.08)',
            backgroundColor: sending ? 'rgba(5,5,5,0.4)' : 'rgba(5,5,5,0.75)',
            transition: 'border 0.2s, background-color 0.2s'
          }}
        />
        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          style={{
            padding: '0.75rem 1.2rem',
            borderRadius: '12px',
            backgroundColor: sending || !inputText.trim() ? '#1a1a1a' : '#00ff88',
            color: sending || !inputText.trim() ? '#444' : '#000',
            border: 'none',
            fontWeight: '900',
            fontSize: '0.85rem',
            cursor: sending || !inputText.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: sending || !inputText.trim() ? 'none' : '0 4px 12px rgba(0, 255, 136, 0.2)',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={e => {
            if (!sending && inputText.trim()) e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            if (!sending && inputText.trim()) e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          送信
        </button>
      </form>
    </div>
  );
};

const AIPredictSection = () => {
  const [result, setResult] = useState<any>(null);
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting, errors } } = useForm<PredictionRequest>({
    resolver: zodResolver(predictionRequestSchema),
    defaultValues: {
      currentWeight: 75.0,
      targetWeight: 68.0,
      totalCaloriesBurned: 2200,
      mealCaloriesConsumed: 1800
    }
  });

  const currentWeightVal = watch('currentWeight') || 75;
  const targetWeightVal = watch('targetWeight') || 68;
  const totalCaloriesBurnedVal = watch('totalCaloriesBurned') || 2200;
  const mealCaloriesConsumedVal = watch('mealCaloriesConsumed') || 1800;

  const onSubmit = async (data: any) => {
    try {
      const res = await client.api.predict.$post({ json: data });
      if (!res.ok) {
        const errorData = await res.json();
        alert(`エラー: ${(errorData as any).error || '予測に失敗しました'}`);
        return;
      }
      const json = await res.json();
      setResult(json);
    } catch (e) {
      alert('通信エラーが発生しました。バックエンドが起動しているか確認してください。');
    }
  };

  // サイバー調 SVG 体重推移グラフ
  const renderSVGChart = () => {
    if (!result) return null;
    const days = Math.max(7, result.daysToTarget);
    const startW = currentWeightVal;
    const endW = targetWeightVal;
    
    const paddingX = 35;
    const paddingY = 25;
    const width = 360;
    const height = 160;

    // 6点データ生成 (均等プロット)
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= 5; i++) {
      const fraction = i / 5;
      const x = paddingX + (width - paddingX * 2) * fraction;
      
      // 指数的な減衰カーブを少しシミュレート (徐々に減りにくくなる演出)
      const weightVal = startW - (startW - endW) * (1 - Math.pow(1 - fraction, 1.2));
      
      const minW = Math.min(startW, endW);
      const maxW = Math.max(startW, endW);
      const diffW = Math.max(1, maxW - minW);
      
      const y = height - paddingY - ((weightVal - minW) / diffW) * (height - paddingY * 2);
      points.push({ x, y });
    }

    const pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

    return (
      <div style={{ marginTop: '1.2rem', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.04)', padding: '1rem 0.8rem' }}>
        <div style={{ color: '#00d4ff', fontSize: '0.72rem', fontWeight: 'bold', marginBottom: '10px', letterSpacing: '0.06em', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📉</span> 予定体重推移シミュレーション
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00d4ff" />
              <stop offset="100%" stopColor="#00ff88" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          {/* 横グリッド線 */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          
          {/* 光る折れ線 */}
          <path d={pathD} fill="none" stroke="url(#glowGrad)" strokeWidth="3.5" strokeLinecap="round" filter="url(#neonGlow)" />
          
          {/* 各座標ドット */}
          {points.map((p, idx) => {
            const fraction = idx / 5;
            const wVal = startW - (startW - endW) * (1 - Math.pow(1 - fraction, 1.2));
            return (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r="4.5" fill={idx === 5 ? '#00ff88' : '#00d4ff'} style={{ transition: 'all 0.3s' }} />
                {idx === 0 || idx === 5 ? (
                  <text x={p.x} y={p.y - 10} fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">
                    {wVal.toFixed(1)}kg
                  </text>
                ) : null}
              </g>
            );
          })}
          
          {/* X軸のラベル */}
          <text x={paddingX} y={height - 6} fill="#8a8a93" fontSize="10" fontWeight="bold" textAnchor="middle">今日</text>
          <text x={width - paddingX} y={height - 6} fill="#00ff88" fontSize="10" fontWeight="bold" textAnchor="middle">{result.daysToTarget}日後</text>
        </svg>
      </div>
    );
  };

  return (
    <div className="pp-predict-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      
      {/* 予測パラメータ入力フォーム */}
      <div>
        <p style={{ color: '#8a8a93', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 500 }}>
          体重目標と活動プランを入力して、AIによる体重推移の予測とコーチングのアドバイスを受けます。
        </p>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={labelStyle}>現在体重</label>
                <span style={{ fontSize: '0.8rem', color: '#00d4ff', fontWeight: 'bold' }}>{currentWeightVal.toFixed(1)} kg</span>
              </div>
              <div style={{ position: 'relative' }}>
                <input type="number" step="0.1" {...register('currentWeight', { valueAsNumber: true })} style={{ ...inputStyle, paddingRight: '2.5rem' }} placeholder="75.0" />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>kg</span>
              </div>
              <input 
                type="range" 
                min="40" 
                max="150" 
                step="0.5" 
                value={currentWeightVal}
                onChange={e => setValue('currentWeight', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#00d4ff', marginTop: '0.4rem' }}
              />
              {errors.currentWeight && <span style={{ color: '#ff4444', fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' }}>{errors.currentWeight.message}</span>}
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={labelStyle}>目標体重</label>
                <span style={{ fontSize: '0.8rem', color: '#00ff88', fontWeight: 'bold' }}>{targetWeightVal.toFixed(1)} kg</span>
              </div>
              <div style={{ position: 'relative' }}>
                <input type="number" step="0.1" {...register('targetWeight', { valueAsNumber: true })} style={{ ...inputStyle, paddingRight: '2.5rem' }} placeholder="68.0" />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>kg</span>
              </div>
              <input 
                type="range" 
                min="40" 
                max="150" 
                step="0.5" 
                value={targetWeightVal}
                onChange={e => setValue('targetWeight', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#00ff88', marginTop: '0.4rem' }}
              />
              {errors.targetWeight && <span style={{ color: '#ff4444', fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' }}>{errors.targetWeight.message}</span>}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle}>1日の目標消費カロリー</label>
              <span style={{ fontSize: '0.8rem', color: '#ff4444', fontWeight: 'bold' }}>{totalCaloriesBurnedVal} kcal</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input type="number" placeholder="例: 2200" {...register('totalCaloriesBurned', { valueAsNumber: true })} style={{ ...inputStyle, paddingRight: '3.2rem' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>kcal</span>
            </div>
            <input 
              type="range" 
              min="1000" 
              max="5000" 
              step="50" 
              value={totalCaloriesBurnedVal}
              onChange={e => setValue('totalCaloriesBurned', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#ff4444', marginTop: '0.4rem' }}
            />
            {errors.totalCaloriesBurned && <span style={{ color: '#ff4444', fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' }}>{errors.totalCaloriesBurned.message}</span>}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle}>1日の目標摂取カロリー</label>
              <span style={{ fontSize: '0.8rem', color: '#ffcc00', fontWeight: 'bold' }}>{mealCaloriesConsumedVal} kcal</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input type="number" placeholder="例: 1800" {...register('mealCaloriesConsumed', { valueAsNumber: true })} style={{ ...inputStyle, paddingRight: '3.2rem' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>kcal</span>
            </div>
            <input 
              type="range" 
              min="1000" 
              max="5000" 
              step="50" 
              value={mealCaloriesConsumedVal}
              onChange={e => setValue('mealCaloriesConsumed', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#ffcc00', marginTop: '0.4rem' }}
            />
            {errors.mealCaloriesConsumed && <span style={{ color: '#ff4444', fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' }}>{errors.mealCaloriesConsumed.message}</span>}
          </div>

          <button 
            disabled={isSubmitting} 
            type="submit" 
            style={{
              ...submitButtonStyle('#00d4ff'),
              boxShadow: '0 8px 24px rgba(0,212,255,0.2)'
            }}
            onMouseEnter={e => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,212,255,0.35)';
              }
            }}
            onMouseLeave={e => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,212,255,0.2)';
              }
            }}
          >
            {isSubmitting ? '🤖 AIがモデル解析中...' : '🔮 AI 遷移予測を開始'}
          </button>
        </form>
      </div>

      {/* 解析結果ダッシュボード */}
      <div className="cyber-glass" style={{ padding: '2rem 1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(10, 10, 10, 0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {result ? (
          <div style={{ width: '100%' }}>
            
            {/* Header Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: result.source === 'ai' ? '#00ff88' : '#ffcc00', display: 'inline-block', boxShadow: `0 0 8px ${result.source === 'ai' ? '#00ff88' : '#ffcc00'}` }}></span>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#8a8a93', letterSpacing: '0.04em' }}>
                  {result.source === 'ai' ? 'Gemini 1.5 Flash 予測エンジン' : '物理熱力学計算モデル'}
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '8px', color: '#666', fontWeight: 'bold' }}>
                SUCCESS
              </div>
            </div>

            {/* Days Target Count */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#8a8a93', fontWeight: '700', marginBottom: '0.2rem' }}>目標達成までの推定期間</div>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: '900', color: '#00d4ff', fontFamily: "'Outfit', sans-serif", textShadow: '0 0 20px rgba(0,212,255,0.35)' }}>
                  {result.daysToTarget}
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#00d4ff' }}>日</span>
              </div>
            </div>

            {/* Transition Roadmap */}
            <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#666', fontWeight: 'bold', marginBottom: '8px' }}>
                <span>現在</span>
                <span>ターゲット移行</span>
                <span>目標</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fff' }}>{currentWeightVal.toFixed(1)}kg</div>
                <div style={{ flex: 1, height: '4px', backgroundColor: '#222', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '100%', background: 'linear-gradient(90deg, #00d4ff, #00ff88)', animation: 'pulseGlow 2s infinite' }}></div>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#00ff88' }}>{targetWeightVal.toFixed(1)}kg</div>
              </div>
            </div>

            {/* SVG line chart */}
            {renderSVGChart()}

            {/* AI Personal Coach advice balloon */}
            <div style={{ 
              position: 'relative', 
              backgroundColor: 'rgba(255, 255, 255, 0.02)', 
              border: '1px solid rgba(255,255,255,0.05)', 
              borderRadius: '16px', 
              padding: '1.1rem',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)',
              marginTop: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🏃‍♂️</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#00ff88' }}>パーソナルコーチの分析・アドバイス</span>
              </div>
              <p style={{ 
                color: '#d1d1d6', 
                fontSize: '0.85rem', 
                lineHeight: '1.6', 
                margin: 0,
                textAlign: 'left'
              }}>
                {result.advice}
              </p>
            </div>
            
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#444', padding: '2rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', filter: 'grayscale(0.5)' }}>📈</div>
            <h4 style={{ margin: '0 0 0.4rem 0', color: '#777', fontWeight: 'bold' }}>予測モデル未実行</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#555', fontWeight: 500 }}>
              目標データを調整し、モデル解析を開始すると<br />AIのアドバイスや推移グラフがこちらに表示されます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const MealAnalysisSection = () => {
  const [result, setResult] = useState<MealAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const fetchMealHistory = async () => {
    try {
      const res = await client.api.meals.history.$get();
      if (res.ok) {
        const data = await res.json();
        setHistory((data as any).meals || []);
      }
    } catch (e) {
      console.error('Failed to fetch meal history:', e);
    }
  };

  useEffect(() => {
    fetchMealHistory();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // プレビューの作成
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // AI解析の実行
    setLoading(true);
    try {
      const base64 = await toBase64(file);
      const cleanBase64 = base64.split(',')[1]; // MIME type を除去

      const res = await client.api.meals.analyze.$post({ json: { image: cleanBase64 } });
      const data = await res.json();
      
      if (!res.ok || 'error' in data) {
        alert(`エラー: ${(data as any).error || '解析に失敗しました。'}`);
        setResult(null);
      } else {
        setResult(data as any);
        fetchMealHistory(); // 履歴をリロード
      }
    } catch (err) {
      alert('解析中にエラーが発生しました。');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  const getPercent = (value: number, max: number) => {
    return Math.min(Math.round((value / max) * 100), 100);
  };

  // 1食の目安ターゲット値 (P:25g, F:18g, C:80g, Cal: 650kcal)
  const mealTargets = { calories: 650, protein: 25, fat: 18, carbs: 80 };

  return (
    <div>
      <div className="pp-meal-layout" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'stretch' }}>
        
        {/* Upload Zone */}
        <div className="pp-meal-upload" style={{ width: '100%' }}>
          <label style={{
            width: '100%', 
            height: '240px', 
            backgroundColor: 'rgba(5,5,5,0.7)', 
            border: `2px dashed ${loading ? '#00ff88' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '20px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: loading ? 'not-allowed' : 'pointer', 
            overflow: 'hidden', 
            position: 'relative', 
            transition: 'all 0.3s ease',
            boxShadow: loading ? '0 0 20px rgba(0,255,136,0.1)' : 'none'
          }}
          className="meal-dropzone"
          >
            {preview ? (
              <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loading ? 0.3 : 1 }} alt="preview" />
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.6rem' }}>📸</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>食事の写真をアップロード</div>
                <div style={{ fontSize: '0.72rem', color: '#666', fontWeight: 'bold' }}>タップして画像を選択</div>
              </div>
            )}
            
            {loading && (
              <div style={{ 
                position: 'absolute', 
                backgroundColor: 'rgba(0,0,0,0.85)',
                padding: '0.8rem 1.5rem',
                borderRadius: '30px',
                border: '1px solid rgba(0,255,136,0.25)',
                color: '#00ff88', 
                fontWeight: '900',
                fontSize: '0.85rem',
                letterSpacing: '0.04em',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
              }}>
                🤖 AI管理栄養士が画像を解析中...
              </div>
            )}
            <input type="file" accept="image/*" disabled={loading} onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Results Dashboard */}
        {result && !loading && (
          <div className="pp-meal-result" style={{ 
            backgroundColor: 'rgba(10, 10, 10, 0.3)', 
            padding: '1.5rem', 
            borderRadius: '20px', 
            border: '1px solid rgba(0,255,136,0.12)', 
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(0,255,136,0.02)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '900', margin: 0, letterSpacing: '-0.01em' }}>
                🍽️ {result.name}
              </h3>
              <div style={{ 
                backgroundColor: 'rgba(0,255,136,0.08)', 
                color: '#00ff88', 
                padding: '4px 12px', 
                borderRadius: '20px', 
                fontSize: '0.72rem', 
                fontWeight: 'bold',
                border: '1px solid rgba(0,255,136,0.15)'
              }}>
                AI NUTRITIONIST
              </div>
            </div>

            {/* PFC Balance Card Gauges */}
            <div className="pp-pfc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              
              {/* Calories Item */}
              <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '0.9rem 1.1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: '700' }}>摂取エネルギー</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#00ff88', fontFamily: "'Outfit', sans-serif" }}>
                    {result.calories} <span style={{ fontSize: '0.75rem', color: '#666', fontWeight: 'bold' }}>/ 目標 {mealTargets.calories} kcal</span>
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${getPercent(result.calories, mealTargets.calories)}%`, height: '100%', backgroundColor: '#00ff88', borderRadius: '3px', boxShadow: '0 0 8px #00ff88' }}></div>
                </div>
              </div>

              {/* PFC Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                
                {/* Protein */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8a8a93', fontWeight: '700', display: 'block', marginBottom: '2px' }}>タンパク質 (P)</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#00d4ff', fontFamily: "'Outfit', sans-serif" }}>{result.pfc.protein}g</span>
                  <span style={{ fontSize: '0.62rem', color: '#555', display: 'block', fontWeight: 'bold' }}>目標 {mealTargets.protein}g</span>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${getPercent(result.pfc.protein, mealTargets.protein)}%`, height: '100%', backgroundColor: '#00d4ff', borderRadius: '2px', boxShadow: '0 0 6px #00d4ff' }}></div>
                  </div>
                </div>

                {/* Fat */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8a8a93', fontWeight: '700', display: 'block', marginBottom: '2px' }}>脂質 (F)</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ffcc00', fontFamily: "'Outfit', sans-serif" }}>{result.pfc.fat}g</span>
                  <span style={{ fontSize: '0.62rem', color: '#555', display: 'block', fontWeight: 'bold' }}>目標 {mealTargets.fat}g</span>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${getPercent(result.pfc.fat, mealTargets.fat)}%`, height: '100%', backgroundColor: '#ffcc00', borderRadius: '2px', boxShadow: '0 0 6px #ffcc00' }}></div>
                  </div>
                </div>

                {/* Carbs */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8a8a93', fontWeight: '700', display: 'block', marginBottom: '2px' }}>炭水化物 (C)</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ff007f', fontFamily: "'Outfit', sans-serif" }}>{result.pfc.carbs}g</span>
                  <span style={{ fontSize: '0.62rem', color: '#555', display: 'block', fontWeight: 'bold' }}>目標 {mealTargets.carbs}g</span>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${getPercent(result.pfc.carbs, mealTargets.carbs)}%`, height: '100%', backgroundColor: '#ff007f', borderRadius: '2px', boxShadow: '0 0 6px #ff007f' }}></div>
                  </div>
                </div>

              </div>

            </div>

            {/* AI Advisor Card */}
            <div style={{ 
              padding: '1.2rem', 
              backgroundColor: 'rgba(0, 255, 136, 0.01)', 
              borderRadius: '16px', 
              borderLeft: '4px solid #00ff88',
              borderTop: '1px solid rgba(0, 255, 136, 0.1)',
              borderRight: '1px solid rgba(0, 255, 136, 0.1)',
              borderBottom: '1px solid rgba(0, 255, 136, 0.1)',
              boxShadow: '0 4px 15px rgba(0,255,136,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🩺</span>
                <span style={{ fontSize: '0.8rem', color: '#00ff88', fontWeight: '900', letterSpacing: '0.02em' }}>AI 管理栄養士のアドバイス</span>
              </div>
              <p style={{ color: '#d1d1d6', fontSize: '0.85rem', lineHeight: '1.6', margin: 0, textAlign: 'left' }}>{result.advice}</p>
            </div>

          </div>
        )}

        {/* Meal History Timeline */}
        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.5rem' }}>
          <h4 style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 'bold', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.02em' }}>
            <span>📅</span> 食事履歴タイムライン
          </h4>
          {history.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '16px', color: '#666', fontSize: '0.82rem', fontWeight: 'bold' }}>
              過去の食事解析履歴がありません。<br />食事の写真をアップロードするとここに蓄積されます。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {history.map((meal) => (
                <div key={meal.id} className="cyber-glass" style={{ padding: '1rem', border: '1px solid rgba(255,255,255,0.03)', background: 'rgba(5,5,5,0.45)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{meal.name}</strong>
                    <span style={{ fontSize: '0.7rem', color: '#666', fontWeight: 'bold' }}>
                      {new Date(meal.created_at).toLocaleDateString()} {new Date(meal.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#8a8a93', fontWeight: 'bold' }}>
                    <span style={{ color: '#00ff88' }}>🔥 {meal.calories} kcal</span>
                    <span style={{ color: '#00d4ff' }}>P: {meal.protein}g</span>
                    <span style={{ color: '#ffcc00' }}>F: {meal.fat}g</span>
                    <span style={{ color: '#ff007f' }}>C: {meal.carbs}g</span>
                  </div>
                  {meal.advice && (
                    <p style={{ margin: '4px 0 0 0', color: '#aaaaaa', fontSize: '0.78rem', lineHeight: '1.4', background: 'rgba(0,0,0,0.22)', padding: '8px 12px', borderRadius: '10px', borderLeft: '3px solid #00ff88', textAlign: 'left' }}>
                      {meal.advice}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

const StatItem = ({ label, value }: { label: string, value: string }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '0.7rem', color: '#555' }}>{label}</div>
    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{value}</div>
  </div>
);

const RankingView = ({ 
  ranking, 
  period, 
  setPeriod, 
  duration, 
  setDuration 
}: { 
  ranking: any[], 
  period: string, 
  setPeriod: (p: any) => void, 
  duration: string, 
  setDuration: (d: any) => void 
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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', color: '#8a8a93', marginBottom: '0.5rem', fontWeight: '700' };
const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: 'rgba(5, 5, 5, 0.75)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.9rem', color: '#fff', boxSizing: 'border-box', fontSize: '1rem', WebkitAppearance: 'none' };
const submitButtonStyle = (color: string): React.CSSProperties => ({
  width: '100%', backgroundColor: color, color: '#000', border: 'none', padding: '1rem', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', WebkitTapHighlightColor: 'transparent', transition: 'all 0.2s', boxShadow: `0 4px 12px ${color}22`
});

const ProfileModal = ({ 
  currentUser, 
  onClose, 
  onSave 
}: { 
  currentUser: { name: string, avatar_id: string, avatar_image?: string | null, login_id?: string }, 
  onClose: () => void, 
  onSave: (name: string, avatar: string, avatarImage: string | null, loginId?: string, password?: string) => void 
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

const AutoCounterOverlay = ({ exerciseType, onClose, onFinish }: { exerciseType: string, onClose: () => void, onFinish: (count: number) => void }) => {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<'ready' | 'counting'>('ready');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const ampRef = React.useRef<number>(10);
  const speedRef = React.useRef<number>(0.05);

  // 音声フィードバック
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (status !== 'counting') return;
    playBeep();
    
    // Web Speech API 音声合成
    if ('speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      synth.cancel(); // 前の発話をキャンセル
      const utterance = new SpeechSynthesisUtterance(count.toString());
      utterance.lang = 'en-US';
      utterance.rate = 1.25;
      synth.speak(utterance);
    }
    
    // タッチやカウント時の波形スパイク
    ampRef.current = 50;
    speedRef.current = 0.2;
  }, [count, status]);

  // Canvas アニメーション & センサーログ監視
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const handleResize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = 120;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // グリッド線
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }

      // 波形の描画
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00ff88';
      ctx.beginPath();

      // 振幅の徐々の減衰
      ampRef.current += (10 - ampRef.current) * 0.05;
      speedRef.current += (0.05 - speedRef.current) * 0.05;

      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.sin(x * 0.035 + phase) * ampRef.current;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      
      // Shadow リセット
      ctx.shadowBlur = 0;

      phase += speedRef.current;
      animId = requestAnimationFrame(render);
    };
    render();

    // 端末の加速度センサーに連動して波形を変化させる
    const handleDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (acc) {
        const norm = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
        ampRef.current = Math.max(10, Math.min(55, norm * 3.5));
        speedRef.current = Math.max(0.05, Math.min(0.25, norm * 0.01));
      }
    };
    window.addEventListener('devicemotion', handleDeviceMotion);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('devicemotion', handleDeviceMotion);
    };
  }, [status]);

  const handleTouch = () => {
    if (status === 'ready') setStatus('counting');
    setCount(prev => prev + 1);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#020202', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: '2rem', textAlign: 'center', width: '90%' }}>
        <h2 style={{ color: '#00d4ff', margin: '0 0 4px 0', fontSize: '1.4rem' }}>{exerciseType} 自動計測</h2>
        <p style={{ color: '#8a8a93', margin: 0, fontSize: '0.82rem', fontWeight: 'bold' }}>
          {exerciseType === '腕立て伏せ' ? '📢 スマホを床に置き、鼻先で画面にタッチしてください' : '📢 画面をタップしてカウントします'}
        </p>
      </div>

      <div style={{ width: '85%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
        {/* Canvas 波形モニター */}
        <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,136,0.1)', borderRadius: '12px', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ color: '#00ff88', fontSize: '0.65rem', fontWeight: 'bold', width: '90%', textAlign: 'left', marginBottom: '4px', letterSpacing: '0.08em' }}>📡 BIOMETRIC SENSOR STREAM</div>
          <canvas ref={canvasRef} style={{ width: '100%', height: '120px' }} />
        </div>

        {/* カウンターボタン */}
        <div
          onClick={handleTouch}
          style={{
            width: '200px', height: '200px', border: '3px solid #00ff88', borderRadius: '50%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            backgroundColor: 'rgba(0, 255, 136, 0.03)', transition: 'all 0.1s ease',
            boxShadow: '0 0 30px rgba(0,255,136,0.06)'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{ fontSize: '6rem', fontWeight: '900', color: '#00ff88', lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: '0.7rem', color: '#8a8a93', marginTop: '6px', fontWeight: 'bold', letterSpacing: '0.04em' }}>
            {status === 'ready' ? 'TAP TO START' : 'TAP / NOSE TOUCH'}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: '3rem', display: 'flex', gap: '1.5rem', width: '85%', maxWidth: '400px' }}>
        <button onClick={onClose} style={{ flex: 1, padding: '1rem', borderRadius: '12px', backgroundColor: '#1a1a1a', color: '#8a8a93', border: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
          キャンセル
        </button>
        <button
          onClick={() => onFinish(count)}
          style={{ flex: 2, padding: '1rem', borderRadius: '12px', backgroundColor: '#00ff88', color: '#000', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem', boxShadow: '0 8px 20px rgba(0,255,136,0.2)' }}
        >
          記録を確定して送信
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
