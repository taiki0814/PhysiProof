import React, { useState, useEffect, useRef } from 'react';
import { area } from '@turf/area';
import { polygon, lineString } from '@turf/helpers';
import buffer from '@turf/buffer';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import client from '../lib/hc';
import type { ActivityMode, BattleMapResponse, TeamBattleSummary } from '@my-app/shared';
import { battleMapResponseSchema } from '@my-app/shared';
import InfoHint from './InfoHint';
import AppIcon from './AppIcon';
import BattleRulesHelp from './BattleRulesHelp';

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

export interface MapViewProps {
  currentUser: { uid: string; name: string; avatar_id: string; avatar_image?: string | null; level?: number; xp?: number; team_id?: string | null; team_name?: string | null };
  activityMode: ActivityMode;
  setActivityMode: (mode: ActivityMode) => void;
  runningSessionId: string | null;
  runningBattleId: string | null;
  startOnlineRun: (battleId?: string) => Promise<string | null>;
  onClearRunningSession: () => void;
  onRunSaved: () => void;
  isTracking: boolean;
  setIsTracking: React.Dispatch<React.SetStateAction<boolean>>;
  route: [number, number][];
  setRoute: React.Dispatch<React.SetStateAction<[number, number][]>>;
  currentDistance: number;
  setCurrentDistance: React.Dispatch<React.SetStateAction<number>>;
  trackingStartTime: number | null;
  setTrackingStartTime: React.Dispatch<React.SetStateAction<number | null>>;
  elapsedTime: number;
  setElapsedTime: React.Dispatch<React.SetStateAction<number>>;
  currentPos: [number, number] | null;
  setCurrentPos: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  currentSpeed: number;
  setCurrentSpeed: React.Dispatch<React.SetStateAction<number>>;
  heading: number | null;
  setHeading: React.Dispatch<React.SetStateAction<number | null>>;
  triggerAchievementUnlock: (achievements: any[]) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  currentUser,
  activityMode,
  setActivityMode,
  runningSessionId,
  runningBattleId,
  startOnlineRun,
  onClearRunningSession,
  onRunSaved,
  isTracking,
  setIsTracking,
  route,
  setRoute,
  currentDistance,
  setCurrentDistance,
  trackingStartTime,
  setTrackingStartTime,
  elapsedTime,
  setElapsedTime,
  currentPos,
  setCurrentPos,
  currentSpeed,
  setCurrentSpeed,
  heading,
  setHeading,
  triggerAchievementUnlock
}) => {
  const [currentArea, setCurrentArea] = useState<number>(0);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [routeLayer, setRouteLayer] = useState<any>(null);
  const [markerLayer, setMarkerLayer] = useState<any>(null);
  const [territories, setTerritories] = useState<any[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState(() => runningBattleId ?? (isTracking ? '' : new URLSearchParams(window.location.search).get('battle') ?? ''));
  const [battleMaps, setBattleMaps] = useState<TeamBattleSummary[]>([]);
  const [battleMap, setBattleMap] = useState<BattleMapResponse | null>(null);
  const [battleMapError, setBattleMapError] = useState('');
  const [battleRefresh, setBattleRefresh] = useState(0);
  const mapBattleId = isTracking ? (runningBattleId ?? '') : activityMode === 'team' ? selectedBattleId : '';
  useEffect(() => {
    if (selectedBattleId && !isTracking) setActivityMode('team');
  }, []);
  useEffect(() => {
    let active = true;
    void client.api.teams.battles.$get().then(async res => {
      const data = await res.json() as { battles?: TeamBattleSummary[] };
      if (active && res.ok) setBattleMaps((data.battles ?? []).filter(b => b.map_rules_version === 1));
    }).catch(() => { if (active) setBattleMapError('対戦一覧を読み込めませんでした。'); });
    return () => { active = false; };
  }, [currentUser.team_id, battleRefresh]);
  useEffect(() => {
    let active = true, busy = false;
    setBattleMap(null); setBattleMapError('');
    if (!mapBattleId) return;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await client.api['battle-maps'][':id'].$get({ param: { id: mapBattleId } });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? '対戦マップを読み込めません。');
        const parsed = battleMapResponseSchema.parse(data);
        if (active) { setBattleMap(parsed); setBattleMapError(''); }
      } catch (e) { if (active) { setBattleMap(null); setBattleMapError(e instanceof Error ? e.message : '対戦マップを読み込めません。'); } }
      finally { busy = false; }
    };
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [mapBattleId, battleRefresh]);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');
  const [territorySearch, setTerritorySearch] = useState('');
  const [isFollowing, setIsFollowing] = useState(false); // UI追尾状態
  const [justClaimedId, setJustClaimedId] = useState<string | null>(null); // 新規領域のフラッシュ用
  // 現在地への自動追従フラグ（走行中のみ自動追従、手動スクロール時は停止）
  const autoFollowRef = useRef<boolean>(false);
  const currentPosRef = useRef<[number, number] | null>(null);
  const hasSetInitialViewRef = useRef<boolean>(false); // 初回位置セット済みか

  // ── Wake Lock & Background Tracking Hack (Media Session) ──
  const wakeLockRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAD';

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Screen Wake Lock acquired');
      }
    } catch (err) {
      console.error('Failed to acquire wake lock:', err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
        console.log('Screen Wake Lock released');
      }).catch((e: any) => {
        console.error('Error releasing wake lock:', e);
      });
    }
  };

  const startMediaSession = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(SILENT_WAV_BASE64);
        audioRef.current.loop = true;
      }
      audioRef.current.play().catch(err => {
        console.warn('Audio play blocked or failed:', err);
      });

      if ('mediaSession' in navigator) {
        (navigator as any).mediaSession.metadata = new MediaMetadata({
          title: 'ランニング計測中...',
          artist: 'PhysiProof',
          album: 'バックグラウンドで位置情報を記録しています',
          artwork: [
            { src: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=192&h=192&fit=crop', sizes: '192x192', type: 'image/jpeg' }
          ]
        });

        (navigator as any).mediaSession.setActionHandler('pause', () => {
          if (audioRef.current) audioRef.current.pause();
        });
        (navigator as any).mediaSession.setActionHandler('play', () => {
          if (audioRef.current) audioRef.current.play().catch(() => {});
        });
      }
    } catch (err) {
      console.error('Failed to start Media Session:', err);
    }
  };

  const stopMediaSession = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ('mediaSession' in navigator) {
        (navigator as any).mediaSession.metadata = null;
      }
    } catch (err) {
      console.error('Failed to stop Media Session:', err);
    }
  };

  useEffect(() => {
    if (isTracking) {
      requestWakeLock();
      startMediaSession();
    } else {
      releaseWakeLock();
      stopMediaSession();
    }

    const handleVisibilityChange = async () => {
      if (isTracking && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
      stopMediaSession();
    };
  }, [isTracking]);

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
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    const map = L.map(mapContainer, { maxZoom: 18 })
      .setView([35.7126, 139.7619], 15);
    map.attributionControl.addAttribution(
      '&copy; <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ' +
      '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · ' +
      'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    );
    map.attributionControl.setPrefix(false);
    setMapInstance(map);
    setMarkerLayer(null);
    setRouteLayer(null);
    hasSetInitialViewRef.current = false;

    return () => {
      map.remove();
      setMapInstance((current: L.Map | null) => current === map ? null : current);
    };
  }, []);

  useEffect(() => {
    if (!mapInstance) return;

    let disposed = false;
    let hasLoaded = false;
    let loadErrors = 0;
    let mapLayer: any = null;
    let maplibreMap: any = null;
    setMapStatus('loading');

    const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim()
      || 'https://tiles.openfreemap.org/styles/positron';

    const handleLoad = () => {
      if (disposed) return;
      hasLoaded = true;
      setMapStatus('ready');
    };

    const handleError = () => {
      if (disposed) return;
      loadErrors += 1;
      if (!hasLoaded && loadErrors >= 3) setMapStatus('offline');
    };

    void Promise.all([
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    ]).then(async ([{ maplibreGL }, maplibre, _maplibreCss, worker]) => {
      if (disposed) return;
      maplibre.setWorkerUrl(worker.default);

      const styleResponse = await fetch(styleUrl);
      if (!styleResponse.ok) throw new Error(`Map style request failed: ${styleResponse.status}`);
      const styleDefinition = await styleResponse.json();
      const cleanedStyle = {
        ...styleDefinition,
        layers: styleDefinition.layers.map((layer: any) => {
          if (['building', 'label_other', 'highway-name-minor', 'highway-name-path'].includes(layer.id)) {
            return {
              ...layer,
              layout: { ...layer.layout, visibility: 'none' },
            };
          }
          return layer;
        }),
      };

      mapLayer = maplibreGL({
        style: cleanedStyle,
        interactive: false,
        attributionControl: false,
      }).addTo(mapInstance);
      maplibreMap = mapLayer.getMaplibreMap();
      maplibreMap.on('load', handleLoad);
      maplibreMap.on('error', handleError);
    }).catch(() => {
      if (!disposed) setMapStatus('offline');
    });

    const timeoutId = window.setTimeout(() => {
      setMapStatus(status => status === 'loading' ? 'offline' : status);
    }, 15000);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      if (maplibreMap) {
        maplibreMap.off('load', handleLoad);
        maplibreMap.off('error', handleError);
      }
      if (mapLayer && mapInstance.hasLayer(mapLayer)) mapInstance.removeLayer(mapLayer);
    };
  }, [mapInstance, mapRetryKey]);

  useEffect(() => {
    if (!mapInstance) return;

    if (mapBattleId) return;
    const territoryLayers: any[] = [];
    const currentUid = localStorage.getItem('physiproof_test_uid') || '';

    const activityTerritories = territories.filter((t) => activityMode === 'team'
      ? t.team_id !== null && t.team_id !== undefined
      : t.team_id === null || t.team_id === undefined);
    const filteredTerritories = activityTerritories.filter(t => {
      if (viewMode === 'mine') {
        return activityMode === 'team' ? t.team_id === currentUser.team_id : t.user_id === currentUid;
      }
      return true;
    });

    filteredTerritories.forEach((t) => {
      try {
        const coords: [number, number][] = JSON.parse(t.area_polygon);
        if (!Array.isArray(coords) || coords.length < 2) return;

        const isOwn = activityMode === 'personal' && t.user_id === currentUid;
        const myTeamId = currentUser.team_id || null;
        const isSameTeam = myTeamId && t.team_id === myTeamId;
        const isAlly = isOwn || isSameTeam;

        const isJustClaimed = t.id === justClaimedId;
        let options: any;
        if (isAlly) {
          const color = isOwn ? '#00ff88' : '#00d4ff';
          options = {
            color,
            fillColor: color,
            fillOpacity: 0.3,
            weight: 3,
            className: isJustClaimed ? 'own-territory just-claimed' : 'own-territory'
          };
        } else {
          options = {
            color: '#ff007f',
            fillColor: '#ff007f',
            fillOpacity: 0.2,
            weight: 2,
            dashArray: '5, 5',
            className: 'other-territory'
          };
        }

        let displayCoords = [...coords];
        if (displayCoords.length >= 3) {
          const first = displayCoords[0];
          const last = displayCoords[displayCoords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            displayCoords.push(first);
          }
        }

        const popupHeaderColor = isOwn ? '#00ff88' : (isSameTeam ? '#00d4ff' : '#ff007f');
        const popupHeaderText = isOwn ? 'マイエリア' : (isSameTeam ? '味方チームのエリア' : '敵チームのエリア');

        const polyLayer = (t.geometry_json ? L.geoJSON(JSON.parse(t.geometry_json), { style: options }) : L.polygon(displayCoords, options))
          .addTo(mapInstance)
          .bindPopup(`
            <div style="color: #fff; background: rgba(5,5,5,0.95); font-family: sans-serif; font-size: 0.82rem; padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 0 15px rgba(0,0,0,0.5); min-width: 160px;">
              <strong style="font-size: 0.95rem; color: ${popupHeaderColor}; letter-spacing: 0.04em; display: block; margin-bottom: 6px;">
                ${popupHeaderText}
              </strong>
              <div style="height: 1px; background: rgba(255,255,255,0.08); margin-bottom: 8px;"></div>
              <strong>所有者:</strong> ${t.user_name || '不明'}<br/>
              <strong>面積:</strong> ${(t.area_sqm || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} ㎡<br/>
              <strong>占領日時:</strong> ${new Date(t.captured_at).toLocaleString()}
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
  }, [territories, mapInstance, viewMode, activityMode, currentUser.team_id, mapBattleId]);

  useEffect(() => {
    if (!mapInstance || !mapBattleId || !battleMap) return;
    const layers: L.Layer[] = [];
    const colors = ['#00d4ff', '#ff5fa2', '#ffd15e', '#a895ff', '#67e8a2'];
    const color = (team: string | null) => team === currentUser.team_id ? '#00d4ff' : team ? colors[(battleMap.battle.participants.findIndex(p => p.team_id === team) + colors.length) % colors.length] : '#a9b4c4';
    for (const t of battleMap.territories) {
      if (viewMode === 'mine' && t.team_id !== currentUser.team_id) continue;
      const popup = document.createElement('div');
      popup.textContent = `${t.team_name} · ${t.area_sqm.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}m²${t.buffed ? ' · スポット保持バフあり（古い領域は対象外）' : ''}`;
      const layer = L.geoJSON(t.geometry as GeoJSON.GeoJsonObject, { style: { color: color(t.team_id), fillColor: color(t.team_id), fillOpacity: .25, weight: t.buffed ? 4 : 2 } }).bindPopup(popup).addTo(mapInstance);
      layers.push(layer);
    }
    for (const spot of battleMap.spots) {
      const popup = document.createElement('div');
      const owner = battleMap.battle.participants.find(p => p.team_id === spot.owner_team_id)?.team_name ?? '未獲得';
      popup.textContent = `スポット · ${owner}。中心を囲むと接続領域の保持${battleMap.battle.spot_holding_multiplier}倍。自チームの初回ボーナス${spot.first_capture_team_ids.includes(currentUser.team_id ?? '') ? '獲得済み' : '未獲得'}。`;
      const marker = L.circleMarker([spot.latitude, spot.longitude], { radius: 10, color: '#ffe38a', fillColor: color(spot.owner_team_id), fillOpacity: .95, weight: 3 }).bindPopup(popup).addTo(mapInstance);
      layers.push(marker);
    }
    return () => { layers.forEach(layer => mapInstance.removeLayer(layer)); };
  }, [battleMap, mapInstance, mapBattleId, viewMode, currentUser.team_id]);

  const spotBounds = battleMap?.battle.spot_bounds;
  useEffect(() => {
    if (mapInstance && spotBounds && !isTracking) {
      mapInstance.fitBounds([[spotBounds[1], spotBounds[0]], [spotBounds[3], spotBounds[2]]], { padding: [24, 24], maxZoom: 14 });
    } else if (mapInstance && battleMap?.battle.map_latitude != null && battleMap.battle.map_longitude != null && !isTracking) {
      mapInstance.setView([battleMap.battle.map_latitude, battleMap.battle.map_longitude], 14);
    }
  // Depend on scalar bounds: periodic refresh must not reset the user's pan/zoom.
  }, [mapInstance, mapBattleId, battleMap?.battle.map_latitude, battleMap?.battle.map_longitude, spotBounds?.[0], spotBounds?.[1], spotBounds?.[2], spotBounds?.[3]]);

  useEffect(() => {
    currentPosRef.current = currentPos;
  }, [currentPos]);

  useEffect(() => {
    if (isTracking) {
      autoFollowRef.current = true;
      setIsFollowing(true);
    } else {
      autoFollowRef.current = false;
      setIsFollowing(false);
    }
  }, [isTracking]);

  useEffect(() => {
    if (!mapInstance) return;
    const stopFollow = (e: any) => {
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
    if (newState) {
      goToCurrentLocation();
    }
  };

  useEffect(() => {
    if (!mapInstance || !currentPos) return;

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

  useEffect(() => {
    if (!mapInstance || !currentPos) return;

    if (!hasSetInitialViewRef.current) {
      hasSetInitialViewRef.current = true;
      mapInstance.setView(currentPos, 15);
    }

    if (autoFollowRef.current) {
      mapInstance.setView(currentPos, mapInstance.getZoom());
    }
  }, [currentPos, mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;

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

  const applyMovingAverage = (coords: [number, number][], windowSize = 3): [number, number][] => {
    if (coords.length < windowSize) return coords;
    const smoothed: [number, number][] = [];
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < coords.length; i++) {
      let latSum = 0;
      let lngSum = 0;
      let count = 0;
      for (let w = -half; w <= half; w++) {
        const idx = i + w;
        if (idx >= 0 && idx < coords.length) {
          latSum += coords[idx][0];
          lngSum += coords[idx][1];
          count++;
        }
      }
      smoothed.push([latSum / count, lngSum / count]);
    }
    return smoothed;
  };

  const getPerpendicularDistance = (pt: [number, number], lineStart: [number, number], lineEnd: [number, number]): number => {
    const [lat, lng] = pt;
    const [startLat, startLng] = lineStart;
    const [endLat, endLng] = lineEnd;
    
    const dx = endLng - startLng;
    const dy = endLat - startLat;
    
    if (dx === 0 && dy === 0) {
      const dLat = lat - startLat;
      const dLng = lng - startLng;
      return Math.sqrt(dLat * dLat + dLng * dLng);
    }
    
    const t = ((lng - startLng) * dx + (lat - startLat) * dy) / (dx * dx + dy * dy);
    const safeT = Math.max(0, Math.min(1, t));
    const targetLat = startLat + safeT * dy;
    const targetLng = startLng + safeT * dx;
    
    const dLat = lat - targetLat;
    const dLng = lng - targetLng;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  const douglasPeucker = (points: [number, number][], epsilon: number): [number, number][] => {
    if (points.length < 3) return points;
    
    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;
    
    for (let i = 1; i < end; i++) {
      const dist = getPerpendicularDistance(points[i], points[0], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    
    if (maxDist > epsilon) {
      const results1 = douglasPeucker(points.slice(0, index + 1), epsilon);
      const results2 = douglasPeucker(points.slice(index), epsilon);
      return results1.slice(0, results1.length - 1).concat(results2);
    } else {
      return [points[0], points[end]];
    }
  };

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
      throw new Error(`OSRM Match API returned invalid code: ${data.code}`);
    }
  };

  const getDistanceMeters = (p1: [number, number], p2: [number, number]): number => {
    const R = 6371000;
    const dLat = (p2[0] - p1[0]) * Math.PI / 180;
    const dLng = (p2[1] - p1[1]) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getTimePeriod = (): 'morning' | 'afternoon' | 'night' => {
    const hr = new Date().getHours();
    if (hr >= 4 && hr < 11) return 'morning';
    if (hr >= 11 && hr < 18) return 'afternoon';
    return 'night';
  };

  const clearTrackingData = () => {
    setIsTracking(false);
    setRoute([]);
    setTrackingStartTime(null);
    setCurrentDistance(0);
    setCurrentSpeed(0);
    setElapsedTime(0);
    const uid = currentUser.uid;
    localStorage.removeItem(`physiproof_run_is_tracking_${uid}`);
    localStorage.removeItem(`physiproof_run_route_${uid}`);
    localStorage.removeItem(`physiproof_run_start_time_${uid}`);
    localStorage.removeItem(`physiproof_run_distance_${uid}`);
    onClearRunningSession();
  };

  const toggleTracking = async () => {
    const uid = currentUser.uid;
    if (isTracking) {
      setIsSaving(true);
      setIsTracking(false);

      const durationSec = trackingStartTime ? (Date.now() - trackingStartTime) / 1000 : 0;
      setTrackingStartTime(null);

      let totalDist = 0;
      for (let i = 0; i < route.length - 1; i++) {
        totalDist += getDistanceMeters(route[i], route[i + 1]);
      }
      const avgSpeed = durationSec > 0 ? (totalDist / 1000) / (durationSec / 3600) : 0;

      if (avgSpeed > 40) {
        alert(`移動速度が速すぎます（平均速度: ${avgSpeed.toFixed(1)} km/h）。\n自転車や乗り物での移動は禁止されています。徒歩またはランニングで行ってください。`);
        if (runningSessionId) await client.api.running.sessions[':id'].$delete({ param: { id: runningSessionId } }).catch(() => undefined);
        clearTrackingData();
        setIsSaving(false);
        return;
      }

      if (!runningSessionId) {
        alert('オンライン走行セッションが見つかりません。この走行は保存されませんでした。');
        clearTrackingData();
        setIsSaving(false);
        return;
      }
      try {
        const completion = await client.api.running.sessions[':id'].complete.$post({
          param: { id: runningSessionId },
          json: { distance_m: totalDist, duration_sec: durationSec }
        });
        if (!completion.ok) throw new Error('Could not save the online run');
      } catch (error) {
        console.error('Failed to save online running session:', error);
        alert('走行記録をサーバーへ保存できませんでした。オフライン記録としては保存されません。');
        clearTrackingData();
        setIsSaving(false);
        return;
      }

      if (route.length >= 2) {
        try {
          let isLoopDetected = false;
          if (route.length >= 3) {
            const rawStart = route[0];
            const rawEnd = route[route.length - 1];
            const rawDistMeters = getDistanceMeters(rawStart, rawEnd);
            if (rawDistMeters < 25) {
              isLoopDetected = true;
            }
          }

          let finalRoute: [number, number][] = [];
          let isSnapped = false;
          try {
            finalRoute = await snapRouteToRoads(route);
            isSnapped = true;
          } catch (apiErr) {
            console.error('Failed to snap route to roads:', apiErr);
            alert('道路補正APIへの接続に失敗したため、ローカルの平滑化フォールバックを適用して領域を生成します。');
            
            const smoothed = applyMovingAverage(route, 3);
            finalRoute = douglasPeucker(smoothed, 0.00003);
          }

          if (isSnapped && finalRoute.length >= 3) {
            const smoothed = applyMovingAverage(finalRoute, 3);
            finalRoute = douglasPeucker(smoothed, 0.00001);
          }

          let calculatedArea = 0;
          let finalCoords: [number, number][] = [];

          if (isLoopDetected && finalRoute.length >= 3) {
            try {
              const turfPolyCoords = finalRoute.map(([lat, lng]) => [lng, lat] as [number, number]);
              const first = turfPolyCoords[0];
              const last = turfPolyCoords[turfPolyCoords.length - 1];
              if (first[0] !== last[0] || first[1] !== last[1]) {
                turfPolyCoords.push(first);
              }
              const poly = polygon([turfPolyCoords]);
              calculatedArea = area(poly);
              
              if (calculatedArea > 0.1) {
                finalCoords = finalRoute;
              } else {
                isLoopDetected = false;
              }
            } catch (e) {
              console.error('Failed to calculate closed polygon area:', e);
              isLoopDetected = false;
            }
          }

          if (!isLoopDetected || finalCoords.length === 0) {
            try {
              const lineCoords = finalRoute.map(([lat, lng]) => [lng, lat] as [number, number]);
              const line = lineString(lineCoords);
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
            alert('走行距離は記録しましたが、領域を生成できませんでした。距離記録は残ります。');
            clearTrackingData();
            onRunSaved();
            setIsSaving(false);
            return;
          }

          const timePeriod = getTimePeriod();

          const payload = {
            user_id: localStorage.getItem('physiproof_test_uid') || '',
            latitude: finalRoute[0][0],
            longitude: finalRoute[0][1],
            area_sqm: calculatedArea,
            time_period: timePeriod,
            area_polygon: JSON.stringify(finalCoords),
            activity_session_id: runningSessionId,
            distance_m: totalDist,
            duration_sec: durationSec,
            avg_speed_kmh: avgSpeed
          };

          const res = await client.api.territories.$post({ json: payload as any });
          if (res.ok) {
            const dataJson = await res.json() as any;
            if (dataJson.newAchievements) triggerAchievementUnlock(dataJson.newAchievements);
            if (dataJson.id) {
              setJustClaimedId(dataJson.id);
              setTimeout(() => setJustClaimedId(null), 5000);
            }
            const timeLabel = timePeriod === 'morning' ? '朝' : timePeriod === 'afternoon' ? '昼' : '夜';
            const modeLabel = isLoopDetected ? '囲まれた範囲' : '通り道（幅12m）の周辺';
            alert(`ルートの記録を終了し、${modeLabel}を支配領域として保存しました！\n面積: ${calculatedArea.toFixed(2)} ㎡\n時間帯: ${timeLabel}`);
            fetchTerritories();
            setBattleRefresh(v => v + 1);
            clearTrackingData();
            onRunSaved();
          } else {
            alert('距離記録は保存されましたが、領域の保存に失敗しました。オフライン記録は後送されません。');
            clearTrackingData();
            onRunSaved();
          }
        } catch (e) {
          console.error('Area calculation error:', e);
          alert('距離記録は保存されましたが、領域の計算に失敗しました。');
          clearTrackingData();
          onRunSaved();
        } finally {
          setIsSaving(false);
        }
      } else if (route.length > 0) {
        alert('走行距離を記録しました。領域を作るには走行距離が不足していました。');
        clearTrackingData();
        onRunSaved();
        setIsSaving(false);
      } else {
        clearTrackingData();
        setIsSaving(false);
      }
    } else {
      if (!navigator.geolocation) {
        alert('お使いの端末はGPSに対応していません。');
        return;
      }
      if (mapBattleId && !battleMap?.can_run) {
        alert('この対戦では計測を開始できません。対戦期間と参加資格を確認してください。');
        return;
      }
      const sessionId = await startOnlineRun(mapBattleId || undefined);
      if (!sessionId) return;
      setIsTracking(true);
      setRoute([]);
      setTrackingStartTime(Date.now());
      setCurrentDistance(0);
      setCurrentSpeed(0);
      setElapsedTime(0);

      localStorage.setItem(`physiproof_run_is_tracking_${uid}`, 'true');
      localStorage.setItem(`physiproof_run_session_id_${uid}`, sessionId);
      localStorage.setItem(`physiproof_run_route_${uid}`, JSON.stringify([]));
      localStorage.setItem(`physiproof_run_start_time_${uid}`, String(Date.now()));
      localStorage.setItem(`physiproof_run_distance_${uid}`, '0');
    }
  };

  const getPlayerRank = (lvl: number): string => {
    if (lvl >= 50) return 'COMMANDER';
    if (lvl >= 40) return 'COLONEL';
    if (lvl >= 30) return 'MAJOR';
    if (lvl >= 20) return 'CAPTAIN';
    if (lvl >= 10) return 'LIEUTENANT';
    return 'RECRUIT';
  };

  const currentUid = localStorage.getItem('physiproof_test_uid') || '';
  const ownTerritories = territories.filter(t => activityMode === 'team'
    ? t.team_id === currentUser.team_id
    : t.user_id === currentUid && (t.team_id === null || t.team_id === undefined));
  const totalOwnAreaSqm = ownTerritories.reduce((acc, t) => acc + (t.area_sqm || 0), 0);
  const totalOwnAreaSqKm = totalOwnAreaSqm / 1000000;
  const visibleOwnTerritories = [...ownTerritories]
    .sort((a, b) => new Date(b.captured_at || 0).getTime() - new Date(a.captured_at || 0).getTime())
    .filter((territory) => {
      const query = territorySearch.trim().toLocaleLowerCase();
      if (!query) return true;
      const location = territory.address || `${territory.latitude}, ${territory.longitude}`;
      return `${location} ${territory.area_sqm || 0}`.toLocaleLowerCase().includes(query);
    });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const displayedSpeed = currentSpeed > 0 
    ? currentSpeed 
    : (elapsedTime > 0 ? (currentDistance / 1000) / (elapsedTime / 3600) : 0);

  const displayedPace = displayedSpeed > 0.5
    ? (() => {
        const paceMinDecimal = 60 / displayedSpeed;
        const mins = Math.floor(paceMinDecimal);
        const secs = Math.floor((paceMinDecimal - mins) * 60);
        return `${mins}:${String(secs).padStart(2, '0')}/km`;
      })()
    : '--:--/km';

  const hudCss = `
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

    @keyframes scanline {
      0% { top: 0%; }
      50% { top: 100%; }
      100% { top: 0%; }
    }

    .hud-scanline {
      position: absolute;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(
        90deg, 
        rgba(0, 255, 136, 0) 0%, 
        rgba(0, 255, 136, 0.4) 20%, 
        rgba(0, 255, 136, 0.7) 50%, 
        rgba(0, 255, 136, 0.4) 80%, 
        rgba(0, 255, 136, 0) 100%
      );
      box-shadow: 0 0 6px rgba(0, 255, 136, 0.6);
      animation: scanline 8s linear infinite;
      pointer-events: none;
      z-index: 999;
    }

    .hud-grid {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background-image: 
        linear-gradient(rgba(0, 229, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 229, 255, 0.02) 1px, transparent 1px);
      background-size: 30px 30px;
      pointer-events: none;
      z-index: 998;
    }

    @keyframes neon-pulse-own {
      0% { filter: drop-shadow(0 0 3px #00ff88); opacity: 0.85; }
      100% { filter: drop-shadow(0 0 10px #00ff88); opacity: 0.95; }
    }

    @keyframes neon-pulse-other {
      0% { filter: drop-shadow(0 0 2px #ff007f); opacity: 0.7; }
      100% { filter: drop-shadow(0 0 7px #ff007f); opacity: 0.8; }
    }

    .leaflet-interactive.own-territory {
      animation: neon-pulse-own 3s infinite alternate !important;
    }
    .leaflet-interactive.other-territory {
      animation: neon-pulse-other 4s infinite alternate !important;
    }

    .hud-panel {
      background: rgba(6, 10, 20, 0.8);
      border: 1px solid rgba(0, 229, 255, 0.25);
      border-radius: 4px;
      padding: 10px 14px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #00e5ff;
      font-family: 'Share Tech Mono', 'Courier New', monospace;
      box-shadow: 0 0 15px rgba(0, 229, 255, 0.08), inset 0 0 8px rgba(0, 229, 255, 0.03);
      position: absolute;
      z-index: 1000;
      pointer-events: auto;
      user-select: none;
    }

    .hud-panel::before, .hud-panel::after {
      content: '';
      position: absolute;
      width: 6px;
      height: 6px;
      border-color: #00e5ff;
      border-style: solid;
      pointer-events: none;
    }
    .hud-panel::before {
      top: -1px; left: -1px;
      border-width: 1px 0 0 1px;
    }
    .hud-panel::after {
      bottom: -1px; right: -1px;
      border-width: 0 1px 1px 0;
    }
  `;

  return (
    <div style={{ textAlign: 'center' }}>
      <section style={{ marginBottom: '0.8rem', padding: '0.85rem', display: 'grid', gap: '0.55rem', textAlign: 'left', borderRadius: '12px', border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', color: '#aeb8c5', fontSize: '0.76rem' }}>
          <span>活動モード · {activityMode === 'team' ? `チーム用（${currentUser.team_name || '所属チーム'}）` : '個人用'}</span>
          <InfoHint label="活動モード" text="チーム活動の走行は個人距離とチーム貢献の両方に加算。個人活動は個人距離・個人領域のみ更新します。" />
        </div>
        {activityMode === 'team' && <label style={{ display: 'grid', gap: '.45rem', color: '#bfcbd9', fontSize: '.78rem' }}>表示・走行先のマップ
          <select aria-label="表示・走行先のマップ" value={mapBattleId} disabled={isTracking || isSaving} onChange={e => setSelectedBattleId(e.target.value)} style={{ width: '100%', minWidth: 0, fontSize: 16, padding: '.65rem', border: '1px solid #345', borderRadius: 8, color: '#fff', background: '#11131a' }}>
            <option value="">通常チームマップ（新しい対戦の距離得点なし）</option>
            {mapBattleId && !battleMaps.some(b => b.id === mapBattleId) && <option value={mapBattleId}>選択中の対戦</option>}
            {battleMaps.map(b => <option key={b.id} value={b.id}>{b.map_mode === 'isolated' ? '専用' : '共有'} · {b.participants.map(p => p.team_name).join(' / ')} · {new Date(b.starts_at).toLocaleDateString('ja-JP')}</option>)}
          </select>
        </label>}
        {mapBattleId && <div style={{ display: 'grid', gap: '.6rem' }}>
          {battleMapError ? <div role="alert" style={{ color: '#ff9898', fontSize: '.78rem' }}>{battleMapError}<button type="button" onClick={() => setBattleRefresh(v => v + 1)}>再読み込み</button></div> : !battleMap ? <span style={{ color: '#adb6c4', fontSize: '.78rem' }}>対戦マップを読み込み中…</span> : <>
            <div style={{ color: battleMap.battle.map_mode === 'shared' ? '#ffd58a' : '#42dfe5', fontSize: '.78rem' }}>{battleMap.battle.map_mode === 'shared' ? '共有型 · 対戦外チームの干渉あり' : '専用型 · 通常領域とは独立'} · スポット{battleMap.spots.length}個</div>
            <BattleRulesHelp battle={battleMap.battle} />
            {!battleMap.can_run && !isTracking && <span style={{ fontSize: '.75rem', color: '#ffd58a' }}>閲覧のみ。開始待ち・終了済み、または対戦登録メンバーではありません。</span>}
          </>}
        </div>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['personal', 'team'] as ActivityMode[]).map((mode) => (
            <button key={mode} type="button" disabled={isTracking || isSaving || (mode === 'team' && !currentUser.team_id)}
              onClick={() => setActivityMode(mode)}
              style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', border: `1px solid ${activityMode === mode ? '#00d4ff' : 'rgba(255,255,255,0.12)'}`, background: activityMode === mode ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.025)', color: activityMode === mode ? '#00e5ff' : '#b8c0cc', fontWeight: 800, cursor: isTracking ? 'not-allowed' : 'pointer', opacity: mode === 'team' && !currentUser.team_id ? 0.4 : 1 }}>
              {mode === 'personal' ? '個人活動' : 'チーム活動'}
            </button>
          ))}
        </div>
      </section>
      <div style={{ position: 'relative', width: 'calc(100% + 2rem)', marginLeft: '-1rem', overflow: 'hidden', borderRadius: '16px' }}>
        <style dangerouslySetInnerHTML={{ __html: hudCss }} />
        
        <div id="map-container" style={{
          width: '100%',
          height: 'calc(100vh - 240px)',
          minHeight: '350px',
          maxHeight: '600px',
          backgroundColor: '#000',
          border: `2px solid ${isTracking ? '#ff3b30' : isSaving ? '#00d4ff' : 'rgba(255,255,255,0.04)'}`,
          overflow: 'hidden',
          boxShadow: isTracking ? '0 0 30px rgba(255,59,48,0.2)' : isSaving ? '0 0 30px rgba(0,212,255,0.2)' : 'none',
          transition: 'border 0.3s, box-shadow 0.3s',
          borderRadius: '16px'
        }} />

        {mapStatus !== 'ready' && (
          <div
            role={mapStatus === 'offline' ? 'alert' : 'status'}
            aria-live="polite"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              maxWidth: 'min(90%, 360px)',
              padding: '12px 16px',
              border: '1px solid rgba(0, 229, 255, 0.35)',
              borderRadius: '12px',
              background: 'rgba(3, 10, 18, 0.92)',
              color: mapStatus === 'offline' ? '#ffcc00' : '#00e5ff',
              fontSize: '0.85rem',
              fontWeight: 700,
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            }}
          >
            {mapStatus === 'loading' && '地図データを読み込み中…'}
            {mapStatus === 'offline' && (
              <>
                <span>地図データに接続できません。通信状況を確認してください。</span>
                <button
                  type="button"
                  onClick={() => {
                    setMapStatus('loading');
                    setMapRetryKey(key => key + 1);
                  }}
                  style={{
                    border: '1px solid rgba(0, 229, 255, 0.55)',
                    borderRadius: '8px',
                    background: 'rgba(0, 229, 255, 0.12)',
                    color: '#00e5ff',
                    padding: '7px 12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  再試行
                </button>
              </>
            )}
          </div>
        )}

        {/* HUD装飾背景 */}
        <div className="hud-grid" />
        <div className="hud-scanline" />

        {/* HUD 左上: TERRITORY STATS */}
        <div className="hud-panel" style={{ top: '15px', left: '15px', width: '210px', textAlign: 'left' }}>
          <div style={{ fontSize: '0.55rem', color: 'rgba(0, 229, 255, 0.6)', letterSpacing: '1px', fontWeight: 'bold' }}>CURRENT TERRITORY:</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#00ff88', marginTop: '2px', fontFamily: 'monospace' }}>
            {totalOwnAreaSqKm.toFixed(6)} <span style={{ fontSize: '0.65rem' }}>sq km</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px solid rgba(0, 229, 255, 0.15)', paddingTop: '4px', fontSize: '0.55rem' }}>
            <span style={{ color: 'rgba(0, 229, 255, 0.5)' }}>PLAYERS ACTIVE:</span>
            <span style={{ fontWeight: 'bold', color: '#fff' }}>247</span>
          </div>
        </div>

        {/* HUD 左下: USER XP & RANK */}
        <div className="hud-panel" style={{ bottom: '15px', left: '15px', width: '180px', textAlign: 'left' }}>
          <div style={{ fontSize: '0.55rem', color: 'rgba(0, 229, 255, 0.6)', letterSpacing: '1px' }}>SCORE:</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#00ff88', fontFamily: 'monospace' }}>
            {(currentUser.xp || 0).toLocaleString()} <span style={{ fontSize: '0.6rem' }}>XP</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px solid rgba(0, 229, 255, 0.15)', paddingTop: '4px', fontSize: '0.55rem' }}>
            <span style={{ color: 'rgba(0, 229, 255, 0.5)' }}>RANK:</span>
            <span style={{ fontWeight: 'bold', color: '#00e5ff' }}>
              {getPlayerRank(currentUser.level || 1)} (Lvl {currentUser.level || 1})
            </span>
          </div>
        </div>

        {/* HUD 中央下: TRACKING DATA (トラッキング時のみ出現) */}
        {isTracking && (
          <div className="hud-panel" style={{ bottom: '15px', left: '50%', transform: 'translateX(-50%)', width: '280px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.5rem', color: 'rgba(0, 229, 255, 0.5)', letterSpacing: '0.5px' }}>PACER</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00ff88', fontFamily: 'monospace', marginTop: '2px' }}>{displayedPace}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px dashed rgba(0, 229, 255, 0.15)', borderRight: '1px dashed rgba(0, 229, 255, 0.15)' }}>
              <div style={{ fontSize: '0.5rem', color: 'rgba(0, 229, 255, 0.5)', letterSpacing: '0.5px' }}>DIST</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00ff88', fontFamily: 'monospace', marginTop: '2px' }}>
                {currentDistance >= 1000 
                  ? `${(currentDistance / 1000).toFixed(2)} km` 
                  : `${currentDistance.toFixed(0)} m`}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.5rem', color: 'rgba(0, 229, 255, 0.5)', letterSpacing: '0.5px' }}>TIME</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00ff88', fontFamily: 'monospace', marginTop: '2px' }}>{formatTime(elapsedTime)}</div>
            </div>
          </div>
        )}

        {/* HUD 右上: COMPASS SVG */}
        <div style={{ position: 'absolute', top: '15px', right: '15px', pointerEvents: 'none', zIndex: 1001, opacity: 0.85 }}>
          <svg width="50" height="50" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0, 229, 255, 0.12)" strokeWidth="1" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0, 229, 255, 0.25)" strokeWidth="1.5" strokeDasharray="6 3" />
            <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(0, 229, 255, 0.08)" strokeWidth="1" />
            
            <line x1="50" y1="5" x2="50" y2="15" stroke="rgba(0, 229, 255, 0.35)" strokeWidth="1" />
            <line x1="50" y1="85" x2="50" y2="95" stroke="rgba(0, 229, 255, 0.35)" strokeWidth="1" />
            <line x1="5" y1="50" x2="15" y2="50" stroke="rgba(0, 229, 255, 0.35)" strokeWidth="1" />
            <line x1="85" y1="50" x2="95" y2="50" stroke="rgba(0, 229, 255, 0.35)" strokeWidth="1" />
            
            <text x="50" y="25" fill="#00e5ff" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">N</text>
            <text x="50" y="81" fill="rgba(0, 229, 255, 0.4)" fontSize="7" textAnchor="middle" fontFamily="monospace">S</text>
            <text x="25" y="53" fill="rgba(0, 229, 255, 0.4)" fontSize="7" textAnchor="middle" fontFamily="monospace">W</text>
            <text x="75" y="53" fill="rgba(0, 229, 255, 0.4)" fontSize="7" textAnchor="middle" fontFamily="monospace">E</text>

            <g transform={`rotate(${heading || 0} 50 50)`}>
              <polygon points="50,15 45,50 50,45" fill="#00ff88" />
              <polygon points="50,15 55,50 50,45" fill="#00ff88" style={{ opacity: 0.7 }} />
              <polygon points="50,85 45,50 50,55" fill="rgba(0, 229, 255, 0.4)" />
              <polygon points="50,85 55,50 50,55" fill="rgba(0, 229, 255, 0.4)" style={{ opacity: 0.7 }} />
            </g>
            <circle cx="50" cy="50" r="3" fill="#00ff88" />
          </svg>
        </div>

        {/* GPS現在地追従ボタン */}
        <button
          onClick={toggleFollow}
          aria-label={isFollowing ? '現在地を追従中（タップで解除）' : '自由探索中（タップで現在地を追従）'}
          aria-pressed={isFollowing}
          title={isFollowing ? '現在地を追従中（タップで解除）' : '自由探索中（タップで現在地を追従）'}
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: isFollowing ? 'rgba(0, 212, 255, 0.2)' : 'rgba(10, 10, 10, 0.9)',
            border: `1.5px solid ${isFollowing ? '#00d4ff' : 'rgba(255,255,255,0.15)'}`,
            color: isFollowing ? '#00d4ff' : '#ffffff',
            fontSize: '1.1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isFollowing 
              ? '0 0 12px rgba(0,212,255,0.5), inset 0 0 6px rgba(0,212,255,0.3)' 
              : '0 4px 10px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            transition: 'all 0.25s ease',
            outline: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08)';
            if (!isFollowing) e.currentTarget.style.borderColor = '#00d4ff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            if (!isFollowing) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
          }}
        >
          <AppIcon name={isFollowing ? 'locate' : 'pin'} size={21} />
        </button>
      </div>

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
          <AppIcon name="globe" /> 全エリア
        </button>
        <button 
          type="button" 
          onClick={() => setViewMode('mine')} 
          style={toggleButtonStyle(viewMode === 'mine')}
        >
          <AppIcon name="user" /> マイエリア
        </button>
      </div>

      <button
        onClick={toggleTracking}
        disabled={isSaving || (!isTracking && !!mapBattleId && !battleMap?.can_run)}
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
        <AppIcon name={isSaving ? 'loading' : isTracking ? 'stop' : 'play'} className={isSaving ? 'pp-icon-spin' : ''} />{' '}
        {isSaving ? '処理中...' : isTracking ? '記録を終了して領域化' : 'ランニングを開始する'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.55rem' }}>
        <span style={{ alignSelf: 'center', marginRight: '0.35rem', color: '#8d98a8', fontSize: '0.68rem' }}>領域化ルール</span>
        <InfoHint label="領域化のルール" text="1周して囲むと内側全体を領域化し、囲まない場合は通ったルート（幅12m）が領域になります。平均速度40km/h超、または30km/h以上で歩数が不足する移動は、不正防止のため領域に反映されません。徒歩またはランニングで計測してください。" />
      </div>

      {!mapBattleId && <section style={{
        marginTop: '1.25rem',
        textAlign: 'left',
        background: 'rgba(10, 10, 10, 0.55)',
        border: '1px solid rgba(66,223,229,0.16)',
        borderRadius: '16px',
        padding: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.8rem' }}>
          <div>
            <div style={{ color: '#82909e', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em' }}>TERRITORY LOG</div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.15rem' }}>
              <strong style={{ color: '#f7f5ef', fontSize: '0.95rem' }}><AppIcon name="map" /> {activityMode === 'team' ? 'チーム領域' : '個人領域'}</strong>
              <span style={{ padding: '0.15rem 0.45rem', borderRadius: '999px', background: 'rgba(66,223,229,0.1)', color: '#42dfe5', fontSize: '0.68rem', fontWeight: 800 }}>
                {ownTerritories.length}件
              </span>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ color: '#82909e', fontSize: '0.62rem' }}>合計面積</div>
            <strong style={{ color: '#d7ff3f', fontSize: '0.88rem', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(totalOwnAreaSqm).toLocaleString('ja-JP')}㎡
            </strong>
          </div>
        </div>

        {ownTerritories.length > 0 ? (
          <>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
                住所または座標で領域を検索
              </span>
              <input
                type="search"
                value={territorySearch}
                onChange={(event) => setTerritorySearch(event.target.value)}
                placeholder="住所・座標で領域を検索"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.62rem 0.75rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '9px',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#f7f5ef',
                  fontSize: '16px',
                }}
              />
            </label>
            <div style={{ marginBottom: '0.45rem', color: '#82909e', fontSize: '0.65rem' }}>
              {territorySearch.trim() ? `${visibleOwnTerritories.length} / ${ownTerritories.length}件` : '新しい領域から表示 · タップで地図へ移動'}
            </div>
            {visibleOwnTerritories.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.4rem', maxHeight: 'min(40dvh, 360px)', overflowY: 'auto', paddingRight: '0.15rem' }}>
                {visibleOwnTerritories.map((territory, index) => {
                  const location = territory.address || `${territory.latitude.toFixed(4)}, ${territory.longitude.toFixed(4)}`;
                  const period = territory.time_period === 'morning' ? '朝' : territory.time_period === 'afternoon' ? '昼' : '夜';
                  const periodColor = territory.time_period === 'morning' ? '#d7ff3f' : territory.time_period === 'afternoon' ? '#42dfe5' : '#ff76b5';
                  const capturedDate = territory.captured_at ? new Date(territory.captured_at) : null;
                  const dateLabel = capturedDate && !Number.isNaN(capturedDate.getTime())
                    ? capturedDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
                    : '日時不明';

                  return (
                    <button
                      key={territory.id}
                      type="button"
                      onClick={() => {
                        if (mapInstance) {
                          mapInstance.setView([territory.latitude, territory.longitude], 17);
                          document.getElementById('map-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2rem minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '0.6rem',
                        width: '100%',
                        minWidth: 0,
                        padding: '0.62rem 0.65rem',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.025)',
                        color: 'inherit',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'grid', placeItems: 'center', width: '1.9rem', height: '1.9rem', borderRadius: '8px', background: 'rgba(215,255,63,0.08)', color: '#d7ff3f', fontSize: '0.7rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span style={{ display: 'block', minWidth: 0 }}>
                        <span title={location} style={{ display: 'block', overflow: 'hidden', color: '#f7f5ef', fontSize: '0.77rem', fontWeight: 700, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {location}
                        </span>
                        <span style={{ display: 'block', marginTop: '0.18rem', color: '#82909e', fontSize: '0.65rem' }}>
                          {dateLabel} · <span style={{ color: periodColor }}>{period}</span>
                        </span>
                      </span>
                      <span style={{ flexShrink: 0, color: '#42dfe5', fontSize: '0.75rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {Math.floor(territory.area_sqm || 0).toLocaleString('ja-JP')}㎡
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '1rem 0.5rem', color: '#82909e', textAlign: 'center', fontSize: '0.75rem' }}>
                条件に一致する領域がありません。
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '1.25rem 0.5rem', color: '#82909e', textAlign: 'center', fontSize: '0.78rem' }}>
            領域はまだありません。走って最初のエリアを獲得しましょう。
          </div>
        )}
      </section>}
      {mapBattleId && battleMap && <section style={{ marginTop: '1rem', padding: '1rem', borderRadius: 12, border: '1px solid #345', textAlign: 'left' }}>
        <h3 style={{ color: '#fff', fontSize: '.9rem' }}>対戦の領域・{battleMap.battle.display_status === 'completed' ? '確定得点' : '暫定得点'}</h3>
        {battleMap.battle.participants.map(p => <div key={p.team_id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '.5rem', padding: '.6rem 0', borderBottom: '1px solid #26323f', fontSize: '.8rem', color: '#bac8da' }}>
          <span>{p.team_name}</span><span>{p.score.toFixed(2)}pt · 領域{p.territory_delta_sqm.toFixed(0)}m² · 初回{p.captured_spots}個</span>
        </div>)}
        <small style={{ display: 'block', marginTop: '.6rem', color: '#8393a7' }}>地図のスポットをタップすると所有チームと初回獲得状態を確認できます。終了済みの得点は確定値です。</small>
      </section>}
    </div>
  );
};
export default MapView;
