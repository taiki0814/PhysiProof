import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../lib/hc';

type AdminSummary = {
  totalUsers: number;
  totalTerritories: number;
  totalExercises: number;
  totalArea: number;
};

type AdminUser = {
  id: string;
  login_id: string;
  password?: string;
  name: string;
  role: string;
  current_weight: number | null;
  target_weight: number | null;
  created_at: string;
};

type AdminTerritory = {
  id: string;
  user_id: string;
  user_name: string;
  latitude: number;
  longitude: number;
  area_polygon: string;
  area_sqm: number;
  fortification_level: number;
  captured_at: string;
  time_period: string;
  distance_m?: number | null;
  duration_sec?: number | null;
  avg_speed_kmh?: number | null;
  ai_integrity?: 'legitimate' | 'suspicious' | 'fraudulent' | null;
  ai_reason?: string | null;
  ai_confidence?: number | null;
  address?: string | null;
};

type AdminExercise = {
  id: number;
  user_id: string;
  user_name: string;
  exercise_type: string;
  count: number;
  timestamp: string;
  sensor_log: string;
  ai_integrity?: 'legitimate' | 'suspicious' | 'fraudulent' | null;
  ai_reason?: string | null;
  ai_confidence?: number | null;
};

type AdminMapViewProps = {
  territories: AdminTerritory[];
  users: AdminUser[];
};

const AdminMapView: React.FC<AdminMapViewProps> = ({ territories, users }) => {
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 検索ワードが変わって、選択中のユーザーがフィルタから外れた場合は選択を'all'に戻す
  useEffect(() => {
    if (selectedUserId !== 'all') {
      const match = users.find(u => u.id === selectedUserId);
      if (!match || !match.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        setSelectedUserId('all');
      }
    }
  }, [searchTerm, users, selectedUserId]);

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

      const mapContainer = document.getElementById('admin-map');
      if (mapContainer && (mapContainer as any)._leaflet_id) {
        return;
      }

      // 東京近郊をデフォルトビューに
      const map = L.map('admin-map').setView([35.6812, 139.7671], 11);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }).addTo(map);

      setMapInstance(map);
    }
  }, []);

  const getUniqueColor = (userId: string) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 85%, 60%)`;
  };

  useEffect(() => {
    if (!mapInstance) return;
    const L = (window as any).L;
    if (!L) return;

    const territoryLayers: any[] = [];

    const filtered = selectedUserId === 'all'
      ? territories
      : territories.filter(t => t.user_id === selectedUserId);

    filtered.forEach((t) => {
      try {
        const coords: [number, number][] = JSON.parse(t.area_polygon);
        if (!Array.isArray(coords) || coords.length < 2) return;

        let displayCoords = [...coords];
        if (displayCoords.length >= 3) {
          const first = displayCoords[0];
          const last = displayCoords[displayCoords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            displayCoords.push(first);
          }
        }

        const userColor = getUniqueColor(t.user_id);
        const fortificationStars = '🛡️'.repeat(Math.max(1, Math.min(5, t.fortification_level || 1)));

        const polyLayer = L.polygon(displayCoords, {
          color: userColor,
          fillColor: userColor,
          fillOpacity: 0.35,
          weight: 3,
        })
          .addTo(mapInstance)
          .bindPopup(`
            <div style="color: #fff; background: rgba(5,5,5,0.95); font-family: sans-serif; font-size: 0.82rem; padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 0 15px rgba(0,0,0,0.5); min-width: 180px;">
              <strong style="font-size: 0.95rem; color: ${userColor}; letter-spacing: 0.04em; display: block; margin-bottom: 6px;">
                🗺️ 占領領域
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

    if (filtered.length > 0) {
      const firstTerritory = filtered[0];
      if (selectedUserId !== 'all') {
        mapInstance.setView([firstTerritory.latitude, firstTerritory.longitude], 13);
      } else {
        mapInstance.setView([firstTerritory.latitude, firstTerritory.longitude], 11);
      }
    }

    return () => {
      territoryLayers.forEach((layer) => {
        mapInstance.removeLayer(layer);
      });
    };
  }, [territories, mapInstance, selectedUserId]);

  return (
    <div className="admin-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#00d4ff' }}>🗺️ 支配領域全エリアマップ</h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#8a8a93' }}>
            プラットフォーム上のすべての支配領域をマッピングします。ユーザーごとに色分けされています。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ユーザー名で検索..."
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: '0.8rem',
              outline: 'none',
              width: '160px'
            }}
          />
          <label style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold' }}>ユーザー選択:</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              backgroundColor: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: '0.8rem',
              outline: 'none',
              cursor: 'pointer',
              minWidth: '180px'
            }}
          >
            <option value="all">🌐 すべてのユーザーを表示</option>
            {users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase())).map((u) => (
              <option key={u.id} value={u.id}>
                👤 {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        id="admin-map"
        style={{
          width: '100%',
          height: '600px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          backgroundColor: '#050505',
          overflow: 'hidden'
        }}
      ></div>
    </div>
  );
};

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'summary' | 'users' | 'territories' | 'exercises' | 'settings' | 'map'>('summary');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [territories, setTerritories] = useState<AdminTerritory[]>([]);
  const [exercises, setExercises] = useState<AdminExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // audit modal states
  const [auditedExercise, setAuditedExercise] = useState<AdminExercise | null>(null);

  // password viewer states
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<AdminUser | null>(null);
  const [adminAuthInput, setAdminAuthInput] = useState({ adminId: '', adminPassword: '' });
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  // AI auditing state
  const [auditingIds, setAuditingIds] = useState<Record<number, boolean>>({});

  // search & filter states
  const [userSearch, setUserSearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [territoryAiFilter, setTerritoryAiFilter] = useState<'all' | 'legitimate' | 'suspicious' | 'fraudulent' | 'unaudited'>('all');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exerciseAiFilter, setExerciseAiFilter] = useState<'all' | 'legitimate' | 'suspicious' | 'fraudulent' | 'unaudited'>('all');
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<string>('all');

  // system settings states
  const [settings, setSettings] = useState<Record<string, string>>({ max_territories: '10000' });
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await client.api.admin.settings.$get();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      const res = await client.api.admin.settings.$post({
        json: {
          max_territories: settings.max_territories
        }
      });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        alert('システム設定を更新しました。');
      } else {
        alert(data.error || '設定の更新に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('設定の更新中にエラーが発生しました。');
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleRequestShowPassword = (user: AdminUser) => {
    setSelectedUserForPassword(user);
    setAdminAuthInput({ adminId: '', adminPassword: '' });
    setRevealedPassword(null);
  };

  const handleConfirmPasswordReveal = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminAuthInput.adminId === 'admin' && adminAuthInput.adminPassword === 'admin123') {
      setRevealedPassword(selectedUserForPassword?.password || 'パスワード未設定');
    } else {
      alert('管理者IDまたはパスワードが正しくありません。');
    }
  };

  const handleRunAiAudit = async (exerciseId: number) => {
    setAuditingIds(prev => ({ ...prev, [exerciseId]: true }));
    try {
      const res = await client.api.admin.exercises[':id'].audit.$post({
        param: { id: exerciseId.toString() }
      });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        alert(`AI監査完了: ${(data as any).integrity === 'legitimate' ? '正当' : (data as any).integrity === 'suspicious' ? '不審' : '不正'} と判定されました。`);
        await fetchAllData();
      } else {
        alert((data as any).error || 'AI監査に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('AI監査処理中に通信エラーが発生しました。');
    } finally {
      setAuditingIds(prev => ({ ...prev, [exerciseId]: false }));
    }
  };

  const [auditingTerritoryIds, setAuditingTerritoryIds] = useState<Record<string, boolean>>({});

  const handleRunTerritoryAiAudit = async (territoryId: string) => {
    setAuditingTerritoryIds(prev => ({ ...prev, [territoryId]: true }));
    try {
      const res = await client.api.admin.territories[':id'].audit.$post({
        param: { id: territoryId }
      });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        alert(`AI監査完了: ${(data as any).integrity === 'legitimate' ? '正当' : (data as any).integrity === 'suspicious' ? '不審' : '不正'} と判定されました。`);
        await fetchAllData();
      } else {
        alert((data as any).error || 'AI監査に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('AI監査処理中に通信エラーが発生しました。');
    } finally {
      setAuditingTerritoryIds(prev => ({ ...prev, [territoryId]: false }));
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch summary stats
      const summaryRes = await client.api.admin.summary.$get();
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      } else {
        throw new Error('統計データの取得に失敗しました');
      }

      // 2. Fetch users
      const usersRes = await client.api.admin.users.$get();
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData.users as unknown as AdminUser[]);
      }

      // 3. Fetch territories
      const terrRes = await client.api.admin.territories.$get();
      if (terrRes.ok) {
        const tData = await terrRes.json();
        setTerritories(tData.territories as unknown as AdminTerritory[]);
      }

      // 4. Fetch exercises
      const exRes = await client.api.admin.exercises.$get();
      if (exRes.ok) {
        const eData = await exRes.json();
        setExercises(eData.exercises as unknown as AdminExercise[]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'データ取得中に通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSettings();
    }
  }, [activeTab]);

  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`ユーザー「${name}」と、その関連データ（領土・運動記録）を完全に削除しますか？\n※この操作は取り消せません。`)) {
      return;
    }
    try {
      const res = await client.api.admin.users[':id'].$delete({ param: { id } });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        alert('ユーザーデータを完全に削除しました。');
        fetchAllData();
      } else {
        alert((data as any).error || 'ユーザーの削除に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('削除処理中にエラーが発生しました。');
    }
  };

  const handleDeleteTerritory = async (id: string) => {
    if (!window.confirm('この支配領域データを削除しますか？\n(所有権は直ちに失われます)')) {
      return;
    }
    try {
      const res = await client.api.admin.territories[':id'].$delete({ param: { id } });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        alert('支配領域を削除しました。');
        fetchAllData();
      } else {
        alert((data as any).error || '領土の削除に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('削除処理中にエラーが発生しました。');
    }
  };

  const handleDeleteExercise = async (id: number) => {
    if (!window.confirm('この運動実績データを削除しますか？\n(チートやバグ等で記録された異常値の修正に使用します)')) {
      return;
    }
    try {
      const res = await client.api.admin.exercises[':id'].$delete({ param: { id: id.toString() } });
      const data = await res.json();
      if (res.ok && (data as any).success) {
        alert('運動履歴を削除しました。');
        setAuditedExercise(null);
        fetchAllData();
      } else {
        alert((data as any).error || '履歴の削除に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('削除処理中にエラーが発生しました。');
    }
  };

  // computed filtered data
  const filteredUsers = users.filter(u => {
    const term = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(term) || u.login_id.toLowerCase().includes(term);
  });

  const filteredTerritories = territories.filter(t => {
    const matchesOwner = t.user_name.toLowerCase().includes(territorySearch.toLowerCase());
    let matchesAi = true;
    if (territoryAiFilter !== 'all') {
      if (territoryAiFilter === 'unaudited') {
        matchesAi = !t.ai_integrity;
      } else {
        matchesAi = t.ai_integrity === territoryAiFilter;
      }
    }
    return matchesOwner && matchesAi;
  });

  // Extract unique exercise types
  const uniqueExerciseTypes = Array.from(new Set(exercises.map(ex => ex.exercise_type)));

  const filteredExercises = exercises.filter(ex => {
    const matchesOwner = ex.user_name.toLowerCase().includes(exerciseSearch.toLowerCase());
    let matchesAi = true;
    if (exerciseAiFilter !== 'all') {
      if (exerciseAiFilter === 'unaudited') {
        matchesAi = !ex.ai_integrity;
      } else {
        matchesAi = ex.ai_integrity === exerciseAiFilter;
      }
    }
    const matchesType = exerciseTypeFilter === 'all' || ex.exercise_type === exerciseTypeFilter;
    return matchesOwner && matchesAi && matchesType;
  });

  // AI Integrity Aggregations for Charts
  const getAiIntegrityStats = (dataList: Array<{ ai_integrity?: string | null }>) => {
    let legitimate = 0;
    let suspicious = 0;
    let fraudulent = 0;
    let unaudited = 0;
    
    dataList.forEach(item => {
      if (item.ai_integrity === 'legitimate') legitimate++;
      else if (item.ai_integrity === 'suspicious') suspicious++;
      else if (item.ai_integrity === 'fraudulent') fraudulent++;
      else unaudited++;
    });
    
    const total = dataList.length || 1;
    return { legitimate, suspicious, fraudulent, unaudited, total };
  };

  const territoryStats = getAiIntegrityStats(territories);
  const exerciseStats = getAiIntegrityStats(exercises);

  const renderSvgDonut = (title: string, stats: { legitimate: number, suspicious: number, fraudulent: number, unaudited: number, total: number }) => {
    const r = 30;
    const circ = 2 * Math.PI * r;
    
    const pLegit = stats.legitimate / stats.total;
    const pSusp = stats.suspicious / stats.total;
    const pFraud = stats.fraudulent / stats.total;
    const pUn = stats.unaudited / stats.total;
    
    const sLegit = circ * pLegit;
    const sSusp = circ * pSusp;
    const sFraud = circ * pFraud;
    const sUn = circ * pUn;
    
    const oLegit = circ;
    const oSusp = circ - sLegit;
    const oFraud = circ - sLegit - sSusp;
    const oUn = circ - sLegit - sSusp - sFraud;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, minWidth: '280px', background: 'rgba(10, 10, 10, 0.4)', padding: '1.2rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.03)' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#ff007f', letterSpacing: '0.02em', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>{title}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="90" height="90" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="40" cy="40" r={r} fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
              
              {/* Unaudited */}
              {sUn > 0 && (
                <circle cx="40" cy="40" r={r} fill="transparent" 
                  stroke="rgba(255,255,255,0.1)" strokeWidth="8"
                  strokeDasharray={`${sUn} ${circ}`}
                  strokeDashoffset={oUn}
                />
              )}
              
              {/* Fraudulent */}
              {sFraud > 0 && (
                <circle cx="40" cy="40" r={r} fill="transparent" 
                  stroke="#ff4444" strokeWidth="8"
                  strokeDasharray={`${sFraud} ${circ}`}
                  strokeDashoffset={oFraud}
                />
              )}
              
              {/* Suspicious */}
              {sSusp > 0 && (
                <circle cx="40" cy="40" r={r} fill="transparent" 
                  stroke="#ffcc00" strokeWidth="8"
                  strokeDasharray={`${sSusp} ${circ}`}
                  strokeDashoffset={oSusp}
                />
              )}
              
              {/* Legitimate */}
              {sLegit > 0 && (
                <circle cx="40" cy="40" r={r} fill="transparent" 
                  stroke="#00ff88" strokeWidth="8"
                  strokeDasharray={`${sLegit} ${circ}`}
                  strokeDashoffset={oLegit}
                />
              )}
            </svg>
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1rem', fontWeight: '900', color: '#fff', fontFamily: "'Outfit', sans-serif" }}>
                {stats.total - stats.unaudited}
              </span>
              <span style={{ fontSize: '0.52rem', color: '#8a8a93', fontWeight: 'bold' }}>監査済</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00ff88', boxShadow: '0 0 6px #00ff88' }}></span>
              <span style={{ color: '#8a8a93', flex: 1 }}>正当:</span>
              <span style={{ fontWeight: 'bold', color: '#00ff88' }}>{stats.legitimate} ({Math.round(pLegit * 100)}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffcc00', boxShadow: '0 0 6px #ffcc00' }}></span>
              <span style={{ color: '#8a8a93', flex: 1 }}>不審:</span>
              <span style={{ fontWeight: 'bold', color: '#ffcc00' }}>{stats.suspicious} ({Math.round(pSusp * 100)}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ff4444', boxShadow: '0 0 6px #ff4444' }}></span>
              <span style={{ color: '#8a8a93', flex: 1 }}>不正:</span>
              <span style={{ fontWeight: 'bold', color: '#ff4444' }}>{stats.fraudulent} ({Math.round(pFraud * 100)}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }}></span>
              <span style={{ color: '#666', flex: 1 }}>未監査:</span>
              <span style={{ fontWeight: 'bold', color: '#888' }}>{stats.unaudited} ({Math.round(pUn * 100)}%)</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#030303', color: '#00ff88', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>🛡️ CONFIGURING ACCESS</div>
          <div style={{ color: '#8a8a93', fontSize: '0.85rem' }}>管理者システムにアクセス中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#030303',
      color: '#fff',
      fontFamily: "'Inter', 'Outfit', sans-serif",
      padding: '2rem',
      boxSizing: 'border-box'
    }}>
      <style>{`
        .admin-nav-btn {
          background: none; border: 1px solid rgba(255,255,255,0.06); padding: 0.75rem 1.25rem;
          color: #8a8a93; border-radius: 12px; cursor: pointer; font-weight: bold; font-size: 0.85rem;
          transition: all 0.2s ease; display: flex; align-items: center; gap: 6px;
        }
        .admin-nav-btn.active {
          color: #ff007f; border-color: #ff007f; background: rgba(255,0,127,0.04);
          box-shadow: 0 0 15px rgba(255,0,127,0.15);
        }
        .admin-nav-btn:hover:not(.active) {
          border-color: rgba(255,255,255,0.15); color: #fff;
        }
        .admin-card {
          background: rgba(10, 10, 10, 0.75); border: 1px solid rgba(255,255,255,0.04);
          border-radius: 20px; padding: 1.5rem; backdrop-filter: blur(16px);
        }
        .admin-table {
          width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;
        }
        .admin-table th {
          padding: 10px 12px; border-bottom: 2px solid rgba(255,255,255,0.08);
          color: #8a8a93; font-weight: bold;
        }
        .admin-table td {
          padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.04);
          color: #eee; vertical-align: middle;
        }
        .admin-badge {
          font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 6px;
        }
        .admin-badge-admin { background: rgba(255,0,127,0.15); color: #ff007f; border: 1px solid rgba(255,0,127,0.3); }
        .admin-badge-user { background: rgba(255,255,255,0.05); color: #8a8a93; border: 1px solid rgba(255,255,255,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem' }}>🛡️</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '900', margin: 0, background: 'linear-gradient(45deg, #ff007f, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
              PhysiProof 管理者コントロールセンター
            </h1>
          </div>
          <div style={{ color: '#8a8a93', fontSize: '0.8rem', marginTop: '4px' }}>プラットフォーム運用管理・不正検知・システム統計</div>
        </div>
        <Link to="/dashboard" style={{
          color: '#00ff88', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold',
          border: '1px solid #00ff88', padding: '6px 16px', borderRadius: '10px', transition: '0.2s',
          backgroundColor: 'rgba(0,255,136,0.04)'
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,255,136,0.12)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,255,136,0.04)'}
        >
          ← ユーザーアプリに戻る
        </Link>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', color: '#ff4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          ⚠️ エラーが発生しました: {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '4px' }}>
        <button className={`admin-nav-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>📊 概要・統計</button>
        <button className={`admin-nav-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>👥 ユーザー管理 ({users.length})</button>
        <button className={`admin-nav-btn ${activeTab === 'territories' ? 'active' : ''}`} onClick={() => setActiveTab('territories')}>🗺️ 支配領域管理 ({territories.length})</button>
        <button className={`admin-nav-btn ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>🌍 支配領域マップ</button>
        <button className={`admin-nav-btn ${activeTab === 'exercises' ? 'active' : ''}`} onClick={() => setActiveTab('exercises')}>💪 運動ログ監査 ({exercises.length})</button>
        <button className={`admin-nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ システム設定</button>
      </div>

      {/* Main Panel Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* SUMMARY TAB */}
        {activeTab === 'summary' && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Grid Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
              <div className="admin-card" style={{ borderLeft: '4px solid #00ff88' }}>
                <div style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold' }}>登録ユーザー総数</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', margin: '0.5rem 0' }}>{summary.totalUsers}</div>
                <div style={{ fontSize: '0.7rem', color: '#00ff88' }}>👥 Active Players</div>
              </div>
              <div className="admin-card" style={{ borderLeft: '4px solid #00d4ff' }}>
                <div style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold' }}>獲得された総領土数</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', margin: '0.5rem 0' }}>{summary.totalTerritories}</div>
                <div style={{ fontSize: '0.7rem', color: '#00d4ff' }}>📍 Dominated Regions</div>
              </div>
              <div className="admin-card" style={{ borderLeft: '4px solid #ff007f' }}>
                <div style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold' }}>蓄積された運動証明ログ</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', margin: '0.5rem 0' }}>{summary.totalExercises}</div>
                <div style={{ fontSize: '0.7rem', color: '#ff007f' }}>⚡ Sensor-proven Activities</div>
              </div>
              <div className="admin-card" style={{ borderLeft: '4px solid #ffcc00' }}>
                <div style={{ fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold' }}>全プレイヤーの総占有面積</div>
                <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#fff', margin: '0.5rem 0' }}>{Math.floor(summary.totalArea).toLocaleString()} <span style={{ fontSize: '1rem' }}>㎡</span></div>
                <div style={{ fontSize: '0.7rem', color: '#ffcc00' }}>🛡️ Landmass claimed</div>
              </div>
            </div>

            {/* AI Integrity Analytics Charts */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {renderSvgDonut('🗺️ 支配領域 AI整合性監査比率', territoryStats)}
              {renderSvgDonut('💪 運動ログ AI整合性監査比率', exerciseStats)}
            </div>

            {/* Health Indicators */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
              <div className="admin-card">
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#00ff88', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>💻 システム状態とヘルスステータス</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8a8a93' }}>Database (D1 Connection):</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>🟢 ONLINE / HEALTHY</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8a8a93' }}>Edge Runtime environment:</span>
                    <span style={{ color: '#eee' }}>Cloudflare Workers</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8a8a93' }}>AI API (Gemini Gateway):</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>🟢 READY</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8a8a93' }}>Device Integrity Service:</span>
                    <span style={{ color: '#eee' }}>Google Play Integrity Mock Mode</span>
                  </div>
                </div>
              </div>

              <div className="admin-card">
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#ff007f', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>🛡️ 管理者向けクイックノート</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#8a8a93', lineHeight: '1.6' }}>
                  本コントロールセンターは、運動不正行為の監査およびデータベースのメンテナンスをサポートします。<br/>
                  * <strong>「ユーザー管理」</strong>では、不正プレイヤーのBAN処理(データの物理削除)が可能です。<br/>
                  * <strong>「運動ログ監査」</strong>では、プレイヤーが送信した詳細な加速度・ジャイロの軌跡を確認できます。センサー変化の乏しい不正データは「削除」してランキングの健全性を保ってください。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="admin-card" style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>登録プレイヤー一覧</h3>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="プレイヤー名またはIDで検索..."
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', transition: 'all 0.2s', width: '220px'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#ff007f'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <span style={{ fontSize: '0.75rem', color: '#8a8a93', fontWeight: 'bold' }}>
                  {filteredUsers.length}名
                </span>
              </div>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>表示名</th>
                  <th>ログインID</th>
                  <th>パスワード</th>
                  <th>権限</th>
                  <th>現在体重</th>
                  <th>目標体重</th>
                  <th>登録日時</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 'bold' }}>👤 {u.name}</td>
                    <td><code>{u.login_id}</code></td>
                    <td>
                      <button
                        onClick={() => handleRequestShowPassword(u)}
                        style={{
                          backgroundColor: 'rgba(255, 204, 0, 0.1)', color: '#ffcc00', border: '1px solid rgba(255, 204, 0, 0.2)',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 'bold'
                        }}
                      >
                        🔑 表示
                      </button>
                    </td>
                    <td>
                      <span className={`admin-badge ${u.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-user'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td>{u.current_weight ? `${u.current_weight} kg` : '-'}</td>
                    <td>{u.target_weight ? `${u.target_weight} kg` : '-'}</td>
                    <td>{new Date(u.created_at).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        disabled={u.role === 'admin'}
                        style={{
                          backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold',
                          cursor: u.role === 'admin' ? 'not-allowed' : 'pointer', opacity: u.role === 'admin' ? 0.3 : 1
                        }}
                      >
                        🚫 アカウント削除 (BAN)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TERRITORIES TAB */}
        {activeTab === 'territories' && (
          <div className="admin-card" style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>アクティブな占有領域</h3>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={territorySearch}
                  onChange={e => setTerritorySearch(e.target.value)}
                  placeholder="所有者名で検索..."
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', transition: 'all 0.2s', width: '160px'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#00d4ff'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <select
                  value={territoryAiFilter}
                  onChange={e => setTerritoryAiFilter(e.target.value as any)}
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="all">すべてのAI監査</option>
                  <option value="legitimate">🟢 おおむね正当</option>
                  <option value="suspicious">🟡 不審/怪しい</option>
                  <option value="fraudulent">🔴 不正判定</option>
                  <option value="unaudited">⏳ 未監査</option>
                </select>
                <span style={{ fontSize: '0.75rem', color: '#8a8a93', fontWeight: 'bold' }}>
                  {filteredTerritories.length}件
                </span>
              </div>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>所有者</th>
                  <th>住所</th>
                  <th>時間帯</th>
                  <th>面積</th>
                  <th>移動速度 (距離)</th>
                  <th>AI監査</th>
                  <th>防衛レベル</th>
                  <th>占領日時</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredTerritories.map(t => (
                  <tr key={t.id}>
                    <td><code>{t.id.slice(0, 8)}...</code></td>
                    <td style={{ fontWeight: 'bold', color: '#00ff88' }}>👤 {t.user_name}</td>
                    <td>{t.address || `(${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)})`}</td>
                    <td>
                      <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.06)', color: '#aaa' }}>
                        {t.time_period === 'morning' ? '朝' : t.time_period === 'afternoon' ? '昼' : t.time_period === 'night' ? '夜' : '全'}
                      </span>
                    </td>
                    <td>{Math.floor(t.area_sqm)} ㎡</td>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: '#ccc' }}>
                        {t.avg_speed_kmh != null ? `${t.avg_speed_kmh.toFixed(1)} km/h` : '-'}
                      </span>
                      {t.distance_m != null && (
                        <div style={{ fontSize: '0.68rem', color: '#8a8a93', marginTop: '2px' }}>
                          ({(t.distance_m / 1000).toFixed(2)} km)
                        </div>
                      )}
                    </td>
                    <td>
                      {t.ai_integrity ? (
                        <span style={{
                          fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold',
                          backgroundColor: t.ai_integrity === 'legitimate' ? 'rgba(0,255,136,0.1)' : t.ai_integrity === 'suspicious' ? 'rgba(255,204,0,0.1)' : 'rgba(255,68,68,0.1)',
                          color: t.ai_integrity === 'legitimate' ? '#00ff88' : t.ai_integrity === 'suspicious' ? '#ffcc00' : '#ff4444',
                          display: 'inline-block', cursor: 'help'
                        }} title={t.ai_reason || ''}>
                          {t.ai_integrity === 'legitimate' ? '🟢 おおむね正当' : t.ai_integrity === 'suspicious' ? '🟡 不審/怪しい' : '🔴 不正判定'}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRunTerritoryAiAudit(t.id)}
                          disabled={auditingTerritoryIds[t.id]}
                          style={{
                            backgroundColor: 'rgba(255, 0, 127, 0.1)', color: '#ff007f', border: '1px solid rgba(255, 0, 127, 0.2)',
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer',
                            opacity: auditingTerritoryIds[t.id] ? 0.5 : 1
                          }}
                        >
                          {auditingTerritoryIds[t.id] ? '⏳ 判定中...' : '🤖 AI監査'}
                        </button>
                      )}
                    </td>
                    <td style={{ color: '#ffcc00', fontWeight: 'bold' }}>🛡️ Lv.{t.fortification_level}</td>
                    <td>{new Date(t.captured_at).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteTerritory(t.id)}
                        style={{
                          backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer'
                        }}
                      >
                        🗑️ 領土没収
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* EXERCISES TAB */}
        {activeTab === 'exercises' && (
          <div className="admin-card" style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>最近の運動履歴とセンサーデータ</h3>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={e => setExerciseSearch(e.target.value)}
                  placeholder="所有者名で検索..."
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', transition: 'all 0.2s', width: '130px'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#00ff88'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <select
                  value={exerciseAiFilter}
                  onChange={e => setExerciseAiFilter(e.target.value as any)}
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="all">すべてのAI監査</option>
                  <option value="legitimate">🟢 おおむね正当</option>
                  <option value="suspicious">🟡 不審/怪しい</option>
                  <option value="fraudulent">🔴 不正判定</option>
                  <option value="unaudited">⏳ 未監査</option>
                </select>
                <select
                  value={exerciseTypeFilter}
                  onChange={e => setExerciseTypeFilter(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="all">すべての種目</option>
                  {uniqueExerciseTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: '#8a8a93', fontWeight: 'bold' }}>
                  {filteredExercises.length}件
                </span>
              </div>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>所有者</th>
                  <th>種目</th>
                  <th>回数</th>
                  <th>記録日時</th>
                  <th>AI監査</th>
                  <th>センサーデータ検証</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredExercises.map(ex => {
                  let points: any[] = [];
                  try {
                    points = JSON.parse(ex.sensor_log);
                  } catch (e) {}

                  return (
                    <tr key={ex.id}>
                      <td style={{ fontWeight: 'bold' }}>👤 {ex.user_name}</td>
                      <td><code>{ex.exercise_type}</code></td>
                      <td style={{ fontWeight: 'bold', color: '#00ff88' }}>{ex.count} 回</td>
                      <td>{new Date(ex.timestamp).toLocaleString()}</td>
                      <td>
                        {ex.ai_integrity ? (
                          <span style={{
                            fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold',
                            backgroundColor: ex.ai_integrity === 'legitimate' ? 'rgba(0,255,136,0.1)' : ex.ai_integrity === 'suspicious' ? 'rgba(255,204,0,0.1)' : 'rgba(255,68,68,0.1)',
                            color: ex.ai_integrity === 'legitimate' ? '#00ff88' : ex.ai_integrity === 'suspicious' ? '#ffcc00' : '#ff4444',
                            display: 'inline-block', cursor: 'help'
                          }} title={ex.ai_reason || ''}>
                            {ex.ai_integrity === 'legitimate' ? '🟢 おおむね正当' : ex.ai_integrity === 'suspicious' ? '🟡 不審/怪しい' : '🔴 不正判定'}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRunAiAudit(ex.id)}
                            disabled={auditingIds[ex.id]}
                            style={{
                              backgroundColor: 'rgba(255, 0, 127, 0.1)', color: '#ff007f', border: '1px solid rgba(255, 0, 127, 0.2)',
                              padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer',
                              opacity: auditingIds[ex.id] ? 0.5 : 1
                            }}
                          >
                            {auditingIds[ex.id] ? '⏳ 判定中...' : '🤖 AI監査を実行'}
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => setAuditedExercise(ex)}
                          style={{
                            backgroundColor: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.2)',
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer'
                          }}
                        >
                          📈 ログ解析 ({points.length} 軸点)
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteExercise(ex.id)}
                          style={{
                            backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)',
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer'
                          }}
                        >
                          🗑️ 履歴削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* MAP TAB */}
        {activeTab === 'map' && (
          <AdminMapView territories={territories} users={users} />
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="admin-card" style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1rem', color: '#00d4ff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>⚙️ プラットフォーム・システム設定</h3>
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#8a8a93', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  支配領域の最大保有上限数（ユーザーあたり）
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    value={settings.max_territories}
                    onChange={(e) => setSettings({ ...settings, max_territories: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      color: '#fff',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    min="1"
                    required
                  />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>個</span>
                </div>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.7rem', color: '#666', lineHeight: '1.4' }}>
                  ※ 基本上限なしで運用する場合は、`10000` などの大きな数値を設定してください。<br/>
                  ユーザーが保有する支配領域 of 合計がこの上限を超える場合、新しい領域の追加（マージされない独立領土の獲得）はブロックされます。
                </p>
              </div>

              <button
                type="submit"
                disabled={updatingSettings}
                style={{
                  backgroundColor: updatingSettings ? '#222' : '#00d4ff',
                  color: '#030303',
                  border: 'none',
                  padding: '0.9rem',
                  borderRadius: '12px',
                  fontWeight: '900',
                  fontSize: '0.9rem',
                  cursor: updatingSettings ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: updatingSettings ? 'none' : '0 8px 24px rgba(0,212,255,0.2)'
                }}
              >
                {updatingSettings ? '⏳ 設定を保存中...' : '💾 設定を保存する'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* SENSOR LOG AUDIT MODAL */}
      {auditedExercise && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="admin-card" style={{ width: '100%', maxWidth: '600px', backgroundColor: '#0a0a0a', border: '1px solid #ff007f33' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#ff007f', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📊 センサーデータ詳細監査: {auditedExercise.user_name}</span>
              <button
                onClick={() => setAuditedExercise(null)}
                style={{ background: 'none', border: 'none', color: '#8a8a93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.8rem' }}>
              <div>
                <strong>プレイヤー:</strong> {auditedExercise.user_name} (UID: <code>{auditedExercise.user_id}</code>)<br/>
                <strong>種目 / 回数:</strong> {auditedExercise.exercise_type} / <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{auditedExercise.count}回</span><br/>
                <strong>記録時間:</strong> {new Date(auditedExercise.timestamp).toLocaleString()}
              </div>

              <div style={{
                backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px', padding: '10px', marginTop: '0.2rem'
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#ff007f', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🤖 AI 整合性監査 (Gemini)</span>
                  {auditingIds[auditedExercise.id] ? (
                    <span style={{ fontSize: '0.72rem', color: '#aaa' }}>監査実行中...</span>
                  ) : (
                    <button
                      onClick={async () => {
                        await handleRunAiAudit(auditedExercise.id);
                        try {
                          const res = await client.api.admin.exercises.$get();
                          if (res.ok) {
                            const eData = await res.json();
                            const list = eData.exercises as unknown as AdminExercise[];
                            const found = list.find(x => x.id === auditedExercise.id);
                            if (found) setAuditedExercise(found);
                          }
                        } catch (e) {}
                      }}
                      style={{
                        backgroundColor: 'rgba(255,0,127,0.1)', color: '#ff007f', border: '1px solid rgba(255,0,127,0.2)',
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 'bold'
                      }}
                    >
                      {auditedExercise.ai_integrity ? '🤖 再監査を実行' : '🤖 AI監査を実行'}
                    </button>
                  )}
                </div>
                {auditedExercise.ai_integrity ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold',
                        backgroundColor: auditedExercise.ai_integrity === 'legitimate' ? 'rgba(0,255,136,0.15)' : auditedExercise.ai_integrity === 'suspicious' ? 'rgba(255,204,0,0.15)' : 'rgba(255,68,68,0.15)',
                        color: auditedExercise.ai_integrity === 'legitimate' ? '#00ff88' : auditedExercise.ai_integrity === 'suspicious' ? '#ffcc00' : '#ff4444'
                      }}>
                        {auditedExercise.ai_integrity === 'legitimate' ? '🟢 おおむね正当' : auditedExercise.ai_integrity === 'suspicious' ? '🟡 判定保留/不審' : '🔴 不正判定'}
                      </span>
                      <span style={{ color: '#8a8a93', fontSize: '0.72rem' }}>
                        信頼度: {((auditedExercise.ai_confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ color: '#ccc', fontSize: '0.75rem', lineHeight: '1.4', marginTop: '4px' }}>
                      <strong>AI分析理由:</strong> {auditedExercise.ai_reason}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#8a8a93', fontSize: '0.75rem' }}>
                    このデータはまだAIによる自動整合性検証が行われていません。
                  </div>
                )}
              </div>

              {/* Raw Data Chart or table preview */}
              <div style={{
                backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px',
                padding: '1rem', maxHeight: '250px', overflowY: 'auto', fontFamily: 'monospace'
              }}>
                <div style={{ fontSize: '0.72rem', color: '#8a8a93', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                  Index | Acceleration (X, Y, Z) | Gyro (GX, GY)
                </div>
                {(() => {
                  try {
                    const logs = JSON.parse(auditedExercise.sensor_log);
                    if (!Array.isArray(logs) || logs.length === 0) {
                      return <div style={{ color: '#ff4444' }}>データポイントが見つかりません。</div>;
                    }
                    return logs.map((log: any, idx: number) => {
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#ccc', fontSize: '0.75rem', borderBottom: '1px dashed rgba(255,255,255,0.02)', padding: '2px 0' }}>
                          <span>#{String(idx).padStart(3, '0')}</span>
                          <span>X: {log.x?.toFixed(2)} | Y: {log.y?.toFixed(2)} | Z: {log.z?.toFixed(2)}</span>
                          <span>GX: {log.gx?.toFixed(2) || '0.00'} | GY: {log.gy?.toFixed(2) || '0.00'}</span>
                        </div>
                      );
                    });
                  } catch (e) {
                    return <div style={{ color: '#ff4444' }}>センサーログのデコードに失敗しました。</div>;
                  }
                })()}
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  onClick={() => setAuditedExercise(null)}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#8a8a93', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  閉じる
                </button>
                <button
                  onClick={() => handleDeleteExercise(auditedExercise.id)}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', backgroundColor: '#ff4444', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  🗑️ 異常データとして削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD UNLOCK MODAL */}
      {selectedUserForPassword && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="admin-card" style={{ width: '100%', maxWidth: '400px', backgroundColor: '#0a0a0a', border: '1px solid #ff007f33' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#ff007f', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🔑 パスワード確認ロック解除</span>
              <button
                onClick={() => setSelectedUserForPassword(null)}
                style={{ background: 'none', border: 'none', color: '#8a8a93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </h3>

            {revealedPassword ? (
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center', border: '1px dashed #00ff8844', borderRadius: '8px', backgroundColor: 'rgba(0,255,136,0.02)', margin: '1rem 0' }}>
                <div style={{ fontSize: '0.8rem', color: '#8a8a93', marginBottom: '0.5rem' }}>
                  ユーザー「{selectedUserForPassword.name}」のパスワード
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff88', letterSpacing: '2px', fontFamily: 'monospace' }}>
                  {revealedPassword}
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmPasswordReveal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#8a8a93' }}>
                  セキュリティロック解除のため、管理者IDとパスワードを入力してください。
                </p>
                <div>
                  <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>管理者ID</label>
                  <input
                    type="text"
                    required
                    value={adminAuthInput.adminId}
                    onChange={e => setAdminAuthInput({ ...adminAuthInput, adminId: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box'
                    }}
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>管理者パスワード</label>
                  <input
                    type="password"
                    required
                    value={adminAuthInput.adminPassword}
                    onChange={e => setAdminAuthInput({ ...adminAuthInput, adminPassword: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box'
                    }}
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '10px', borderRadius: '8px', backgroundColor: '#ff007f', color: '#fff',
                    border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', marginTop: '0.5rem'
                  }}
                >
                  🔓 認証して表示
                </button>
              </form>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => setSelectedUserForPassword(null)}
                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#8a8a93', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
