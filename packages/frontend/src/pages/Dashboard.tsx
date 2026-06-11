import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pushupMeasurementSchema, predictionRequestSchema, mealAnalysisRequestSchema, type PushupMeasurement, type PredictionRequest, type MealAnalysisResponse } from '@my-app/shared';
import { useNavigate } from 'react-router-dom';
import client from '../lib/hc';
import { area } from '@turf/area';
import { polygon, lineString, featureCollection } from '@turf/helpers';
import buffer from '@turf/buffer';
import convex from '@turf/convex';

type TabType = 'map' | 'exercise' | 'ai-predict' | 'meal' | 'ranking';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [rankingPeriod, setRankingPeriod] = useState<'morning' | 'afternoon' | 'night' | 'all'>('all');
  const [rankingDuration, setRankingDuration] = useState<'daily' | 'weekly' | 'yearly' | 'all'>('all');
  const [ranking, setRanking] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ uid: string, name: string, avatar_id: string } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('physiproof_user');
    if (!userData) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(userData);
    setCurrentUser({ uid: parsed.userId, name: parsed.name, avatar_id: parsed.avatar_id || 'default' });
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

  const handleSaveProfile = async (newName: string, newAvatar: string) => {
    try {
      const res = await client.api.users.me.$put({ json: { name: newName, avatar_id: newAvatar as any } });
      if (res.ok) {
        const updated = { uid: currentUser!.uid, name: newName, avatar_id: newAvatar };
        setCurrentUser(updated);
        const oldUser = JSON.parse(localStorage.getItem('physiproof_user') || '{}');
        localStorage.setItem('physiproof_user', JSON.stringify({ ...oldUser, name: newName, avatar_id: newAvatar }));
        setShowProfileModal(false);
        fetchRanking();
      } else {
        alert('プロフィールの更新に失敗しました');
      }
    } catch (e) {
      console.error(e);
      alert('エラーが発生しました');
    }
  };

  if (!currentUser) return null;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#050505', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pulseGlow {
          0% { fill-opacity: 0.35; stroke-width: 3; filter: drop-shadow(0 0 4px #00ff88); }
          50% { fill-opacity: 0.45; stroke-width: 4.5; filter: drop-shadow(0 0 10px #00ff88); }
          100% { fill-opacity: 0.35; stroke-width: 3; filter: drop-shadow(0 0 4px #00ff88); }
        }
        @keyframes pulseGlowOther {
          0% { fill-opacity: 0.2; stroke-width: 2; filter: drop-shadow(0 0 3px #ff007f); }
          50% { fill-opacity: 0.3; stroke-width: 2.5; filter: drop-shadow(0 0 7px #ff007f); }
          100% { fill-opacity: 0.2; stroke-width: 2; filter: drop-shadow(0 0 3px #ff007f); }
        }
        .own-territory { animation: pulseGlow 4s infinite ease-in-out; transition: all 0.3s ease; }
        .other-territory { animation: pulseGlowOther 5s infinite ease-in-out; transition: all 0.3s ease; }
        .own-territory:hover { fill-opacity: 0.55 !important; stroke-width: 5 !important; cursor: pointer; }
        .other-territory:hover { fill-opacity: 0.4 !important; stroke-width: 3.5 !important; cursor: pointer; }

        /* --- Mobile-first responsive styles --- */
        .pp-bottom-nav {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
          background: linear-gradient(180deg, rgba(10,10,10,0.0) 0%, #0a0a0a 12%);
          padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
          display: flex; justify-content: space-around; align-items: center;
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid #1a1a1a;
        }
        .pp-bottom-nav button {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          background: none; border: none; cursor: pointer; padding: 6px 10px;
          border-radius: 12px; transition: all 0.25s ease; min-width: 52px;
          -webkit-tap-highlight-color: transparent;
        }
        .pp-bottom-nav button .pp-nav-icon { font-size: 1.35rem; line-height: 1; }
        .pp-bottom-nav button .pp-nav-label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.02em; }
        .pp-bottom-nav button.pp-active { background: rgba(0,255,136,0.12); }
        .pp-bottom-nav button.pp-active .pp-nav-label { color: #00ff88; }
        .pp-bottom-nav button:not(.pp-active) .pp-nav-label { color: #666; }

        .pp-top-bar {
          background: #0a0a0a; border-bottom: 1px solid #1a1a1a;
          padding: 0.6rem 1rem; position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
        }
        .pp-main { flex: 1; padding: 0; padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px)); width: 100%; box-sizing: border-box; }
        .pp-section-header { padding: 1rem 1rem 0; text-align: center; }
        .pp-section-header h2 { font-size: 1.2rem; font-weight: 800; margin: 0 0 0.3rem; }
        .pp-content-card {
          background: #0d0d0d; border-radius: 20px; border: 1px solid #1a1a1a;
          margin: 0.8rem; padding: 1rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }

        /* Desktop overrides */
        @media (min-width: 768px) {
          .pp-bottom-nav { display: none; }
          .pp-desktop-tabs { display: flex !important; }
          .pp-main { padding: 1.5rem; padding-bottom: 0; max-width: 1200px; margin: 0 auto; }
          .pp-section-header h2 { font-size: 1.8rem; }
          .pp-content-card { margin: 0; padding: 1.5rem; border-radius: 24px; }
          .pp-exercise-grid { grid-template-columns: 1fr 1fr !important; }
          .pp-predict-grid { grid-template-columns: 1fr 1fr !important; }
          .pp-meal-layout { flex-direction: row !important; }
          .pp-meal-upload { flex: 0 0 350px !important; width: auto !important; }
          .pp-meal-result { flex: 1 !important; }
          .pp-pfc-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      {/* --- Compact Top Bar --- */}
      <div className="pp-top-bar">
        <h1 style={{ fontSize: '1.2rem', fontWeight: '900', margin: 0, background: 'linear-gradient(45deg, #00ff88, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          PhysiProof
        </h1>

        {/* Desktop-only tabs */}
        <div className="pp-desktop-tabs" style={{ display: 'none', gap: '0.5rem' }}>
          <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} label="マップ" icon="🗺️" />
          <TabButton active={activeTab === 'exercise'} onClick={() => setActiveTab('exercise')} label="記録" icon="💪" />
          <TabButton active={activeTab === 'ai-predict'} onClick={() => setActiveTab('ai-predict')} label="予測" icon="✨" />
          <TabButton active={activeTab === 'meal'} onClick={() => setActiveTab('meal')} label="食事" icon="🥗" />
          <TabButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} label="ランク" icon="🏆" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={() => setShowProfileModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
          >
            <img
              src={`/avatars/${currentUser.avatar_id}.png`}
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzU1NSI+PHBhdGggZD0iTTEyIDJDMi4xMiAyIDEwIDYuNDggMTAgMTJzNC40OCAxMCAxMCAxMCAxMC00LjQ4IDEwLTEwUzE3LjUyIDIgMTIgMnptMCAzYzEuNjYgMCAzIDEuMzQgMyAzcy0xLjM0IDMtMyAzLTMtMS4zNC0zLTMgMS4zNC0zIDMtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHMyLjk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==' }}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: '2px solid #00ff88', objectFit: 'cover' }}
              alt="avatar"
            />
            <span style={{ fontSize: '0.75rem', color: '#00ff88', fontWeight: 'bold' }}>{currentUser.name}</span>
          </button>
          <button
            onClick={handleLogout}
            style={{ backgroundColor: 'transparent', color: '#ff4444', border: 'none', fontSize: '0.7rem', cursor: 'pointer', padding: '4px', WebkitTapHighlightColor: 'transparent' }}
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <main className="pp-main">
        <div className="pp-section-header">
          <h2>
            {activeTab === 'map' && '支配領域'}
            {activeTab === 'exercise' && '運動証明'}
            {activeTab === 'ai-predict' && '未来予測'}
            {activeTab === 'meal' && '食事解析'}
            {activeTab === 'ranking' && 'グローバル勢力'}
          </h2>
          <div style={{ width: '32px', height: '3px', background: '#00ff88', margin: '0.3rem auto 0', borderRadius: '2px' }}></div>
        </div>

        <div className="pp-content-card">
          {activeTab === 'map' && <MapView />}
          {activeTab === 'exercise' && <ExerciseSection uid={currentUser.uid} />}
          {activeTab === 'ai-predict' && <AIPredictSection />}
          {activeTab === 'meal' && <MealAnalysisSection />}
          {activeTab === 'ranking' && <RankingView ranking={ranking} period={rankingPeriod} setPeriod={setRankingPeriod} duration={rankingDuration} setDuration={setRankingDuration} />}
        </div>
      </main>

      {/* --- Bottom Navigation (Mobile) --- */}
      <nav className="pp-bottom-nav">
        {[
          { key: 'map' as TabType, icon: '🗺️', label: 'マップ' },
          { key: 'exercise' as TabType, icon: '💪', label: '記録' },
          { key: 'ai-predict' as TabType, icon: '✨', label: '予測' },
          { key: 'meal' as TabType, icon: '🥗', label: '食事' },
          { key: 'ranking' as TabType, icon: '🏆', label: 'ランク' },
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

    territories.forEach((t) => {
      try {
        const coords: [number, number][] = JSON.parse(t.area_polygon);
        if (!Array.isArray(coords) || coords.length < 2) return;

        const currentUid = localStorage.getItem('physiproof_test_uid') || '';
        const isOwn = t.user_id === currentUid;

        const options = isOwn ? {
          color: '#00ff88',
          fillColor: '#00ff88',
          fillOpacity: 0.35,
          weight: 3,
          className: 'own-territory'
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
            <div style="color: #000; font-family: sans-serif; font-size: 0.85rem; padding: 4px;">
              <strong style="font-size: 1rem; color: ${isOwn ? '#00cc66' : '#cc0055'};">
                ${isOwn ? 'マイエリア' : '他プレイヤーのエリア'}
              </strong><br/>
              <strong>所有者:</strong> ${t.user_name || '不明'}<br/>
              <strong>面積:</strong> ${(t.area_sqm || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} ㎡<br/>
              <strong>占領日時:</strong> ${new Date(t.captured_at).toLocaleString()}<br/>
              <strong>防衛レベル:</strong> Lv.${t.fortification_level || 1}
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
  }, [territories, mapInstance]);

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

  useEffect(() => {
    if (!mapInstance || !currentPos) return;
    const L = (window as any).L;
    if (!L) return;

    if (markerLayer) {
      mapInstance.removeLayer(markerLayer);
    }

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

    const newMarker = L.marker(currentPos, { icon }).addTo(mapInstance).bindPopup("現在地");

    setMarkerLayer(newMarker);

    if (!route.length || isTracking) {
      mapInstance.setView(currentPos, 17);
    }
  }, [currentPos, heading, mapInstance]);

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
      if (route.length > 2) {
        try {
          const snappedRoute = await snapRouteToRoads(route);

          // OSRMでスナップしたルートを閉じたポリゴンとして面積を計算
          let calculatedArea = 0;
          try {
            const turfPolyCoords = snappedRoute.map(([lat, lng]) => [lng, lat] as [number, number]);
            if (turfPolyCoords.length >= 3) {
              const first = turfPolyCoords[0];
              const last = turfPolyCoords[turfPolyCoords.length - 1];
              if (first[0] !== last[0] || first[1] !== last[1]) {
                turfPolyCoords.push(first);
              }
              const poly = polygon([turfPolyCoords]);
              calculatedArea = area(poly);
            }
          } catch (e) {
            console.error('Failed to calculate closed polygon area:', e);
            // 凸包 (Convex Hull) を用いてフォールバック計算
            try {
              const pts = snappedRoute.map(([lat, lng]) => {
                return {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                  },
                  properties: {}
                } as any;
              });
              const fc = featureCollection(pts);
              const hull = convex(fc);
              if (hull) {
                calculatedArea = area(hull);
              }
            } catch (convexErr) {
              console.error('Convex hull fallback calculation failed:', convexErr);
            }
          }

          if (calculatedArea <= 0.1) {
            alert('閉じた領域（ループ）が検知できなかったか、面積が極めて小さいため、支配領域を保存できませんでした。一周するようなルートを走る必要があります。');
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
            area_polygon: JSON.stringify(snappedRoute)
          };

          const res = await client.api.territories.$post({ json: payload as any });
          if (res.ok) {
            const timeLabel = timePeriod === 'morning' ? '朝' : timePeriod === 'afternoon' ? '昼' : '夜';
            alert(`ルートの記録を終了し、囲まれた範囲を支配領域として保存しました！\n面積: ${calculatedArea.toFixed(2)} ㎡\n時間帯: ${timeLabel}`);
            fetchTerritories();
          } else {
            alert('領域の保存に失敗しました。');
          }
        } catch (e) {
          console.error('Area calculation error:', e);
          alert('ルートの記録を終了しました（面積の計算に失敗しました。交差しない3点以上の地点が必要です）。');
        } finally {
          setIsSaving(false);
        }
      } else if (route.length > 0) {
        alert('ルートの記録を終了しました（領域を作るには距離が短すぎます。3点以上必要です）。');
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

      {/* マップ */}
      <div id="map-container" style={{
        width: 'calc(100% + 2rem)',
        marginLeft: '-1rem',
        height: 'calc(100vh - 240px)',
        minHeight: '300px',
        maxHeight: '600px',
        backgroundColor: '#000',
        borderRadius: '16px',
        border: `2px solid ${isTracking ? '#ff4444' : isSaving ? '#00d4ff' : '#1a1a1a'}`,
        overflow: 'hidden',
        boxShadow: isTracking ? '0 0 30px rgba(255,68,68,0.2)' : isSaving ? '0 0 30px rgba(0,212,255,0.2)' : 'none',
        transition: 'border 0.3s, box-shadow 0.3s'
      }} />

      {/* アクションボタン（大きめ・タッチフレンドリー） */}
      <button
        onClick={toggleTracking}
        disabled={isSaving}
        style={{
          width: '100%',
          marginTop: '0.8rem',
          backgroundColor: isSaving ? '#333' : isTracking ? '#ff4444' : '#00ff88',
          color: isTracking ? '#fff' : '#000',
          border: 'none',
          padding: '1rem',
          borderRadius: '14px',
          fontWeight: '800',
          fontSize: '1rem',
          cursor: isSaving ? 'not-allowed' : 'pointer',
          transition: '0.3s',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: isTracking ? '0 4px 20px rgba(255,68,68,0.3)' : isSaving ? 'none' : '0 4px 20px rgba(0,255,136,0.2)'
        }}
      >
        {isSaving ? '⏳ 処理中...' : isTracking ? '⏹ 記録を終了して領域化' : '▶ ランニングを開始する'}
      </button>

      <div style={{ marginTop: '0.6rem', color: '#555', fontSize: '0.7rem', lineHeight: '1.4' }}>
        走った軌跡で囲まれた範囲が支配領域になります
      </div>
    </div>
  );
};

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

  return (
    <div className="pp-exercise-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
      <div>
        <p style={{ color: '#888', marginBottom: '2rem' }}>種目を選択して自動カウントを開始するか、手動で回数を入力します。</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={labelStyle}>種目を選択</label>
            <select
              {...register('exercise_type')}
              style={inputStyle}
            >
              <option value="腕立て伏せ">腕立て伏せ (Pushup)</option>
              <option value="スクワット">スクワット (Squat)</option>
              <option value="腹筋">腹筋 (Situp)</option>
              <option value="カスタム">その他 (カスタム入力)</option>
            </select>
          </div>

          {watch('exercise_type') === 'カスタム' && (
            <div>
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

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => setIsAutoMode(true)}
              style={{ flex: 1, backgroundColor: '#00d4ff', color: '#000', border: 'none', padding: '1rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              🚀 自動計測モード開始
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #222', margin: '1rem 0' }} />

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={labelStyle}>手動入力回数 (Reps)</label>
              <input type="number" {...register('count', { valueAsNumber: true })} style={inputStyle} />
            </div>
            <button disabled={isSubmitting} type="submit" style={submitButtonStyle('#00ff88')}>手動記録を送信</button>
          </form>
        </div>
      </div>

      {isAutoMode && (
        <AutoCounterOverlay
          exerciseType={watch('exercise_type') === 'カスタム' ? (customType || 'カスタム種目') : watch('exercise_type')}
          onClose={() => setIsAutoMode(false)}
          onFinish={(count) => {
            setValue('count', count);
            setIsAutoMode(false);
            handleSubmit(onSubmit)();
          }}
        />
      )}

      <div style={{ backgroundColor: '#111', padding: '2rem', borderRadius: '16px', border: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#00d4ff' }}>運動記録まとめ</h3>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as 'daily' | 'weekly' | 'all')}
            style={{ backgroundColor: '#000', color: '#fff', border: '1px solid #333', padding: '0.4rem 0.8rem', borderRadius: '8px' }}
          >
            <option value="all">全期間</option>
            <option value="weekly">今週</option>
            <option value="daily">今日</option>
          </select>
        </div>

        {stats.length > 0 && (
          <div style={{ backgroundColor: '#000', padding: '1rem', borderRadius: '12px', border: '1px solid #00ff8844', marginBottom: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.3rem' }}>
              {period === 'daily' ? '今日の合計消費' : period === 'weekly' ? '今週の合計消費' : '累計合計消費'}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#00ff88' }}>
              {stats.reduce((acc, s) => acc + (s.estimated_calories || 0), 0).toFixed(1)} <span style={{ fontSize: '1rem' }}>kcal</span>
            </div>
          </div>
        )}
        {stats.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stats.map((s, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    onClick={() => handleDeleteType(s.exercise_type)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#666', padding: '4px' }}
                    title="この種目を削除"
                  >
                    🗑️
                  </button>
                  <span style={{ fontWeight: 'bold' }}>{s.exercise_type}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '1.2rem' }}>{s.total_count} 回</div>
                  {s.estimated_calories !== undefined && (
                    <div style={{ fontSize: '0.75rem', color: '#ffcc00' }}>
                      🔥 AI算出: 約 {s.estimated_calories} kcal 消費
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#666' }}>まだ記録がありません。</p>
        )}
      </div>
    </div>
  );
};

const AIPredictSection = () => {
  const [result, setResult] = useState<any>(null);
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<PredictionRequest>({
    resolver: zodResolver(predictionRequestSchema)
  });

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

  return (
    <div className="pp-predict-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
      <div>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={labelStyle}>現在の体重 (kg)</label>
            <input type="number" step="0.1" {...register('currentWeight', { valueAsNumber: true })} style={inputStyle} />
            {errors.currentWeight && <span style={{ color: '#ff4444', fontSize: '0.7rem' }}>{errors.currentWeight.message}</span>}
          </div>
          <div>
            <label style={labelStyle}>目標体重 (kg)</label>
            <input type="number" step="0.1" {...register('targetWeight', { valueAsNumber: true })} style={inputStyle} />
            {errors.targetWeight && <span style={{ color: '#ff4444', fontSize: '0.7rem' }}>{errors.targetWeight.message}</span>}
          </div>
          <div>
            <label style={labelStyle}>1日の目標消費カロリー (kcal)</label>
            <input type="number" placeholder="例: 2200" {...register('totalCaloriesBurned', { valueAsNumber: true })} style={inputStyle} />
            {errors.totalCaloriesBurned && <span style={{ color: '#ff4444', fontSize: '0.7rem' }}>{errors.totalCaloriesBurned.message}</span>}
          </div>
          <div>
            <label style={labelStyle}>1日の目標摂取カロリー (kcal)</label>
            <input type="number" placeholder="例: 1800" {...register('mealCaloriesConsumed', { valueAsNumber: true })} style={inputStyle} />
            {errors.mealCaloriesConsumed && <span style={{ color: '#ff4444', fontSize: '0.7rem' }}>{errors.mealCaloriesConsumed.message}</span>}
          </div>
          <button disabled={isSubmitting} type="submit" style={submitButtonStyle('#00d4ff')}>
            {isSubmitting ? '解析中...' : 'AI 遷移予測を開始'}
          </button>
        </form>
      </div>
      <div style={{ backgroundColor: '#050505', borderRadius: '16px', padding: '1.5rem', border: '1px solid #222', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {result ? (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
              予測ソース: <span style={{ color: result.source === 'ai' ? '#00ff88' : '#ffcc00' }}>{result.source === 'ai' ? 'Gemini 1.5 Flash' : '物理計算モデル'}</span>
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#00d4ff', marginBottom: '0.5rem' }}>{result.daysToTarget} <span style={{ fontSize: '1rem' }}>日</span></div>
            <p style={{ color: '#bbb', lineHeight: '1.6', fontSize: '0.9rem' }}>{result.advice}</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#333' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📈</div>
            <p>条件を入力して予測を開始してください</p>
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
      setResult(data as any);
    } catch (err) {
      alert('解析中にエラーが発生しました。');
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

  return (
    <div>
      <div className="pp-meal-layout" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'stretch' }}>
        <div className="pp-meal-upload" style={{ width: '100%' }}>
          <label style={{
            width: '100%', height: '250px', backgroundColor: '#000', border: '2px dashed #333',
            borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: '0.3s',
            borderColor: loading ? '#00ff88' : '#333'
          }}>
            {preview ? (
              <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loading ? 0.3 : 1 }} />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📸</div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>食事の写真をアップロード</div>
              </div>
            )}
            {loading && <div style={{ position: 'absolute', color: '#00ff88', fontWeight: 'bold' }}>AI 解析中...</div>}
            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        {result && !loading && (
          <div className="pp-meal-result" style={{ backgroundColor: '#050505', padding: '1.2rem', borderRadius: '20px', border: '1px solid #00ff8833', boxShadow: '0 10px 30px rgba(0,255,136,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#00ff88', fontSize: '1.5rem', margin: 0 }}>{result.name}</h3>
              <div style={{ backgroundColor: '#00ff8822', color: '#00ff88', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>AI 解析済</div>
            </div>

            <div className="pp-pfc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.8rem', marginBottom: '1.5rem' }}>
              <StatItem label="総カロリー" value={`${result.calories} kcal`} />
              <StatItem label="タンパク質" value={`${result.pfc.protein} g`} />
              <StatItem label="脂質" value={`${result.pfc.fat} g`} />
              <StatItem label="炭水化物" value={`${result.pfc.carbs} g`} />
            </div>

            <div style={{ padding: '1rem', backgroundColor: '#111', borderRadius: '12px', borderLeft: '4px solid #00ff88' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem', fontWeight: 'bold' }}>AI 管理栄養士のアドバイス</div>
              <p style={{ color: '#bbb', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>{result.advice}</p>
            </div>
          </div>
        )}
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

const RankingView = ({ ranking, period, setPeriod, duration, setDuration }: { ranking: any[], period: string, setPeriod: (p: any) => void, duration: string, setDuration: (d: any) => void }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#000', padding: '0.5rem', borderRadius: '24px', border: '1px solid #333' }}>
        <button onClick={() => setDuration('daily')} style={rankingTabStyle(duration === 'daily')}>今日</button>
        <button onClick={() => setDuration('weekly')} style={rankingTabStyle(duration === 'weekly')}>今週</button>
        <button onClick={() => setDuration('yearly')} style={rankingTabStyle(duration === 'yearly')}>今年</button>
        <button onClick={() => setDuration('all')} style={rankingTabStyle(duration === 'all')}>全期間</button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#000', padding: '0.5rem', borderRadius: '24px', border: '1px solid #333' }}>
        <button onClick={() => setPeriod('all')} style={rankingTabStyle(period === 'all')}>総合</button>
        <button onClick={() => setPeriod('morning')} style={rankingTabStyle(period === 'morning')}>朝</button>
        <button onClick={() => setPeriod('afternoon')} style={rankingTabStyle(period === 'afternoon')}>昼</button>
        <button onClick={() => setPeriod('night')} style={rankingTabStyle(period === 'night')}>夜</button>
      </div>
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #222', color: '#555', textAlign: 'left' }}>
          <th style={{ padding: '1rem' }}>RANK</th>
          <th>PLAYER</th>
          <th>TERRITORIES</th>
          <th>AREA (sqm)</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((row, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #111' }}>
            <td style={{ padding: '1rem', fontWeight: 'bold' }}>{row.rank}</td>
            <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
              <img
                src={`/avatars/${row.avatar_id}.png`}
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzU1NSI+PHBhdGggZD0iTTEyIDJDMi4xMiAyIDEwIDYuNDggMTAgMTJzNC40OCAxMCAxMCAxMCAxMC00LjQ4IDEwLTEwUzE3LjUyIDIgMTIgMnptMCAzYzEuNjYgMCAzIDEuMzQgMyAzcy0xLjM0IDMtMyAzLTMtMS4zNC0zLTMgMS4zNC0zIDMtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHMyLjk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==' }}
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                alt="avatar"
              />
              {row.name}
            </td>
            <td>{row.territories}</td>
            <td style={{ color: '#ffcc00' }}>{row.points} ㎡</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const rankingTabStyle = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? '#00ff88' : '#111',
  color: active ? '#000' : '#888',
  border: 'none',
  padding: '0.4rem 1.2rem',
  borderRadius: '20px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: '0.2s',
  fontSize: '0.85rem'
});

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' };
const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: '#000', border: '1px solid #222', borderRadius: '12px', padding: '0.9rem', color: '#fff', boxSizing: 'border-box', fontSize: '1rem', WebkitAppearance: 'none' };
const submitButtonStyle = (color: string): React.CSSProperties => ({
  width: '100%', backgroundColor: color, color: '#000', border: 'none', padding: '1rem', borderRadius: '14px', fontWeight: '800', cursor: 'pointer', fontSize: '1rem', WebkitTapHighlightColor: 'transparent'
});

const ProfileModal = ({ currentUser, onClose, onSave }: { currentUser: { name: string, avatar_id: string }, onClose: () => void, onSave: (name: string, avatar: string) => void }) => {
  const [name, setName] = useState(currentUser.name);
  const [avatar, setAvatar] = useState(currentUser.avatar_id);
  const avatars = ['male1', 'male2', 'male3', 'female1', 'female2', 'female3'];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#111', padding: '2rem', borderRadius: '24px', border: '1px solid #333', width: '90%', maxWidth: '400px' }}>
        <h3 style={{ marginTop: 0, color: '#00ff88', textAlign: 'center' }}>プロフィール設定</h3>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>表示名</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={labelStyle}>アバター選択</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {avatars.map(av => (
              <img
                key={av}
                src={`/avatars/${av}.png`}
                onClick={() => setAvatar(av)}
                style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer', objectFit: 'cover',
                  border: avatar === av ? '3px solid #00ff88' : '2px solid transparent',
                  opacity: avatar === av ? 1 : 0.5,
                  transition: '0.2s'
                }}
                alt={av}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.8rem', backgroundColor: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '12px', cursor: 'pointer' }}>キャンセル</button>
          <button onClick={() => onSave(name, avatar)} style={{ flex: 1, padding: '0.8rem', backgroundColor: '#00ff88', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer' }}>保存</button>
        </div>
      </div>
    </div>
  );
};

const AutoCounterOverlay = ({ exerciseType, onClose, onFinish }: { exerciseType: string, onClose: () => void, onFinish: (count: number) => void }) => {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<'ready' | 'counting'>('ready');

  // 音声フィードバック
  const playBeep = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  };

  useEffect(() => {
    if (status !== 'counting') return;
    playBeep();
  }, [count]);

  const handleTouch = () => {
    if (status === 'ready') setStatus('counting');
    setCount(prev => prev + 1);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#000', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: '#00d4ff', margin: 0 }}>{exerciseType} 自動計測</h2>
        <p style={{ color: '#666' }}>
          {exerciseType === '腕立て伏せ' ? 'スマホを床に置き、鼻先で画面にタッチしてください' : '画面をタップしてカウントします'}
        </p>
      </div>

      <div
        onClick={handleTouch}
        style={{
          width: '80vw', height: '50vh', border: '4px dashed #00ff88', borderRadius: '40px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          backgroundColor: '#00ff8805', transition: '0.1s'
        }}
      >
        <div style={{ fontSize: '10rem', fontWeight: '900', color: '#00ff88' }}>{count}</div>
      </div>

      <div style={{ position: 'absolute', bottom: '3rem', display: 'flex', gap: '2rem' }}>
        <button onClick={onClose} style={{ padding: '1rem 2rem', borderRadius: '12px', backgroundColor: '#222', color: '#fff', border: 'none', cursor: 'pointer' }}>
          キャンセル
        </button>
        <button
          onClick={() => onFinish(count)}
          style={{ padding: '1rem 4rem', borderRadius: '12px', backgroundColor: '#00ff88', color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        >
          記録を確定して送信
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
