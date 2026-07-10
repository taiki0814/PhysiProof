import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../lib/hc';

// Modular Sub-Components
import HomeHubSection from '../components/HomeHubSection';
import RPGStatsSection from '../components/RPGStatsSection';
import NotificationsCenter from '../components/NotificationsCenter';
import MealAnalysisSection from '../components/MealAnalysisSection';
import ChatSection from '../components/ChatSection';
import AIPredictSection from '../components/AIPredictSection';
import { ExerciseSection } from '../components/ExerciseSection';
import { MapView } from '../components/MapViewSection';
import { ProfileModal } from '../components/ProfileModal';
import { FortifyTerritorySelector } from '../components/FortifyTerritorySelector';
import { RankingView } from '../components/RankingViewSection';

export const getUserAvatarSrc = (avatarId: string | null | undefined, avatarImage: string | null | undefined) => {
  if (avatarId === 'custom' && avatarImage) {
    return avatarImage;
  }
  if (avatarId && avatarId !== 'default' && avatarId !== 'custom') {
    return `/avatars/${avatarId}.png`;
  }
  return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzU1NSI+PHBhdGggZD0iTTEyIDJDMi4xMiAyIDEwIDYuNDggMTAgMTJzNC40OCAxMCAxMCAxMCAxMCAtNC40OCAxMCAtMTBTMTcuNTIgMiAyMiAyem0wIDNjMS42NiAwIDMgMS4zNCAzIDNzLTEuMzQgMyAtMyAzIC0zIC0xLjM0IC0zIC0zIDEuMzQgLTMgMyAtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHMyLjk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==';
};

type TabType = 'home' | 'map' | 'exercise' | 'ai-predict' | 'meal' | 'ranking' | 'chat';

const TabButton = ({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: string }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: '4px',
    backgroundColor: active ? 'rgba(0, 255, 136, 0.12)' : 'rgba(6, 10, 20, 0.75)',
    color: active ? '#00ff88' : 'rgba(0, 255, 136, 0.5)',
    border: active ? '1.5px solid #00ff88' : '1px solid rgba(0, 255, 136, 0.2)',
    boxShadow: active ? '0 0 10px rgba(0, 255, 136, 0.2)' : 'none',
    cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s ease', fontSize: '0.8rem',
    fontFamily: "'Share Tech Mono', monospace",
    letterSpacing: '0.5px',
    textShadow: active ? '0 0 6px rgba(0,255,136,0.4)' : 'none',
    outline: 'none'
  }}>
    <span style={{ fontSize: '1rem', filter: active ? 'none' : 'grayscale(0.4) opacity(0.7)' }}>{icon}</span>
    <span>{label}</span>
  </button>
);

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

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [rankingPeriod, setRankingPeriod] = useState<'morning' | 'afternoon' | 'night' | 'all'>('all');
  const [rankingDuration, setRankingDuration] = useState<'daily' | 'weekly' | 'yearly' | 'all'>('all');
  const [ranking, setRanking] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ 
    uid: string; 
    name: string; 
    avatar_id: string; 
    avatar_image?: string | null; 
    login_id?: string; 
    current_weight?: number | null;
    target_weight?: number | null;
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
    role?: string | null;
  } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [todayMission, setTodayMission] = useState<any | null>(null);
  const [showFortifyModal, setShowFortifyModal] = useState(false);
  const [isMissionExpanded, setIsMissionExpanded] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const [caloriesBurnedToday, setCaloriesBurnedToday] = useState(0);
  const [caloriesConsumedToday, setCaloriesConsumedToday] = useState(0);

  const navigate = useNavigate();

  // --- Real-time Achievements unlocking notification toasts ---
  interface UnlockedAchievementToast {
    id: string;
    uniqueId: string;
    title: string;
    description: string;
    icon: string;
    visible: boolean;
  }
  const [activeAchievementToasts, setActiveAchievementToasts] = useState<UnlockedAchievementToast[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);

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

  useEffect(() => {
    fetchAchievements();
  }, []);

  const playAchievementSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.25);
      gain2.gain.setValueAtTime(0.06, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.4);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.error('Failed to play achievement sound:', e);
    }
  };

  const triggerAchievementUnlock = (achievements: any[]) => {
    if (!achievements || achievements.length === 0) return;

    achievements.forEach((ach, index) => {
      setTimeout(() => {
        playAchievementSound();
        const uniqueId = `${ach.id}-${Date.now()}-${index}`;
        const newToast: UnlockedAchievementToast = {
          id: ach.id,
          uniqueId,
          title: ach.title,
          description: ach.description,
          icon: ach.icon || '🏆',
          visible: true
        };

        setActiveAchievementToasts(prev => [...prev, newToast]);

        setTimeout(() => {
          setActiveAchievementToasts(prev => 
            prev.map(t => t.uniqueId === uniqueId ? { ...t, visible: false } : t)
          );
        }, 4000);

        setTimeout(() => {
          setActiveAchievementToasts(prev => 
            prev.filter(t => t.uniqueId !== uniqueId)
          );
        }, 4500);

        fetchAchievements();
      }, index * 600);
    });
  };

  // Run tracking states (Dashboard level to prevent unmounting tab tracking loss)
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [trackingStartTime, setTrackingStartTime] = useState<number | null>(null);
  const [currentDistance, setCurrentDistance] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);

  // Screen Wake Lock & Background Web Audio handles
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceIntervalRef = useRef<any>(null);

  // Screen Wake Lockの取得
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

  // Screen Wake Lockの解放
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Screen Wake Lock released');
      } catch (err) {
        console.error('Failed to release wake lock:', err);
      }
    }
  };

  // 無音オーディオ再生によるバックグラウンド維持の開始
  const startSilenceLoop = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const playSilence = () => {
        if (!ctx || ctx.state === 'suspended') return;
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      };

      // 初回再生
      playSilence();

      // 1.5秒ごとに無音再生を繰り返すことでサスペンドを回避
      silenceIntervalRef.current = setInterval(playSilence, 1500);
      console.log('Background Audio Keep-Alive started');
    } catch (err) {
      console.error('Failed to start silence loop:', err);
    }
  };

  // 無音オーディオ再生の停止
  const stopSilenceLoop = () => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    console.log('Background Audio Keep-Alive stopped');
  };

  // isTrackingの状態変化に応じて起動・解除
  useEffect(() => {
    if (isTracking) {
      requestWakeLock();
      startSilenceLoop();
    } else {
      releaseWakeLock();
      stopSilenceLoop();
    }
    return () => {
      releaseWakeLock();
      stopSilenceLoop();
    };
  }, [isTracking]);


  const fetchTodayMission = async () => {
    try {
      const res = await client.api.missions.today.$get();
      if (res.ok) {
        const data = await res.json();
        const mission = (data as any).mission;
        setTodayMission(mission);
        if (mission && mission.is_completed === 1 && mission.claimed === 0) {
          setIsMissionExpanded(true);
        }
      }
    } catch (e) {
      console.error('Failed to fetch today mission:', e);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const res = await client.api.users.me.$get();
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          const dbUser = data.user;
          setCurrentUser({
            uid: dbUser.id,
            name: dbUser.name,
            avatar_id: dbUser.avatar_id || 'default',
            avatar_image: dbUser.avatar_image || null,
            login_id: dbUser.login_id || '',
            current_weight: dbUser.current_weight || null,
            target_weight: dbUser.target_weight || null,
            target_calories_burned: dbUser.target_calories_burned || null,
            target_calories_consumed: dbUser.target_calories_consumed || null,
            gender: dbUser.gender || null,
            age: dbUser.age || null,
            height: dbUser.height || null,
            level: dbUser.level || 1,
            xp: dbUser.xp || 0,
            status_points: dbUser.status_points || 0,
            stat_str: dbUser.stat_str || 10,
            stat_agi: dbUser.stat_agi || 10,
            stat_def: dbUser.stat_def || 10,
            stat_vit: dbUser.stat_vit || 10,
            role: dbUser.role
          } as any);

          const oldUserStr = localStorage.getItem('physiproof_user');
          const oldUser = oldUserStr ? JSON.parse(oldUserStr) : {};
          localStorage.setItem('physiproof_user', JSON.stringify({
            ...oldUser,
            userId: dbUser.id,
            name: dbUser.name,
            avatar_id: dbUser.avatar_id,
            avatar_image: dbUser.avatar_image,
            login_id: dbUser.login_id,
            role: dbUser.role,
            current_weight: dbUser.current_weight,
            target_weight: dbUser.target_weight,
            target_calories_burned: dbUser.target_calories_burned,
            target_calories_consumed: dbUser.target_calories_consumed,
            gender: dbUser.gender,
            age: dbUser.age,
            height: dbUser.height
          }));
        }
      }
    } catch (e) {
      console.error('Failed to fetch user profile:', e);
    }
  };

  const fetchDailyCalorieBalances = async () => {
    try {
      const resEx = await client.api.exercises.me.$get({ query: { period: 'daily' } });
      if (resEx.ok) {
        const data = await resEx.json();
        const dailyStats = (data as any).stats || [];
        const burned = dailyStats.reduce((acc: number, s: any) => acc + (s.estimated_calories || 0), 0);
        setCaloriesBurnedToday(burned);
      }

      const resMeal = await client.api.meals.history.$get();
      if (resMeal.ok) {
        const data = await resMeal.json();
        const meals = (data as any).meals || [];
        const todayStr = new Date().toDateString();
        const consumed = meals
          .filter((m: any) => new Date(m.created_at).toDateString() === todayStr)
          .reduce((acc: number, m: any) => acc + (m.calories || 0), 0);
        setCaloriesConsumedToday(consumed);
      }
    } catch (e) {
      console.error('Failed to fetch daily calorie balance:', e);
    }
  };

  // Offline syncing handler
  const syncOfflineData = async () => {
    if (!navigator.onLine) return;

    const cachedPushups = localStorage.getItem('physiproof_offline_pushups');
    if (cachedPushups) {
      try {
        const queue = JSON.parse(cachedPushups);
        if (Array.isArray(queue) && queue.length > 0) {
          console.log(`Syncing ${queue.length} offline pushups...`);
          for (const item of queue) {
            await client.api.pushups.$post({ json: item });
          }
          localStorage.removeItem('physiproof_offline_pushups');
        }
      } catch (e) {
        console.error('Failed to sync offline pushups:', e);
      }
    }

    const cachedRuns = localStorage.getItem('physiproof_offline_runs');
    if (cachedRuns) {
      try {
        const queue = JSON.parse(cachedRuns);
        if (Array.isArray(queue) && queue.length > 0) {
          console.log(`Syncing ${queue.length} offline runs...`);
          for (const item of queue) {
            await client.api.territories.$post({ json: item });
          }
          localStorage.removeItem('physiproof_offline_runs');
        }
      } catch (e) {
        console.error('Failed to sync offline runs:', e);
      }
    }

    const cachedMeals = localStorage.getItem('physiproof_offline_meals');
    if (cachedMeals) {
      try {
        const queue = JSON.parse(cachedMeals);
        if (Array.isArray(queue) && queue.length > 0) {
          console.log(`Syncing ${queue.length} offline meals...`);
          for (const item of queue) {
            await client.api.meals.analyze.$post({ json: { image: item.image } });
          }
          localStorage.removeItem('physiproof_offline_meals');
        }
      } catch (e) {
        console.error('Failed to sync offline meals:', e);
      }
    }

    fetchTodayMission();
    fetchDailyCalorieBalances();
    fetchUserProfile();
  };

  useEffect(() => {
    window.addEventListener('online', syncOfflineData);
    syncOfflineData();
    return () => {
      window.removeEventListener('online', syncOfflineData);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!window.visualViewport) return;
    const handleVVResize = () => {
      const vv = window.visualViewport!;
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
      if (offset > 0) window.scrollTo(0, 0);
    };
    window.visualViewport.addEventListener('resize', handleVVResize);
    window.visualViewport.addEventListener('scroll', handleVVResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleVVResize);
      window.visualViewport?.removeEventListener('scroll', handleVVResize);
    };
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('physiproof_user');
    if (!userData) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(userData);
    const uid = parsed.userId;

    // Load basic cache first for instant feedback
    setCurrentUser({ 
      uid: uid, 
      name: parsed.name, 
      avatar_id: parsed.avatar_id || 'default',
      avatar_image: parsed.avatar_image || null,
      login_id: parsed.login_id || '',
      current_weight: parsed.current_weight || null,
      target_weight: parsed.target_weight || null,
      target_calories_burned: parsed.target_calories_burned || null,
      target_calories_consumed: parsed.target_calories_consumed || null,
      gender: parsed.gender || null,
      age: parsed.age || null,
      height: parsed.height || null
    });

    // Fresh profile details from DB
    fetchUserProfile();
    fetchDailyCalorieBalances();

    setIsTracking(localStorage.getItem(`physiproof_run_is_tracking_${uid}`) === 'true');
    try {
      const savedRoute = localStorage.getItem(`physiproof_run_route_${uid}`);
      setRoute(savedRoute ? JSON.parse(savedRoute) : []);
    } catch {
      setRoute([]);
    }
    const savedStartTime = localStorage.getItem(`physiproof_run_start_time_${uid}`);
    setTrackingStartTime(savedStartTime ? Number(savedStartTime) : null);
    const savedDistance = localStorage.getItem(`physiproof_run_distance_${uid}`);
    setCurrentDistance(savedDistance ? Number(savedDistance) : 0);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem('physiproof_test_uid', currentUser.uid);
    fetchRanking();
    fetchTodayMission();
    fetchDailyCalorieBalances();
  }, [currentUser, rankingPeriod, rankingDuration]);

  const fetchRanking = () => {
    client.api.ranking.$get({ query: { period: rankingPeriod, duration: rankingDuration } })
      .then(res => res.json())
      .then(data => setRanking((data as any).ranking))
      .catch(console.error);
  };

  const shouldWatchLocation = activeTab === 'map' || isTracking;

  // Background Location GPS watch
  useEffect(() => {
    if (!currentUser) return;
    if (!shouldWatchLocation) return;
    if (!navigator.geolocation) return;

    const uid = currentUser.uid;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentPos([latitude, longitude]);

        if (isTracking) {
          let distanceIncrement = 0;
          setRoute(prev => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (last[0] === latitude && last[1] === longitude) return prev;
              
              distanceIncrement = getDistanceMeters(last, [latitude, longitude]);
              setCurrentDistance(d => {
                const newDist = d + distanceIncrement;
                localStorage.setItem(`physiproof_run_distance_${uid}`, String(newDist));
                return newDist;
              });
            }
            const newRoute = [...prev, [latitude, longitude] as [number, number]];
            localStorage.setItem(`physiproof_run_route_${uid}`, JSON.stringify(newRoute));
            return newRoute;
          });

          if (position.coords.speed !== null && position.coords.speed !== undefined) {
            setCurrentSpeed(position.coords.speed * 3.6);
          } else {
            setCurrentSpeed(0);
          }
        }
      },
      (err) => console.error('Dashboard GPS Error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    setWatchId(id);

    return () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
    };
  }, [currentUser, shouldWatchLocation, isTracking]);

  // Background Device Orientation watch
  useEffect(() => {
    if (!currentUser) return;
    if (!shouldWatchLocation) return;

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
  }, [currentUser, shouldWatchLocation]);

  // Background Elapsed Time timer
  useEffect(() => {
    let intervalId: any;
    if (isTracking && trackingStartTime) {
      intervalId = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - trackingStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isTracking, trackingStartTime]);

  const handleLogout = () => {
    localStorage.removeItem('physiproof_user');
    localStorage.removeItem('physiproof_test_uid');

    if (currentUser) {
      const uid = currentUser.uid;
      localStorage.removeItem(`physiproof_run_is_tracking_${uid}`);
      localStorage.removeItem(`physiproof_run_route_${uid}`);
      localStorage.removeItem(`physiproof_run_start_time_${uid}`);
      localStorage.removeItem(`physiproof_run_distance_${uid}`);
    }

    setIsTracking(false);
    setRoute([]);
    setTrackingStartTime(null);
    setCurrentDistance(0);
    setElapsedTime(0);
    setCurrentSpeed(0);

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
        if ((result as any).newAchievements) triggerAchievementUnlock((result as any).newAchievements);
        const updated = { 
          ...currentUser!,
          name: newName, 
          avatar_id: newAvatar,
          avatar_image: newAvatarImage,
          login_id: newLoginId || currentUser?.login_id,
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

  const handleUpdatePredictParams = async (
    currentWeight: number, 
    targetWeight: number, 
    targetCaloriesBurned: number, 
    targetCaloriesConsumed: number,
    gender: string | null,
    age: number | null,
    height: number | null
  ) => {
    if (!currentUser) return;
    try {
      const payload: any = { 
        name: currentUser.name, 
        avatar_id: currentUser.avatar_id,
        avatar_image: currentUser.avatar_image || null,
        current_weight: currentWeight,
        target_weight: targetWeight,
        target_calories_burned: targetCaloriesBurned,
        target_calories_consumed: targetCaloriesConsumed,
        gender: gender,
        age: age,
        height: height
      };
      if (currentUser.login_id) payload.login_id = currentUser.login_id;

      const res = await client.api.users.me.$put({ json: payload });
      const result = await res.json();
      
      if (res.ok && 'success' in result && result.success) {
        if ((result as any).newAchievements) triggerAchievementUnlock((result as any).newAchievements);
        const updated = { 
          ...currentUser, 
          current_weight: currentWeight,
          target_weight: targetWeight,
          target_calories_burned: targetCaloriesBurned,
          target_calories_consumed: targetCaloriesConsumed,
          gender: gender,
          age: age,
          height: height
        };
        setCurrentUser(updated);
        const oldUser = JSON.parse(localStorage.getItem('physiproof_user') || '{}');
        localStorage.setItem('physiproof_user', JSON.stringify({ 
          ...oldUser, 
          current_weight: currentWeight,
          target_weight: targetWeight,
          target_calories_burned: targetCaloriesBurned,
          target_calories_consumed: targetCaloriesConsumed,
          gender: gender,
          age: age,
          height: height
        }));
      } else {
        console.error('Failed to update prediction parameters on server:', result);
      }
    } catch (e) {
      console.error('Error updating prediction parameters:', e);
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
        @keyframes pulseGlowCyan {
          0% { fill-opacity: 0.35; stroke-width: 3.5; filter: drop-shadow(0 0 5px rgba(0,212,255,0.7)); }
          50% { fill-opacity: 0.5; stroke-width: 5; filter: drop-shadow(0 0 15px rgba(0,212,255,1)); }
          100% { fill-opacity: 0.35; stroke-width: 3.5; filter: drop-shadow(0 0 5px rgba(0,212,255,0.7)); }
        }
        @keyframes pulseGlowGold {
          0% { fill-opacity: 0.4; stroke-width: 4; filter: drop-shadow(0 0 6px rgba(255,204,0,0.8)); }
          50% { fill-opacity: 0.55; stroke-width: 6; filter: drop-shadow(0 0 18px rgba(255,204,0,1)); }
          100% { fill-opacity: 0.4; stroke-width: 4; filter: drop-shadow(0 0 6px rgba(255,204,0,0.8)); }
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
        .own-fortified-mid { animation: pulseGlowCyan 3.5s infinite ease-in-out; }
        .own-fortified-high { animation: pulseGlowGold 3s infinite ease-in-out; }
        .other-territory { animation: pulseGlowOther 5s infinite ease-in-out; transition: all 0.3s ease; }
        .own-territory:hover { fill-opacity: 0.55 !important; stroke-width: 4.5 !important; cursor: pointer; }
        .other-territory:hover { fill-opacity: 0.4 !important; stroke-width: 3 !important; cursor: pointer; }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #333; }

        .pp-username { display: none; }
        .pp-bottom-nav {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000;
          background: rgba(4, 6, 12, 0.92);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border-top: 1px solid rgba(0, 255, 136, 0.25);
          padding: 0.4rem 0.5rem 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          display: flex; justify-content: space-around; align-items: flex-start;
          box-shadow: 0 -8px 25px rgba(0,255,136,0.08);
          height: calc(64px + env(safe-area-inset-bottom, 0px));
          box-sizing: border-box;
          font-family: 'Share Tech Mono', monospace;
        }
        .pp-bottom-nav button {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          background: none; border: none; cursor: pointer; padding: 4px 10px;
          border-radius: 4px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); min-width: 48px;
          height: 48px;
          -webkit-tap-highlight-color: transparent;
        }
        .pp-bottom-nav button .pp-nav-icon { font-size: 1.3rem; line-height: 1; filter: grayscale(0.2) opacity(0.7); transition: all 0.2s; }
        .pp-bottom-nav button .pp-nav-label { font-size: 0.55rem; font-weight: 700; letter-spacing: 0.04em; transition: all 0.2s; font-family: 'Share Tech Mono', monospace; }
        .pp-bottom-nav button.pp-active { background: rgba(0,255,136,0.05); border: 1px solid rgba(0,255,136,0.25); box-shadow: 0 0 10px rgba(0,255,136,0.1); }
        .pp-bottom-nav button.pp-active .pp-nav-icon { filter: grayscale(0) opacity(1); transform: scale(1.1); }
        .pp-bottom-nav button.pp-active .pp-nav-label { color: #00ff88; text-shadow: 0 0 10px rgba(0,255,136,0.3); }
        .pp-bottom-nav button:not(.pp-active) .pp-nav-label { color: #555; }

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
          padding: 1rem 1rem 80px;
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

        @media (min-width: 768px) {
          .pp-username { display: inline !important; }
          .pp-bottom-nav { display: none; }
          .pp-desktop-tabs { display: flex !important; }
          .pp-main { padding: 2rem 2rem 2rem; max-width: 1200px; margin: 0 auto; overflow-y: auto; }
          .pp-section-header h2 { font-size: 1.6rem; }
          .pp-content-card { padding: 2rem; border-radius: 28px; }
          .pp-exercise-grid { grid-template-columns: 1fr 1fr !important; }
          .pp-predict-grid { grid-template-columns: 1fr 1fr !important; }
          .pp-meal-layout { flex-direction: row !important; }
          .pp-meal-upload { flex: 0 0 350px !important; width: auto !important; }
          .pp-meal-result { flex: 1 !important; }
          .pp-pfc-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }

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
            height: auto;
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
            border-top: 1px solid rgba(255,255,255,0.06) !important;
            background: rgba(10, 10, 10, 0.95) !important;
            z-index: 99;
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
          <TabButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} label="ホーム" icon="🏠" />
          <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} label="マップ" icon="🗺️" />
          <TabButton active={activeTab === 'exercise'} onClick={() => setActiveTab('exercise')} label="記録" icon="💪" />
          <TabButton active={activeTab === 'ai-predict'} onClick={() => setActiveTab('ai-predict')} label="予測" icon="✨" />
          <TabButton active={activeTab === 'meal'} onClick={() => setActiveTab('meal')} label="食事" icon="🥗" />
          <TabButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} label="ランク" icon="🏆" />
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} label="コーチ" icon="💬" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <NotificationsCenter currentUser={currentUser} />

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
          {currentUser.role === 'admin' && (
            <Link
              to="/admin"
              style={{
                color: '#ff007f',
                textDecoration: 'none',
                fontSize: '0.75rem',
                border: '1px solid rgba(255,0,127,0.3)',
                backgroundColor: 'rgba(255,0,127,0.08)',
                padding: '4px 10px',
                borderRadius: '8px',
                fontWeight: 'bold',
                marginRight: '0.4rem',
                transition: '0.2s',
                boxShadow: '0 0 10px rgba(255,0,127,0.1)'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,0,127,0.2)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,0,127,0.08)'}
            >
              🛡️ 管理画面
            </Link>
          )}
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
      <main
        className="pp-main"
        style={activeTab === 'chat' ? { overflow: 'hidden', padding: 0 } : undefined}
      >
        {activeTab !== 'chat' && activeTab !== 'home' && (
          <div className="pp-section-header">
            <h2 style={{ background: 'linear-gradient(90deg, #fff, #888)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: "'Share Tech Mono', monospace" }}>
              {activeTab === 'map' && '支配領域'}
              {activeTab === 'exercise' && '運動証明'}
              {activeTab === 'ai-predict' && '未来予測'}
              {activeTab === 'meal' && '食事解析'}
              {activeTab === 'ranking' && 'グローバル勢力'}
            </h2>
            <div style={{ width: '28px', height: '3px', background: 'linear-gradient(90deg, #00ff88, #00d4ff)', margin: '0.2rem auto 0', borderRadius: '2px' }}></div>
          </div>
        )}

        {activeTab === 'chat' ? (
          <ChatSection keyboardOffset={keyboardOffset} triggerAchievementUnlock={triggerAchievementUnlock} />
        ) : (
          <div className="pp-content-card">
            
            {/* Home Tab */}
            {activeTab === 'home' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <HomeHubSection
                  currentUser={currentUser}
                  todayMission={todayMission}
                  onNavigateTab={setActiveTab}
                  onStartQuickRun={() => {
                    setActiveTab('map');
                    // auto starts tracking if map was loaded
                    setIsTracking(true);
                    setRoute([]);
                    setTrackingStartTime(Date.now());
                    setCurrentDistance(0);
                    setElapsedTime(0);
                    setCurrentSpeed(0);
                    const uid = currentUser.uid;
                    localStorage.setItem(`physiproof_run_is_tracking_${uid}`, 'true');
                    localStorage.setItem(`physiproof_run_route_${uid}`, JSON.stringify([]));
                    localStorage.setItem(`physiproof_run_start_time_${uid}`, String(Date.now()));
                    localStorage.setItem(`physiproof_run_distance_${uid}`, '0');
                  }}
                  caloriesBurnedToday={caloriesBurnedToday}
                  caloriesConsumedToday={caloriesConsumedToday}
                  onExpandMission={() => setIsMissionExpanded(true)}
                />
                
                {todayMission && todayMission.is_completed === 1 && todayMission.claimed === 0 && isMissionExpanded && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <FortifyTerritorySelector
                      missionId={todayMission.id}
                      onClose={() => setIsMissionExpanded(false)}
                      onSuccess={() => {
                        setIsMissionExpanded(false);
                        fetchTodayMission();
                        fetchUserProfile();
                      }}
                      triggerAchievementUnlock={triggerAchievementUnlock}
                    />
                  </div>
                )}

                <RPGStatsSection
                  currentUser={currentUser}
                  onReloadProfile={fetchUserProfile}
                  triggerAchievementUnlock={triggerAchievementUnlock}
                />
              </div>
            )}

            {/* Map Tab Mission Widget */}
            {activeTab === 'map' && todayMission && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1.2rem',
                borderRadius: '16px',
                background: todayMission.is_completed && !todayMission.claimed
                  ? 'linear-gradient(135deg, rgba(0,255,136,0.06) 0%, rgba(0,212,255,0.04) 100%)'
                  : 'rgba(10, 10, 10, 0.4)',
                border: todayMission.is_completed && !todayMission.claimed
                  ? '1px solid rgba(0,255,136,0.25)'
                  : '1px solid rgba(255,255,255,0.04)',
                boxShadow: todayMission.is_completed && !todayMission.claimed
                  ? '0 0 20px rgba(0,255,136,0.06)'
                  : 'none',
                transition: 'all 0.3s ease'
              }}>
                <div 
                  onClick={() => setIsMissionExpanded(!isMissionExpanded)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '2px 0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1rem' }}>⚔️</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#ffffff', letterSpacing: '0.02em' }}>
                      今日の防衛ミッション
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      fontSize: '0.62rem',
                      fontWeight: 'bold',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      backgroundColor: todayMission.claimed ? 'rgba(0,255,136,0.12)' : todayMission.is_completed ? 'rgba(255,204,0,0.12)' : 'rgba(255,255,255,0.04)',
                      color: todayMission.claimed ? '#00ff88' : todayMission.is_completed ? '#ffcc00' : '#8a8a93'
                    }}>
                      {todayMission.claimed ? '✅ 報酬受取済' : todayMission.is_completed ? '🎉 達成！' : '進行中'}
                    </div>
                    <span style={{ 
                      fontSize: '0.62rem', 
                      color: '#8a8a93', 
                      transform: isMissionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.25s ease',
                      display: 'inline-block'
                    }}>
                      ▼
                    </span>
                  </div>
                </div>

                <div style={{
                  maxHeight: isMissionExpanded ? '500px' : '0px',
                  overflow: 'hidden',
                  opacity: isMissionExpanded ? 1 : 0,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  marginTop: isMissionExpanded ? '0.8rem' : '0px'
                }}>
                  <div style={{ marginBottom: '0.8rem' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: '800', color: todayMission.is_completed ? '#00ff88' : '#d1d1d6', marginBottom: '3px' }}>
                      {todayMission.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#8a8a93', fontWeight: '600', lineHeight: '1.4' }}>
                      {todayMission.description}
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#8a8a93', fontWeight: '700' }}>進捗</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '900', color: todayMission.is_completed ? '#00ff88' : '#00d4ff', fontFamily: "'Outfit', sans-serif" }}>
                        {Math.min(todayMission.current_count, todayMission.target_count)} / {todayMission.target_count}
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((todayMission.current_count / todayMission.target_count) * 100, 100)}%`,
                        height: '100%',
                        borderRadius: '3px',
                        background: todayMission.is_completed
                          ? 'linear-gradient(90deg, #00ff88, #00d4ff)'
                          : 'linear-gradient(90deg, #00d4ff, #00ff88)',
                        boxShadow: todayMission.is_completed ? '0 0 10px #00ff88' : '0 0 6px #00d4ff',
                        transition: 'width 0.5s ease'
                      }}></div>
                    </div>
                  </div>

                  {todayMission.is_completed === 1 && todayMission.claimed === 0 && (
                    <div>
                      {!showFortifyModal ? (
                        <button
                          onClick={() => setShowFortifyModal(true)}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                            color: '#000',
                            fontWeight: '900',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            marginTop: '0.4rem',
                            boxShadow: '0 4px 16px rgba(0,255,136,0.2)',
                            transition: 'all 0.2s'
                          }}
                        >
                          🛡️ 報酬を受け取り、領土を要塞化する
                        </button>
                      ) : (
                        <FortifyTerritorySelector
                          missionId={todayMission.id}
                          onClose={() => setShowFortifyModal(false)}
                          onSuccess={() => {
                            setShowFortifyModal(false);
                            fetchTodayMission();
                            fetchUserProfile();
                          }}
                          triggerAchievementUnlock={triggerAchievementUnlock}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Map Tab */}
            {activeTab === 'map' && (
              <MapView
                currentUser={currentUser}
                isTracking={isTracking}
                setIsTracking={setIsTracking}
                route={route}
                setRoute={setRoute}
                currentDistance={currentDistance}
                setCurrentDistance={setCurrentDistance}
                trackingStartTime={trackingStartTime}
                setTrackingStartTime={setTrackingStartTime}
                elapsedTime={elapsedTime}
                setElapsedTime={setElapsedTime}
                currentPos={currentPos}
                setCurrentPos={setCurrentPos}
                currentSpeed={currentSpeed}
                setCurrentSpeed={setCurrentSpeed}
                heading={heading}
                setHeading={setHeading}
                triggerAchievementUnlock={triggerAchievementUnlock}
              />
            )}

            {/* Other Tabs */}
            {activeTab === 'exercise' && (
              <ExerciseSection 
                uid={currentUser.uid} 
                onActionComplete={() => {
                  fetchTodayMission();
                  fetchDailyCalorieBalances();
                }} 
                triggerAchievementUnlock={triggerAchievementUnlock} 
              />
            )}
            
            {activeTab === 'ai-predict' && (
              <AIPredictSection 
                currentUser={currentUser} 
                onUpdatePredictParams={handleUpdatePredictParams} 
              />
            )}
            
            {activeTab === 'meal' && (
              <MealAnalysisSection 
                onActionComplete={() => {
                  fetchTodayMission();
                  fetchDailyCalorieBalances();
                }} 
                triggerAchievementUnlock={triggerAchievementUnlock} 
              />
            )}
            
            {activeTab === 'ranking' && (
              <RankingView 
                ranking={ranking} 
                period={rankingPeriod} 
                setPeriod={setRankingPeriod} 
                duration={rankingDuration} 
                setDuration={setRankingDuration} 
              />
            )}

          </div>
        )}
      </main>

      {/* --- Bottom Navigation (Mobile) --- */}
      <nav className="pp-bottom-nav" style={{
        bottom: `${keyboardOffset}px`,
        ...(keyboardOffset > 0 ? {
          height: '64px',
          paddingBottom: '0',
        } : {})
      }}>
        {[
          { key: 'home' as TabType, icon: '🏠', label: 'ホーム' },
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

      {/* Achievement popups */}
      <div className="achievement-toast-container">
        {activeAchievementToasts.map((toast) => (
          <div 
            key={toast.uniqueId} 
            className={`achievement-toast ${toast.visible ? 'show' : 'hide'}`}
          >
            <div className="achievement-toast-icon-wrapper">
              {toast.icon}
            </div>
            <div className="achievement-toast-content">
              <span className="achievement-toast-badge">ACHIEVEMENT UNLOCKED</span>
              <h4 className="achievement-toast-title">{toast.title}</h4>
              <p className="achievement-toast-desc">{toast.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
