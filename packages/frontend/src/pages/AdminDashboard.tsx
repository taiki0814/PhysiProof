import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../lib/hc';
import { ACHIEVEMENT_DEFINITIONS } from '@my-app/shared';

type AdminUnlockedAchievement = {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
};

type AdminUserWithAchievement = {
  id: string;
  name: string;
};


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
  target_calories_burned?: number | null;
  target_calories_consumed?: number | null;
  gender?: string | null;
  age?: number | null;
  height?: number | null;
  level?: number;
  xp?: number;
  status_points?: number;
  stat_str?: number;
  stat_agi?: number;
  stat_def?: number;
  stat_vit?: number;
  created_at: string;
};

type AdminNotification = {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  message: string;
  type: string;
  is_read: number;
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
              <strong>占領日時:</strong> ${new Date(t.captured_at).toLocaleString()}
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
  const [activeTab, setActiveTab] = useState<'summary' | 'users' | 'territories' | 'exercises' | 'settings' | 'map' | 'achievements' | 'api-usage' | 'notifications' | 'design-docs'>('summary');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [territories, setTerritories] = useState<AdminTerritory[]>([]);
  const [exercises, setExercises] = useState<AdminExercise[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AdminUnlockedAchievement[]>([]);
  const [achievementUsers, setAchievementUsers] = useState<AdminUserWithAchievement[]>([]);
  const [achievementSearch, setAchievementSearch] = useState('');
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

  // user editing states
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminUser>>({});
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // notifications state
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsSearch, setNotificationsSearch] = useState('');
  const [showSendNotificationModal, setShowSendNotificationModal] = useState(false);
  const [sendNotificationForm, setSendNotificationForm] = useState({
    user_id: '',
    title: '',
    message: '',
    type: 'admin_alert' as 'level_up' | 'territory_lost' | 'system' | 'admin_alert'
  });
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  // search & filter states
  const [userSearch, setUserSearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [territoryAiFilter, setTerritoryAiFilter] = useState<'all' | 'legitimate' | 'suspicious' | 'fraudulent' | 'unaudited'>('all');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exerciseAiFilter, setExerciseAiFilter] = useState<'all' | 'legitimate' | 'suspicious' | 'fraudulent' | 'unaudited'>('all');
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<string>('all');

  // API usage stats
  type ApiUsageSummary = { api_type: string; total_calls: number; success_count: number; error_count: number; avg_response_ms: number };
  type ApiUsageByEndpoint = { api_type: string; endpoint: string; total_calls: number; success_count: number; error_count: number; avg_response_ms: number };
  type ApiUsageDaily = { date: string; api_type: string; total_calls: number; error_count: number };
  type ApiUsageError = { id: string; api_type: string; endpoint: string; error_message: string; response_time_ms: number; created_at: string };
  const [apiUsageSummary, setApiUsageSummary] = useState<ApiUsageSummary[]>([]);
  const [apiUsageByEndpoint, setApiUsageByEndpoint] = useState<ApiUsageByEndpoint[]>([]);
  const [apiUsageDaily, setApiUsageDaily] = useState<ApiUsageDaily[]>([]);
  const [apiUsageErrors, setApiUsageErrors] = useState<ApiUsageError[]>([]);
  const [apiUsageLoading, setApiUsageLoading] = useState(false);

  // system settings states
  const [settings, setSettings] = useState<Record<string, string>>({ max_territories: '10000', battle_distance_points_per_km: '1', battle_territory_points_per_1000_sqm: '1', show_meal_menu: 'true' });
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await client.api.admin.settings.$get();
      if (res.ok) {
        const data = await res.json() as any;
        if (data.settings) {
          setSettings({ battle_distance_points_per_km: '1', battle_territory_points_per_1000_sqm: '1', ...data.settings });
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
          max_territories: settings.max_territories,
          battle_distance_points_per_km: settings.battle_distance_points_per_km || '1',
          battle_territory_points_per_1000_sqm: settings.battle_territory_points_per_1000_sqm || '1',
          show_home_menu: settings.show_home_menu !== 'false' ? 'true' : 'false',
          show_map_menu: settings.show_map_menu !== 'false' ? 'true' : 'false',
          show_exercise_menu: 'false',
          show_ai_predict_menu: settings.show_ai_predict_menu !== 'false' ? 'true' : 'false',
          show_meal_menu: settings.show_meal_menu !== 'false' ? 'true' : 'false',
          show_friends_menu: settings.show_friends_menu !== 'false' ? 'true' : 'false',
          show_team_menu: settings.show_team_menu !== 'false' ? 'true' : 'false',
          show_ranking_menu: settings.show_ranking_menu !== 'false' ? 'true' : 'false',
          show_chat_menu: settings.show_chat_menu !== 'false' ? 'true' : 'false',
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

      // 5. Fetch achievements
      const achRes = await client.api.admin.achievements.$get();
      if (achRes.ok) {
        const aData = await achRes.json() as any;
        setUnlockedAchievements(aData.achievements || []);
        setAchievementUsers(aData.users || []);
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

  const fetchApiUsage = async () => {
    setApiUsageLoading(true);
    try {
      const res = await client.api.admin['api-usage'].$get();
      if (res.ok) {
        const data = await res.json() as any;
        setApiUsageSummary(data.summary || []);
        setApiUsageByEndpoint(data.byEndpoint || []);
        setApiUsageDaily(data.daily || []);
        setApiUsageErrors(data.recentErrors || []);
      }
    } catch (e) {
      console.error('Failed to fetch API usage:', e);
    } finally {
      setApiUsageLoading(false);
    }
  };

  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await client.api.admin.notifications.$get();
      if (res.ok) {
        const data = await res.json() as any;
        setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('この通知を削除しますか？\n(ユーザーの画面からも即座に消去されます)')) {
      return;
    }
    try {
      const res = await client.api.admin.notifications[':id'].$delete({ param: { id } });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        alert('通知を削除しました。');
        fetchNotifications();
      } else {
        alert(data.error || '通知の削除に失敗しました。');
      }
    } catch (e) {
      console.error('Failed to delete notification:', e);
      alert('削除処理中に通信エラーが発生しました。');
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendNotificationForm.user_id) {
      alert('送信先ユーザーを選択してください。');
      return;
    }
    setIsSendingNotification(true);
    try {
      const res = await client.api.admin.notifications.$post({
        json: sendNotificationForm
      });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        alert('通知を正常に送信しました。');
        setShowSendNotificationModal(false);
        setSendNotificationForm({ user_id: '', title: '', message: '', type: 'admin_alert' });
        fetchNotifications();
      } else {
        alert(data.error || '通知の送信に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('通知送信中にエラーが発生しました。');
    } finally {
      setIsSendingNotification(false);
    }
  };

  const handleOpenEditModal = (user: AdminUser) => {
    setSelectedUserForEdit(user);
    setEditForm({
      name: user.name,
      role: user.role,
      level: user.level ?? 1,
      xp: user.xp ?? 0,
      status_points: user.status_points ?? 0,
      stat_str: user.stat_str ?? 10,
      stat_agi: user.stat_agi ?? 10,
      stat_def: user.stat_def ?? 10,
      stat_vit: user.stat_vit ?? 10,
      current_weight: user.current_weight,
      target_weight: user.target_weight,
      target_calories_burned: user.target_calories_burned,
      target_calories_consumed: user.target_calories_consumed,
      gender: user.gender,
      age: user.age,
      height: user.height,
    });
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;
    setIsUpdatingUser(true);
    try {
      const res = await client.api.admin.users[':id'].$post({
        param: { id: selectedUserForEdit.id },
        json: {
          name: editForm.name || undefined,
          role: (editForm.role as any) || undefined,
          level: editForm.level != null ? Number(editForm.level) : undefined,
          xp: editForm.xp != null ? Number(editForm.xp) : undefined,
          status_points: editForm.status_points != null ? Number(editForm.status_points) : undefined,
          stat_str: editForm.stat_str != null ? Number(editForm.stat_str) : undefined,
          stat_agi: editForm.stat_agi != null ? Number(editForm.stat_agi) : undefined,
          stat_def: editForm.stat_def != null ? Number(editForm.stat_def) : undefined,
          stat_vit: editForm.stat_vit != null ? Number(editForm.stat_vit) : undefined,
          current_weight: editForm.current_weight != null ? Number(editForm.current_weight) : null,
          target_weight: editForm.target_weight != null ? Number(editForm.target_weight) : null,
          target_calories_burned: editForm.target_calories_burned != null ? Number(editForm.target_calories_burned) : null,
          target_calories_consumed: editForm.target_calories_consumed != null ? Number(editForm.target_calories_consumed) : null,
          gender: editForm.gender || null,
          age: editForm.age != null ? Number(editForm.age) : null,
          height: editForm.height != null ? Number(editForm.height) : null,
        } as any
      });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        alert('ユーザー情報を更新しました。');
        setSelectedUserForEdit(null);
        fetchAllData();
      } else {
        alert(data.error || 'ユーザー情報の更新に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      alert('更新処理中にエラーが発生しました。');
    } finally {
      setIsUpdatingUser(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSettings();
    }
    if (activeTab === 'api-usage') {
      fetchApiUsage();
    }
    if (activeTab === 'notifications') {
      fetchNotifications();
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
        <button className={`admin-nav-btn ${activeTab === 'achievements' ? 'active' : ''}`} onClick={() => setActiveTab('achievements')}>🏆 実績管理</button>
        <button className={`admin-nav-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>🔔 通知管理</button>
        <button className={`admin-nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ システム設定</button>
        <button className={`admin-nav-btn ${activeTab === 'api-usage' ? 'active' : ''}`} onClick={() => setActiveTab('api-usage')}>📡 API使用状況</button>
        <button className={`admin-nav-btn ${activeTab === 'design-docs' ? 'active' : ''}`} onClick={() => setActiveTab('design-docs')}>📄 設計資料</button>
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
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#ff007f' }}>👥 登録プレイヤー一覧</h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#8a8a93' }}>
                  プレイヤーのアカウント設定、レベル、獲得経験値、およびRPG各種ステータスの参照・変更ができます。
                </p>
              </div>
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
                  <th style={{ minWidth: '180px' }}>プレイヤー情報</th>
                  <th style={{ minWidth: '220px' }}>RPG ステータス (レベル/能力値)</th>
                  <th style={{ minWidth: '200px' }}>体重 ＆ カロリー目標</th>
                  <th style={{ minWidth: '180px' }}>身体データ ＆ 登録日</th>
                  <th style={{ textAlign: 'right', minWidth: '230px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const xpMax = (u.level || 1) * 100;
                  const xpPct = Math.min(100, Math.max(0, ((u.xp || 0) / xpMax) * 100));

                  return (
                    <tr key={u.id}>
                      {/* Column 1: Profile & Role */}
                      <td>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>👤 {u.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <span className={`admin-badge ${u.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-user'}`}>
                            {u.role.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'monospace' }}>ID: {u.login_id}</span>
                        </div>
                      </td>

                      {/* Column 2: RPG parameters */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 'bold', color: '#ffcc00', fontSize: '0.85rem' }}>🛡️ Lv.{u.level || 1}</span>
                          <span style={{ fontSize: '0.75rem', color: '#8a8a93' }}>{u.xp || 0} / {xpMax} XP</span>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: '4px', width: '130px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px', marginBottom: '6px' }}>
                          <div style={{ width: `${xpPct}%`, height: '100%', background: 'linear-gradient(90deg, #ff007f, #00d4ff)', borderRadius: '2px' }} />
                        </div>
                        {/* Attributes grid */}
                        <div style={{ fontSize: '0.72rem', color: '#aaa', display: 'flex', flexWrap: 'wrap', gap: '4px 8px', maxWidth: '240px' }}>
                          <span>STR: <strong style={{ color: '#ff4444' }}>{u.stat_str || 10}</strong></span>
                          <span>AGI: <strong style={{ color: '#00d4ff' }}>{u.stat_agi || 10}</strong></span>
                          <span>DEF: <strong style={{ color: '#ffcc00' }}>{u.stat_def || 10}</strong></span>
                          <span>VIT: <strong style={{ color: '#00ff88' }}>{u.stat_vit || 10}</strong></span>
                        </div>
                        {/* Status point balance */}
                        {(u.status_points || 0) > 0 && (
                          <div style={{ marginTop: '4px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,204,0,0.15)', color: '#ffcc00', border: '1px solid rgba(255,204,0,0.2)' }}>
                              ⚡ 未割り振り: {u.status_points} pt
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Column 3: Weight & Calorie targets */}
                      <td>
                        <div style={{ fontSize: '0.8rem', color: '#eee' }}>
                          ⚖️ {u.current_weight ? `${u.current_weight} kg` : '-'} → {u.target_weight ? `${u.target_weight} kg` : '-'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#8a8a93', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>🍴 摂取目標: {u.target_calories_consumed ? `${u.target_calories_consumed} kcal` : '-'}</span>
                          <span>🔥 消費目標: {u.target_calories_burned ? `${u.target_calories_burned} kcal` : '-'}</span>
                        </div>
                      </td>

                      {/* Column 4: Demographics & Created Date */}
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#ccc' }}>
                          {u.gender === 'male' ? '男性' : u.gender === 'female' ? '女性' : u.gender === 'other' ? 'その他' : '-'} / {u.age ? `${u.age}歳` : '-'} / {u.height ? `${u.height}cm` : '-'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#666', marginTop: '4px' }}>
                          📅 登録日: {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Column 5: Action buttons */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            style={{
                              backgroundColor: 'rgba(0, 212, 255, 0.1)', color: '#00d4ff', border: '1px solid rgba(0, 212, 255, 0.2)',
                              padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.2)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)'}
                          >
                            ✏️ 編集・ステータス
                          </button>
                          <button
                            onClick={() => handleRequestShowPassword(u)}
                            style={{
                              backgroundColor: 'rgba(255, 204, 0, 0.1)', color: '#ffcc00', border: '1px solid rgba(255, 204, 0, 0.2)',
                              padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.2)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.1)'}
                          >
                            🔑 パスワード
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            disabled={u.role === 'admin'}
                            style={{
                              backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)',
                              padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold',
                              cursor: u.role === 'admin' ? 'not-allowed' : 'pointer', opacity: u.role === 'admin' ? 0.3 : 1,
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { if (u.role !== 'admin') e.currentTarget.style.backgroundColor = 'rgba(255, 68, 68, 0.2)'; }}
                            onMouseLeave={e => { if (u.role !== 'admin') e.currentTarget.style.backgroundColor = 'rgba(255, 68, 68, 0.1)'; }}
                          >
                            🚫 BAN
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="admin-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#ffcc00' }}>🔔 通知送信履歴 ＆ 送信コントロール</h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#8a8a93' }}>
                  システム内および管理者からユーザーへ送信されたすべての通知履歴の監視と、新規のお知らせ・警告の送信が行えます。
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={notificationsSearch}
                  onChange={e => setNotificationsSearch(e.target.value)}
                  placeholder="通知件名やプレイヤー名で検索..."
                  style={{
                    padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.8rem', outline: 'none', transition: 'all 0.2s', width: '220px'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#ffcc00'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <button
                  onClick={() => {
                    setSendNotificationForm({ user_id: users[0]?.id || '', title: '', message: '', type: 'admin_alert' });
                    setShowSendNotificationModal(true);
                  }}
                  style={{
                    backgroundColor: '#ffcc00', color: '#030303', border: 'none',
                    padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(255,204,0,0.25)', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                >
                  📣 新規通知を送信
                </button>
              </div>
            </div>

            {notificationsLoading && notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#8a8a93' }}>⏳ 通知履歴を読み込み中...</div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#666', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                通知履歴はありません。
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '130px' }}>送信先プレイヤー</th>
                      <th style={{ minWidth: '280px' }}>通知内容</th>
                      <th style={{ minWidth: '100px' }}>タイプ</th>
                      <th style={{ minWidth: '80px' }}>ステータス</th>
                      <th style={{ minWidth: '130px' }}>送信日時</th>
                      <th style={{ textAlign: 'right', minWidth: '100px' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications
                      .filter(n => {
                        const term = notificationsSearch.toLowerCase();
                        return (n.user_name || '').toLowerCase().includes(term) ||
                          n.title.toLowerCase().includes(term) ||
                          n.message.toLowerCase().includes(term);
                      })
                      .map(n => {
                        let typeColor = '#8a8a93';
                        let typeBg = 'rgba(255,255,255,0.05)';
                        let typeLabel = 'その他';
                        if (n.type === 'level_up') {
                          typeColor = '#d400ff';
                          typeBg = 'rgba(212,0,255,0.12)';
                          typeLabel = '🎉 レベルアップ';
                        } else if (n.type === 'territory_lost') {
                          typeColor = '#ff4444';
                          typeBg = 'rgba(255,68,68,0.12)';
                          typeLabel = '⚔️ 領土侵害';
                        } else if (n.type === 'admin_alert') {
                          typeColor = '#ffcc00';
                          typeBg = 'rgba(255,204,0,0.12)';
                          typeLabel = '📣 管理者告知';
                        } else if (n.type === 'system') {
                          typeColor = '#00d4ff';
                          typeBg = 'rgba(0,212,255,0.12)';
                          typeLabel = '⚙️ システム';
                        }

                        return (
                          <tr key={n.id}>
                            <td style={{ fontWeight: 'bold' }}>👤 {n.user_name || '不明'}</td>
                            <td>
                              <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#fff', marginBottom: '2px' }}>{n.title}</div>
                              <div style={{ fontSize: '0.75rem', color: '#ccc', lineHeight: '1.4' }}>{n.message}</div>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', color: typeColor, backgroundColor: typeBg, border: `1px solid ${typeColor}22` }}>
                                {typeLabel}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold',
                                backgroundColor: n.is_read === 1 ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                                color: n.is_read === 1 ? '#00ff88' : '#ff4444'
                              }}>
                                {n.is_read === 1 ? '既読' : '未読'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.78rem', color: '#8a8a93' }}>{new Date(n.created_at).toLocaleString()}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => handleDeleteNotification(n.id)}
                                style={{
                                  backgroundColor: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)',
                                  padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer'
                                }}
                              >
                                🗑️ 削除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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

                <div style={{ display: 'grid', gap: '0.9rem', marginTop: '1.4rem', padding: '1rem', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '12px', background: 'rgba(0,212,255,0.025)' }}>
                  <strong style={{ color: '#00d4ff', fontSize: '0.82rem' }}>チーム対戦スコア換算</strong>
                  <label style={{ display: 'grid', gap: '0.35rem', color: '#aeb6c2', fontSize: '0.75rem' }}>
                    距離: 1 km あたりのポイント
                    <input type="number" min="0.01" step="0.01" required value={settings.battle_distance_points_per_km || '1'}
                      onChange={(event) => setSettings({ ...settings, battle_distance_points_per_km: event.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', background: 'rgba(0,0,0,0.35)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: '0.35rem', color: '#aeb6c2', fontSize: '0.75rem' }}>
                    領域純増減: 1,000 m² あたりのポイント
                    <input type="number" min="0.01" step="0.01" required value={settings.battle_territory_points_per_1000_sqm || '1'}
                      onChange={(event) => setSettings({ ...settings, battle_territory_points_per_1000_sqm: event.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', background: 'rgba(0,0,0,0.35)' }} />
                  </label>
                  <span style={{ color: '#788391', fontSize: '0.68rem', lineHeight: 1.5 }}>新しい対戦の申請時に係数を固定します。開催中の対戦の換算条件は変わりません。</span>
                </div>

                <div style={{ marginTop: '1.8rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1.2rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#00ff88', fontWeight: 'bold', marginBottom: '0.8rem', textAlign: 'left' }}>
                    📱 ユーザー画面 メニュー項目の表示設定
                  </label>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.72rem', color: '#8a8a93', textAlign: 'left', lineHeight: '1.4' }}>
                    チェックを外すと、一般ユーザーの画面（ボトムナビゲーションやメニュー等）から該当の項目が非表示になります。
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', textAlign: 'left' }}>
                    {[
                      { key: 'show_home_menu', label: '🏠 ホーム' },
                      { key: 'show_map_menu', label: '🗺️ マップ' },
                      { key: 'show_ai_predict_menu', label: '✨ 未来予測' },
                      { key: 'show_meal_menu', label: '🥗 食事' },
                      { key: 'show_friends_menu', label: '👥 フレンド' },
                      { key: 'show_team_menu', label: '🛡️ チーム' },
                      { key: 'show_ranking_menu', label: '🏆 ランク' },
                      { key: 'show_chat_menu', label: '💬 コーチ' },
                    ].map(menu => (
                      <div key={menu.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <input
                          type="checkbox"
                          id={menu.key}
                          checked={settings[menu.key] !== 'false'}
                          onChange={(e) => setSettings({ ...settings, [menu.key]: e.target.checked ? 'true' : 'false' })}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: '#00ff88',
                            cursor: 'pointer'
                          }}
                        />
                        <label htmlFor={menu.key} style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                          {menu.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
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

        {/* ACHIEVEMENTS TAB */}
        {activeTab === 'achievements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Achievements definitions dictionary */}
            <div className="admin-card">
              <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1rem', color: '#ffcc00', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                🏆 実績図鑑 ＆ 取得条件一覧
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
                {Object.values(ACHIEVEMENT_DEFINITIONS).map(def => (
                  <div key={def.id} style={{ display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{def.icon}</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.88rem', fontWeight: 'bold', color: '#fff' }}>{def.title}</h4>
                      <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: '#8a8a93', lineHeight: '1.4' }}>{def.description}</p>
                      <div style={{ fontSize: '0.7rem', color: '#ffcc00', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🔑 条件:</span> <span>{def.requirement}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievement Matrix */}
            <div className="admin-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>
                  👥 プレイヤー別の実績取得状況マトリクス
                </h3>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={achievementSearch}
                    onChange={e => setAchievementSearch(e.target.value)}
                    placeholder="プレイヤー名で検索..."
                    style={{
                      padding: '8px 12px', borderRadius: '10px',
                      backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#fff', fontSize: '0.8rem', outline: 'none', transition: 'all 0.2s', width: '200px'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#ffcc00'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#8a8a93', fontWeight: 'bold' }}>
                    {achievementUsers.filter(u => u.name.toLowerCase().includes(achievementSearch.toLowerCase())).length}名表示中
                  </span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '150px' }}>プレイヤー名</th>
                      {Object.values(ACHIEVEMENT_DEFINITIONS).map(def => (
                        <th key={def.id} style={{ textAlign: 'center', minWidth: '110px' }} title={`${def.title}: ${def.requirement}`}>
                          <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{def.icon}</div>
                          <div style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{def.title}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {achievementUsers
                      .filter(u => u.name.toLowerCase().includes(achievementSearch.toLowerCase()))
                      .map(u => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 'bold' }}>👤 {u.name}</td>
                          {Object.values(ACHIEVEMENT_DEFINITIONS).map(def => {
                            const unlock = unlockedAchievements.find(
                              a => a.user_id === u.id && a.achievement_id === def.id
                            );
                            return (
                              <td key={def.id} style={{ textAlign: 'center' }}>
                                {unlock ? (
                                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '1.2rem', color: '#00ff88' }} title={`解除日: ${new Date(unlock.unlocked_at).toLocaleString()}`}>✅</span>
                                    <span style={{ fontSize: '0.58rem', color: '#8a8a93', marginTop: '2px' }}>
                                      {new Date(unlock.unlocked_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.15)' }} title="未解除">🔒</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* API USAGE TAB */}
        {activeTab === 'api-usage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#00d4ff', fontSize: '1.1rem' }}>📡 Gemini API 使用状況モニター</h3>
              <button
                onClick={fetchApiUsage}
                disabled={apiUsageLoading}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(0,212,255,0.3)',
                  background: 'rgba(0,212,255,0.08)', color: '#00d4ff', cursor: apiUsageLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold', fontSize: '0.8rem', transition: 'all 0.2s'
                }}
              >
                {apiUsageLoading ? '⏳ 取得中...' : '🔄 データ更新'}
              </button>
            </div>

            {apiUsageLoading && apiUsageSummary.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#8a8a93' }}>⏳ API使用データを取得中...</div>
            ) : apiUsageSummary.length === 0 ? (
              <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
                <div style={{ color: '#8a8a93', fontSize: '0.9rem' }}>まだAPIの使用ログがありません。</div>
                <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>API呼び出しが行われると、ここに統計データが表示されます。</div>
              </div>
            ) : (
              <>
                {/* Summary Cards by API Type */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {apiUsageSummary.map(s => {
                    const successRate = s.total_calls > 0 ? ((s.success_count / s.total_calls) * 100).toFixed(1) : '0.0';
                    const isMap = s.api_type === 'map';
                    const accentColor = isMap ? '#00ff88' : '#ff007f';
                    return (
                      <div key={s.api_type} className="admin-card" style={{ borderLeft: `4px solid ${accentColor}`, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '4rem', opacity: 0.05 }}>
                          {isMap ? '🗺️' : '🤖'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#8a8a93', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {isMap ? '📍 マップ用 API' : '🧠 汎用AI API'}
                        </div>
                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#fff', margin: '0.5rem 0' }}>{s.total_calls.toLocaleString()}</div>
                        <div style={{ fontSize: '0.72rem', color: '#8a8a93', marginBottom: '1rem' }}>総コール数</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#8a8a93' }}>成功</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#00ff88' }}>{s.success_count.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#8a8a93' }}>エラー</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: s.error_count > 0 ? '#ff4444' : '#666' }}>{s.error_count.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#8a8a93' }}>成功率</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: parseFloat(successRate) >= 95 ? '#00ff88' : parseFloat(successRate) >= 80 ? '#ffcc00' : '#ff4444' }}>{successRate}%</div>
                          </div>
                        </div>
                        <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', color: '#8a8a93' }}>平均レスポンス: </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: (s.avg_response_ms || 0) < 2000 ? '#00d4ff' : (s.avg_response_ms || 0) < 5000 ? '#ffcc00' : '#ff4444' }}>
                            {(s.avg_response_ms || 0).toLocaleString()}ms
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Daily Trend */}
                {apiUsageDaily.length > 0 && (
                  <div className="admin-card">
                    <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1rem', color: '#00d4ff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                      📈 日別API呼び出し推移（直近14日）
                    </h3>
                    {(() => {
                      // Group daily data by date
                      const dateMap = new Map<string, { map_calls: number; map_errors: number; general_calls: number; general_errors: number }>();
                      apiUsageDaily.forEach(d => {
                        const existing = dateMap.get(d.date) || { map_calls: 0, map_errors: 0, general_calls: 0, general_errors: 0 };
                        if (d.api_type === 'map') {
                          existing.map_calls = d.total_calls;
                          existing.map_errors = d.error_count;
                        } else {
                          existing.general_calls = d.total_calls;
                          existing.general_errors = d.error_count;
                        }
                        dateMap.set(d.date, existing);
                      });
                      const dates = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b));
                      const maxCalls = Math.max(1, ...dates.map(([, v]) => v.map_calls + v.general_calls));
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {dates.map(([date, vals]) => {
                            const total = vals.map_calls + vals.general_calls;
                            const totalErrors = vals.map_errors + vals.general_errors;
                            const pct = (total / maxCalls) * 100;
                            return (
                              <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <div style={{ fontSize: '0.72rem', color: '#8a8a93', minWidth: '75px', fontFamily: 'monospace' }}>{date.slice(5)}</div>
                                <div style={{ flex: 1, height: '20px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                                  <div style={{ width: `${(vals.map_calls / maxCalls) * 100}%`, backgroundColor: 'rgba(0,255,136,0.4)', height: '100%', transition: 'width 0.3s' }} title={`Map: ${vals.map_calls}`} />
                                  <div style={{ width: `${(vals.general_calls / maxCalls) * 100}%`, backgroundColor: 'rgba(255,0,127,0.4)', height: '100%', transition: 'width 0.3s' }} title={`General: ${vals.general_calls}`} />
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#ccc', minWidth: '40px', textAlign: 'right', fontWeight: 'bold' }}>{total}</div>
                                {totalErrors > 0 && (
                                  <div style={{ fontSize: '0.68rem', color: '#ff4444', minWidth: '35px' }}>⚠{totalErrors}</div>
                                )}
                              </div>
                            );
                          })}
                          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.7rem', color: '#8a8a93' }}>
                            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: 'rgba(0,255,136,0.4)', borderRadius: '2px', marginRight: '4px' }} />マップ用API</span>
                            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: 'rgba(255,0,127,0.4)', borderRadius: '2px', marginRight: '4px' }} />汎用AI API</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Endpoint Breakdown */}
                <div className="admin-card">
                  <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1rem', color: '#ff007f', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                    🔍 エンドポイント別詳細
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 12px', color: '#8a8a93', fontWeight: 'bold' }}>API種別</th>
                          <th style={{ textAlign: 'left', padding: '8px 12px', color: '#8a8a93', fontWeight: 'bold' }}>エンドポイント</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', color: '#8a8a93', fontWeight: 'bold' }}>コール数</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', color: '#8a8a93', fontWeight: 'bold' }}>成功</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', color: '#8a8a93', fontWeight: 'bold' }}>エラー</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', color: '#8a8a93', fontWeight: 'bold' }}>平均ms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiUsageByEndpoint.map((ep, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{
                                fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold',
                                backgroundColor: ep.api_type === 'map' ? 'rgba(0,255,136,0.1)' : 'rgba(255,0,127,0.1)',
                                color: ep.api_type === 'map' ? '#00ff88' : '#ff007f'
                              }}>
                                {ep.api_type === 'map' ? '🗺️ MAP' : '🤖 AI'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#ccc' }}>{ep.endpoint}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>{ep.total_calls.toLocaleString()}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#00ff88' }}>{ep.success_count.toLocaleString()}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: ep.error_count > 0 ? '#ff4444' : '#666' }}>{ep.error_count.toLocaleString()}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#00d4ff', fontFamily: 'monospace' }}>{(ep.avg_response_ms || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Errors */}
                {apiUsageErrors.length > 0 && (
                  <div className="admin-card" style={{ borderLeft: '4px solid #ff4444' }}>
                    <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1rem', color: '#ff4444', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                      🚨 直近のエラーログ（最新20件）
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {apiUsageErrors.map(err => (
                        <div key={err.id} style={{
                          padding: '0.8rem', backgroundColor: 'rgba(255,68,68,0.04)', border: '1px solid rgba(255,68,68,0.1)',
                          borderRadius: '8px', fontSize: '0.78rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{
                                fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold',
                                backgroundColor: err.api_type === 'map' ? 'rgba(0,255,136,0.1)' : 'rgba(255,0,127,0.1)',
                                color: err.api_type === 'map' ? '#00ff88' : '#ff007f'
                              }}>
                                {err.api_type === 'map' ? 'MAP' : 'AI'}
                              </span>
                              <span style={{ fontFamily: 'monospace', color: '#aaa', fontSize: '0.72rem' }}>{err.endpoint}</span>
                            </div>
                            <span style={{ color: '#666', fontSize: '0.68rem' }}>{new Date(err.created_at).toLocaleString()}</span>
                          </div>
                          <div style={{ color: '#ff6b6b', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            ❌ {err.error_message || 'Unknown error'}
                          </div>
                          {err.response_time_ms > 0 && (
                            <div style={{ color: '#666', fontSize: '0.68rem', marginTop: '0.2rem' }}>応答時間: {err.response_time_ms}ms</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* DESIGN DOCS TAB */}
        {activeTab === 'design-docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="admin-card">
              <h3 style={{ margin: '0 0 1.2rem 0', color: '#00d4ff', fontSize: '1.1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                📄 PhysiProof 使用技術一覧 ＆ 設計資料
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', fontSize: '0.88rem', lineHeight: '1.6', color: '#ccc' }}>
                
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>🏗️ 1. コア・アーキテクチャ (Zod-Centered Monorepo)</h4>
                  <p style={{ margin: 0 }}>
                    本プロジェクトは <code>npm workspaces</code> を用いたモノレポ構成であり、<strong>Zod を唯一の真実の源（Single Source of Truth）</strong>としています。
                  </p>
                  <ul style={{ margin: '0.3rem 0 0 1.5rem', padding: 0 }}>
                    <li><strong>共有型定義:</strong> <code>packages/shared</code> にバリデーションスキーマを集約。型定義はすべて Zod スキーマから自動抽出（<code>z.infer</code>）されます。</li>
                    <li><strong>Hono RPC:</strong> バックエンドの API ルーターの型定義（<code>AppType</code>）をフロントエンドが直接読み込むことで、エンドポイント、引数、戻り値の「完全な型安全」と自動補完を実現しています。</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>📡 2. バックエンド技術スタック (Backend)</h4>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    <li><strong>Webフレームワーク:</strong> <code>Hono</code> (超軽量・エッジファーストなWebフレームワーク)</li>
                    <li><strong>データベース:</strong> <code>Cloudflare D1</code> (エッジ配置の分散SQLite互換データベース)</li>
                    <li><strong>デプロイ環境:</strong> <code>Cloudflare Workers</code> (V8アイソレートによるエッジコンピューティング環境)</li>
                    <li><strong>リクエストバリデーション:</strong> <code>@hono/zod-validator</code> による型安全な検証。</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>💻 3. フロントエンド技術スタック (Frontend)</h4>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    <li><strong>主要ライブラリ:</strong> <code>React 18</code> + <code>TypeScript</code></li>
                    <li><strong>ビルドツール:</strong> <code>Vite</code></li>
                    <li><strong>ルーティング:</strong> <code>react-router-dom</code></li>
                    <li><strong>マップライブラリ:</strong> <code>Leaflet</code> (Google Mapsの代わりに描画、管理者用) + <code>Google Maps JavaScript API</code> (PWA/フロントエンド地図用)</li>
                    <li><strong>幾何計算 (GIS):</strong> <code>@turf/area</code>, <code>@turf/difference</code>, <code>@turf/union</code>, <code>@turf/helpers</code> (ポリゴンの差分・マージ処理)</li>
                    <li><strong>スタイリング:</strong> <code>Vanilla CSS</code> + curated harmonious HSL colors</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>🛡️ 4. 運動証明（Anti-Cheat）物理 ＆ セキュリティ</h4>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    <li><strong>物理センサー整合性検証:</strong> Android Nativeセンサー（線形加速度等）の重力ノルム判定による「端末投げチート」の排除。</li>
                    <li><strong>相関検証:</strong> 移動ベクトル（GPS）と歩数カウンター値（Step Counter）の比率検証による「乗り物移動チート」の排除。</li>
                    <li><strong>ハードウェア・アテステーション:</strong> <code>Google Play Integrity API</code> を用いたエミュレータ・改ざん端末の排除。</li>
                    <li><strong>リプレイ攻撃対策:</strong> Nonce 管理テーブル（<code>used_nonces</code>）による重複リクエストの排除。</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>🔄 5. 自動デプロイとCI/CD</h4>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    <li><strong>プラットフォーム:</strong> <code>GitHub Actions</code></li>
                    <li><strong>自動トリガー:</strong> <code>main</code>ブランチへのPush時に、フロントエンド（Cloudflare Pages）とバックエンド（Cloudflare Workers）へのテスト・ビルド・デプロイが自動走査されます。</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>✨ 6. AI（身体推論）</h4>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    <li><strong>AI推論エンジン:</strong> <code>Gemini 1.5 Flash</code> (System Instruction, Few-Shot Prompting, Structured JSON Output)</li>
                    <li><strong>物理フォールバック:</strong> AIの接続制限時に、ハリス・ベネディクト方程式に基づく物理計算モデルへの自動フォールバック。</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#00ff88', fontSize: '0.95rem' }}>🚀 7. バックグラウンド位置追跡技術</h4>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    Webブラウザ上で他のアプリを開いている間でも位置情報を記録し続けるため、以下の技術を組み合わせています：
                  </p>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    <li><strong>Web Audio API (Keep-Alive):</strong> 1.5秒間隔での無音再生ループにより、OSがブラウザをサスペンドするのを回避し、JavaScriptをバックグラウンド実行させます。</li>
                    <li><strong>Screen Wake Lock API:</strong> 計測中に端末がスリープして自動ロックされるのを防止します。</li>
                  </ul>
                </div>

              </div>
            </div>
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

      {/* USER EDIT MODAL */}
      {selectedUserForEdit && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="admin-card" style={{ width: '100%', maxWidth: '750px', backgroundColor: '#0a0a0a', border: '1px solid #00d4ff33', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: '#00d4ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✏️ プレイヤー・ステータス編集: {selectedUserForEdit.name}</span>
              <button
                onClick={() => setSelectedUserForEdit(null)}
                style={{ background: 'none', border: 'none', color: '#8a8a93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </h3>

            <form onSubmit={handleSaveUserEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Profile/Role Group */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#8a8a93', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem', fontWeight: 'bold' }}>
                  👤 基本情報
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>表示名</label>
                    <input
                      type="text"
                      required
                      value={editForm.name || ''}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>アカウント権限</label>
                    <select
                      value={editForm.role || 'user'}
                      onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'
                      }}
                    >
                      <option value="user">USER</option>
                      <option value="admin">ADMIN</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* RPG Stats Group */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#ffcc00', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem', fontWeight: 'bold' }}>
                  🛡️ RPG ステータス
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>レベル (Lv)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.level ?? 1}
                      onChange={e => setEditForm({ ...editForm, level: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>現在XP</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editForm.xp ?? 0}
                      onChange={e => setEditForm({ ...editForm, xp: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>ステータスポイント</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editForm.status_points ?? 0}
                      onChange={e => setEditForm({ ...editForm, status_points: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#ff4444', display: 'block', marginBottom: '4px' }}>筋力 (STR)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.stat_str ?? 10}
                      onChange={e => setEditForm({ ...editForm, stat_str: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#00d4ff', display: 'block', marginBottom: '4px' }}>俊敏 (AGI)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.stat_agi ?? 10}
                      onChange={e => setEditForm({ ...editForm, stat_agi: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#ffcc00', display: 'block', marginBottom: '4px' }}>防御 (DEF)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.stat_def ?? 10}
                      onChange={e => setEditForm({ ...editForm, stat_def: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#00ff88', display: 'block', marginBottom: '4px' }}>生命力 (VIT)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.stat_vit ?? 10}
                      onChange={e => setEditForm({ ...editForm, stat_vit: Number(e.target.value) })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Weight & Calories Group */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#00ff88', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem', fontWeight: 'bold' }}>
                  ⚖️ 体重 ＆ カロリー目標
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>現在体重 (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.current_weight ?? ''}
                      onChange={e => setEditForm({ ...editForm, current_weight: e.target.value ? Number(e.target.value) : null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>目標体重 (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.target_weight ?? ''}
                      onChange={e => setEditForm({ ...editForm, target_weight: e.target.value ? Number(e.target.value) : null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>摂取カロリー目標 (kcal)</label>
                    <input
                      type="number"
                      value={editForm.target_calories_consumed ?? ''}
                      onChange={e => setEditForm({ ...editForm, target_calories_consumed: e.target.value ? Number(e.target.value) : null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>消費カロリー目標 (kcal)</label>
                    <input
                      type="number"
                      value={editForm.target_calories_burned ?? ''}
                      onChange={e => setEditForm({ ...editForm, target_calories_burned: e.target.value ? Number(e.target.value) : null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Physical Demographics Group */}
              <div>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#00d4ff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem', fontWeight: 'bold' }}>
                  📊 身体パラメータ
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>性別</label>
                    <select
                      value={editForm.gender || ''}
                      onChange={e => setEditForm({ ...editForm, gender: e.target.value || null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'
                      }}
                    >
                      <option value="">設定なし</option>
                      <option value="male">男性</option>
                      <option value="female">女性</option>
                      <option value="other">その他</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>年齢</label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.age ?? ''}
                      onChange={e => setEditForm({ ...editForm, age: e.target.value ? Number(e.target.value) : null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>身長 (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={editForm.height ?? ''}
                      onChange={e => setEditForm({ ...editForm, height: e.target.value ? Number(e.target.value) : null })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1.2rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedUserForEdit(null)}
                  style={{
                    flex: 1, padding: '0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                    background: 'none', color: '#8a8a93', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingUser}
                  style={{
                    flex: 2, padding: '0.8rem', borderRadius: '10px', backgroundColor: '#00d4ff',
                    color: '#030303', border: 'none', cursor: isUpdatingUser ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', fontSize: '0.9rem', opacity: isUpdatingUser ? 0.6 : 1
                  }}
                >
                  {isUpdatingUser ? '⏳ 更新中...' : '💾 変更を保存する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEND CUSTOM NOTIFICATION MODAL */}
      {showSendNotificationModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="admin-card" style={{ width: '100%', maxWidth: '500px', backgroundColor: '#0a0a0a', border: '1px solid #ffcc0033' }}>
            <h3 style={{ margin: '0 0 1.2rem 0', color: '#ffcc00', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📣 新規カスタム通知送信</span>
              <button
                onClick={() => setShowSendNotificationModal(false)}
                style={{ background: 'none', border: 'none', color: '#8a8a93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </h3>

            <form onSubmit={handleSendNotification} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>宛先ユーザー</label>
                <select
                  required
                  value={sendNotificationForm.user_id}
                  onChange={e => setSendNotificationForm({ ...sendNotificationForm, user_id: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="" disabled>ユーザーを選択してください</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      👤 {u.name} ({u.login_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>通知タイプ</label>
                <select
                  value={sendNotificationForm.type}
                  onChange={e => setSendNotificationForm({ ...sendNotificationForm, type: e.target.value as any })}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="admin_alert">📣 管理者告知・アラート</option>
                  <option value="level_up">🎉 レベルアップ</option>
                  <option value="territory_lost">⚔️ 領土侵害・敗北</option>
                  <option value="system">⚙️ システムメッセージ</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>通知件名 (タイトル)</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={sendNotificationForm.title}
                  onChange={e => setSendNotificationForm({ ...sendNotificationForm, title: e.target.value })}
                  placeholder="例: 【重要】公式イベントの開催について"
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: '#8a8a93', display: 'block', marginBottom: '4px' }}>通知本文 (メッセージ)</label>
                <textarea
                  required
                  maxLength={500}
                  rows={4}
                  value={sendNotificationForm.message}
                  onChange={e => setSendNotificationForm({ ...sendNotificationForm, message: e.target.value })}
                  placeholder="ユーザーに伝えるメッセージの詳細を入力してください..."
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', backgroundColor: '#141414', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'sans-serif'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowSendNotificationModal(false)}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                    background: 'none', color: '#8a8a93', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem'
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSendingNotification}
                  style={{
                    flex: 1.5, padding: '0.7rem', borderRadius: '8px', backgroundColor: '#ffcc00',
                    color: '#030303', border: 'none', cursor: isSendingNotification ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', fontSize: '0.85rem', opacity: isSendingNotification ? 0.6 : 1
                  }}
                >
                  {isSendingNotification ? '⏳ 送信中...' : '📣 通知を送信する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
