import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pushupMeasurementSchema, type PushupMeasurement } from '@my-app/shared';
import client from '../lib/hc';
import InfoHint from './InfoHint';
import AppIcon, { LegacyIcon } from './AppIcon';

const labelStyle: React.CSSProperties = { 
  display: 'block', 
  fontSize: '0.8rem', 
  color: '#8a8a93', 
  marginBottom: '0.5rem', 
  fontWeight: '700' 
};

const inputStyle: React.CSSProperties = { 
  width: '100%', 
  backgroundColor: 'rgba(5, 5, 5, 0.75)', 
  border: '1px solid rgba(255,255,255,0.08)', 
  borderRadius: '12px', 
  padding: '0.9rem', 
  color: '#fff', 
  boxSizing: 'border-box', 
  fontSize: '1rem', 
  WebkitAppearance: 'none' 
};

const submitButtonStyle = (color: string): React.CSSProperties => ({
  width: '100%', 
  backgroundColor: color, 
  color: '#000', 
  border: 'none', 
  padding: '1rem', 
  borderRadius: '14px', 
  fontWeight: '900', 
  cursor: 'pointer', 
  fontSize: '1rem', 
  WebkitTapHighlightColor: 'transparent', 
  transition: 'all 0.2s', 
  boxShadow: `0 4px 12px ${color}22`
});

interface AutoCounterOverlayProps {
  exerciseType: string;
  onClose: () => void;
  onFinish: (count: number, sensorLog: any[]) => void;
}

const AutoCounterOverlay: React.FC<AutoCounterOverlayProps> = ({ exerciseType, onClose, onFinish }) => {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<'ready' | 'counting'>('ready');
  const [isMuted, setIsMuted] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [bounceActive, setBounceActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ampRef = useRef<number>(10);
  const speedRef = useRef<number>(0.05);
  const sensorLogRef = useRef<{ x: number, y: number, z: number, gx?: number, gy?: number, gz?: number, t: number }[]>([]);

  // タッチやキーボード操作時のモック運動波形の生成
  const generateMockSensorSpike = () => {
    const now = Date.now();
    for (let i = 0; i < 15; i++) {
      const t = now - (15 - i) * 60;
      const angle = (i / 15) * Math.PI * 2;
      sensorLogRef.current.push({
        x: Math.sin(angle) * 2.8 + (Math.random() - 0.5) * 0.4,
        y: 9.8 + Math.cos(angle) * 3.5 + (Math.random() - 0.5) * 0.4,
        z: Math.sin(angle * 2) * 1.8 + (Math.random() - 0.5) * 0.4,
        gx: Math.sin(angle) * 6, // 5より大きいジャイロ値でMotion Lockをクリア
        gy: Math.cos(angle) * 6,
        gz: 0,
        t
      });
    }
  };

  // 音声フィードバック
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
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
    
    if (!isMuted) {
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
    }
    
    // タッチやカウント時の波形スパイク
    ampRef.current = 50;
    speedRef.current = 0.2;
    generateMockSensorSpike(); // デモ用にモック波形を蓄積

    // フラッシュとバウンスエフェクトのトリガー
    setFlashActive(true);
    setBounceActive(true);
    const t1 = setTimeout(() => setFlashActive(false), 150);
    const t2 = setTimeout(() => setBounceActive(false), 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [count, status, isMuted]);

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
      const rot = e.rotationRate;
      if (acc) {
        const ax = acc.x ?? 0;
        const ay = acc.y ?? 0;
        const az = acc.z ?? 0;
        const norm = Math.sqrt(ax ** 2 + ay ** 2 + az ** 2);
        ampRef.current = Math.max(10, Math.min(55, norm * 3.5));
        speedRef.current = Math.max(0.05, Math.min(0.25, norm * 0.01));

        // 自動計測中のみセンサーログに追記 (最大200レコード)
        if (status === 'counting' && sensorLogRef.current.length < 200) {
          const gx = rot?.alpha ?? (Math.abs(ax) > 1 ? ax * 3 : 0);
          const gy = rot?.beta ?? (Math.abs(ay) > 10 ? (ay - 9.8) * 3 : 0);
          sensorLogRef.current.push({
            x: ax,
            y: ay || 9.8,
            z: az,
            gx: gx,
            gy: gy,
            gz: rot?.gamma || 0,
            t: Date.now()
          });
        }
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
    <div style={{ 
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      backgroundColor: flashActive ? 'rgba(0, 212, 255, 0.12)' : '#020202', 
      zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'background-color 0.15s ease-out'
    }}>
      {/* ミュート切り替えトグル */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsMuted(!isMuted);
        }}
        aria-label={isMuted ? '音声フィードバックを有効にする' : '音声フィードバックをミュートする'}
        title={isMuted ? '音声フィードバックを有効にする' : '音声フィードバックをミュートする'}
        aria-pressed={isMuted}
        style={{
          position: 'absolute', top: '2rem', right: '2rem',
          background: 'none', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', width: '42px', height: '42px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isMuted ? '#8a8a93' : '#00d4ff', cursor: 'pointer',
          fontSize: '1.2rem', backgroundColor: isMuted ? 'rgba(255,255,255,0.02)' : 'rgba(0,212,255,0.05)',
          boxShadow: isMuted ? 'none' : '0 0 12px rgba(0,212,255,0.15)',
          transition: 'all 0.2s', zIndex: 10001,
          outline: 'none'
        }}
      >
        <AppIcon name={isMuted ? 'mute' : 'sound'} size={20} />
      </button>

      <div style={{ position: 'absolute', top: '2rem', textAlign: 'center', width: '90%' }}>
        <h2 style={{ color: '#00d4ff', margin: '0 0 4px 0', fontSize: '1.4rem' }}>{exerciseType} 自動計測</h2>
        <p style={{ color: '#8a8a93', margin: 0, fontSize: '0.82rem', fontWeight: 'bold' }}>
          <AppIcon name="info" />{' '}
          {exerciseType === '腕立て伏せ' ? 'スマホを床に置き、鼻先で画面にタッチしてください' : '画面をタップしてカウントします'}
        </p>
      </div>

      <div style={{ width: '85%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
        {/* Canvas 波形モニター */}
        <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,136,0.1)', borderRadius: '12px', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ color: '#00ff88', fontSize: '0.65rem', fontWeight: 'bold', width: '90%', textAlign: 'left', marginBottom: '4px', letterSpacing: '0.08em' }}><AppIcon name="radio" /> BIOMETRIC SENSOR STREAM</div>
          <canvas ref={canvasRef} style={{ width: '100%', height: '120px' }} />
        </div>

        {/* カウンターボタン */}
        <div
          onClick={handleTouch}
          style={{
            width: '200px', height: '200px', border: `3px solid ${flashActive ? '#00d4ff' : '#00ff88'}`, borderRadius: '50%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            backgroundColor: flashActive ? 'rgba(0, 212, 255, 0.08)' : 'rgba(0, 255, 136, 0.03)', 
            transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: flashActive ? '0 0 40px rgba(0,212,255,0.3)' : '0 0 30px rgba(0,255,136,0.06)',
            transform: bounceActive ? 'scale(1.08)' : 'scale(1)'
          }}
        >
          <div style={{ 
            fontSize: '6rem', 
            fontWeight: '900', 
            color: flashActive ? '#00d4ff' : '#00ff88', 
            lineHeight: 1,
            transform: bounceActive ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
            display: 'inline-block'
          }}>{count}</div>
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
          onClick={() => onFinish(count, sensorLogRef.current)}
          style={{ flex: 2, padding: '1rem', borderRadius: '12px', backgroundColor: '#00ff88', color: '#000', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem', boxShadow: '0 8px 20px rgba(0,255,136,0.2)' }}
        >
          記録を確定して送信
        </button>
      </div>
    </div>
  );
};

interface ExerciseSectionProps {
  uid: string;
  onActionComplete?: () => void;
  triggerAchievementUnlock: (achievements: any[]) => void;
}

export const ExerciseSection: React.FC<ExerciseSectionProps> = ({ 
  uid, 
  onActionComplete, 
  triggerAchievementUnlock 
}) => {
  const [stats, setStats] = useState<any[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'all'>('all');
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [customType, setCustomType] = useState('');
  const [lastSensorLog, setLastSensorLog] = useState<any[] | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'record' | 'calendar'>('record');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('20:00');

  const fetchSchedules = async () => {
    try {
      const res = await client.api.schedules.$get();
      if (res.ok) {
        const data = await res.json();
        setSchedules((data as any).schedules || []);
      }
    } catch (e) {
      console.error('Failed to fetch schedules:', e);
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleTitle.trim()) return;

    const [hours, minutes] = newScheduleTime.split(':').map(Number);
    const scheduledDate = new Date(selectedDate);
    scheduledDate.setHours(hours || 0, minutes || 0, 0, 0);

    try {
      const res = await client.api.schedules.$post({
        json: {
          title: newScheduleTitle,
          scheduled_at: scheduledDate.toISOString(),
        }
      });
      if (res.ok) {
        setNewScheduleTitle('');
        fetchSchedules();
      } else {
        const err = await res.json();
        alert('追加エラー: ' + ((err as any).error || '失敗しました'));
      }
    } catch (e) {
      console.error(e);
      alert('通信エラーが発生しました。');
    }
  };

  const handleToggleSchedule = async (id: string) => {
    try {
      const res = await client.api.schedules[':id'].toggle.$post({
        param: { id }
      });
      if (res.ok) {
        fetchSchedules();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('この予定を削除してもよろしいですか？')) return;
    try {
      const res = await client.api.schedules[':id'].$delete({
        param: { id }
      });
      if (res.ok) {
        fetchSchedules();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

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
        if ((result as any).newAchievements) triggerAchievementUnlock((result as any).newAchievements);
        alert((result as any).message || '送信成功');
        fetchStats(); // 成功したら記録を更新
        onActionComplete?.(); // デイリーミッション進捗を更新
      }
    } catch (e) {
      alert('通信エラー: オンラインサーバーに接続できませんでした。記録は保存されていません。');
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

  // 月カレンダーのグリッド生成用ヘルパー
  const getDaysInMonth = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];

    // 最初の日より前の曜日埋め (日曜日始まりとする)
    const startOffset = firstDay.getDay();
    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }

    // 日付を埋める
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const daysOfCalendar = getDaysInMonth(calendarMonth);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* サブトグルタブ */}
      <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('record')}
          style={{
            flex: 1,
            padding: '0.6rem',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: activeSubTab === 'record' ? 'rgba(0, 255, 136, 0.08)' : 'transparent',
            color: activeSubTab === 'record' ? '#00ff88' : '#8a8a93',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          <AppIcon name="exercise" /> 記録する
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('calendar')}
          style={{
            flex: 1,
            padding: '0.6rem',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: activeSubTab === 'calendar' ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
            color: activeSubTab === 'calendar' ? '#00d4ff' : '#8a8a93',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          <AppIcon name="calendar" /> トレーニング計画
        </button>
      </div>

      {activeSubTab === 'record' ? (
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
                    <div style={{ marginBottom: '0.3rem', color: isSelected ? '#00ff88' : '#8a8a93' }}><LegacyIcon glyph={item.icon} fallback="exercise" size={32} /></div>
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
                  <AppIcon name="activity" size={20} style={{ color: '#00d4ff' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00d4ff' }}>AI センサー自動計測</span>
                  <InfoHint label="AIセンサー計測" text="スマホ内蔵センサーで運動データを解析し、回数を自動測定します。記録は運動の確認用で、ゲーム報酬には加算されません。" />
                </div>
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
                  <AppIcon name="play" /> 自動計測モードを開始
                </button>
              </div>

              {/* Manual Input Route */}
              <div style={{ padding: '1.2rem', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <AppIcon name="edit" size={20} />
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
              onFinish={(count, sensorLog) => {
                setValue('count', count);
                setValue('sensor_log', sensorLog);
                setLastSensorLog(sensorLog);
                setIsAutoMode(false);
                handleSubmit(onSubmit)();
              }}
            />
          )}

          {/* 運動シグネチャ折れ線グラフの表示 */}
          {(() => {
            if (!lastSensorLog || lastSensorLog.length < 5) return null;

            const width = 360;
            const height = 150;
            const padding = 20;

            let minVal = -5;
            let maxVal = 20;

            const step = (width - padding * 2) / (lastSensorLog.length - 1 || 1);
            const coords = lastSensorLog.map((item, index) => {
              const xPos = padding + index * step;
              const yScale = (height - padding * 2) / (maxVal - minVal || 1);
              const yPos_x = height - padding - (item.x - minVal) * yScale;
              const yPos_y = height - padding - (item.y - minVal) * yScale;
              const yPos_z = height - padding - (item.z - minVal) * yScale;
              return { x: xPos, yx: yPos_x, yy: yPos_y, yz: yPos_z };
            });

            const pathD_x = `M ${coords[0].x} ${coords[0].yx} ` + coords.slice(1).map(p => `L ${p.x} ${p.yx}`).join(' ');
            const pathD_y = `M ${coords[0].x} ${coords[0].yy} ` + coords.slice(1).map(p => `L ${p.x} ${p.yy}`).join(' ');
            const pathD_z = `M ${coords[0].x} ${coords[0].yz} ` + coords.slice(1).map(p => `L ${p.x} ${p.yz}`).join(' ');

            return (
              <div className="cyber-glass" style={{ padding: '1.2rem', borderRadius: '16px', border: '1px solid rgba(0, 255, 136, 0.15)', backgroundColor: 'rgba(5,5,5,0.4)', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ color: '#00ff88', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.08em' }}><AppIcon name="radio" /> 最新 of 運動物理シグネチャ（波形）</div>
                  <button 
                    onClick={() => setLastSensorLog(null)} 
                    style={{ backgroundColor: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                  >
                    閉じる
                  </button>
                </div>

                <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
                  <line x1={padding} y1={height/2} x2={width-padding} y2={height/2} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  
                  <path d={pathD_x} fill="none" stroke="#ff007f" strokeWidth="1.8" opacity="0.85" />
                  <path d={pathD_y} fill="none" stroke="#00ff88" strokeWidth="2.2" />
                  <path d={pathD_z} fill="none" stroke="#00d4ff" strokeWidth="1.8" opacity="0.85" />
                </svg>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '8px', fontSize: '0.68rem', fontWeight: 'bold' }}>
                  <span style={{ color: '#ff007f' }}>■ X軸 (左右揺れ)</span>
                  <span style={{ color: '#00ff88' }}>■ Y軸 (上下動)</span>
                  <span style={{ color: '#00d4ff' }}>■ Z軸 (前後加速度)</span>
                </div>
              </div>
            );
          })()}

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
                      {!s.exercise_type.includes('支配領域') && (
                        <button
                          onClick={() => handleDeleteType(s.exercise_type)}
                          aria-label={`${s.exercise_type}の記録を削除`}
                          style={{ 
                            background: 'rgba(255,68,68,0.06)', 
                            border: '1px solid rgba(255,68,68,0.15)', 
                            color: '#ff4444',
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
                          <AppIcon name="delete" />
                        </button>
                      )}
                      <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {s.exercise_type}
                      </span>
                    </div>
                    
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: '#00ff88', fontWeight: '800', fontSize: '1.05rem', fontFamily: "'Outfit', sans-serif" }}>
                        {s.total_count.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{s.exercise_type.includes('支配領域') ? 'm' : '回'}</span>
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
                          <AppIcon name="flame" /> 約 {s.estimated_calories} kcal
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#444' }}>
                <div style={{ marginBottom: '0.8rem', color: '#8a8a93' }}><AppIcon name="exercise" size={32} /></div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', color: '#555' }}>記録がありません</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* カレンダーUI */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* 月選択ヘッダー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', padding: '0.8rem 1.2rem', borderRadius: '16px' }}>
            <button
              type="button"
              onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              aria-label="前の月を表示"
              title="前の月を表示"
              style={{ background: 'none', border: 'none', color: '#00d4ff', fontSize: '1.2rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}
            >
              <AppIcon name="back" size={20} />
            </button>
            <span style={{ fontSize: '1rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>
              {calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月
            </span>
            <button
              type="button"
              onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              aria-label="次の月を表示"
              title="次の月を表示"
              style={{ background: 'none', border: 'none', color: '#00d4ff', fontSize: '1.2rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}
            >
              <AppIcon name="chevron" size={20} />
            </button>
          </div>

          {/* カレンダーグリッド */}
          <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '16px', padding: '1rem' }}>
            {/* 曜日表示 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
              {['日', '月', '火', '水', '木', '金', '土'].map((w, idx) => (
                <span key={w} style={{ fontSize: '0.75rem', fontWeight: 'bold', color: idx === 0 ? '#ff4444' : idx === 6 ? '#00d4ff' : '#8a8a93', paddingBottom: '4px' }}>
                  {w}
                </span>
              ))}
            </div>

            {/* 日付セル */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
              {daysOfCalendar.map((date, idx) => {
                if (!date) return <div key={`empty-${idx}`} style={{ aspectRatio: '1' }} />;

                const isSelected = selectedDate.toDateString() === date.toDateString();
                const isToday = new Date().toDateString() === date.toDateString();
                
                // その日のスケジュール数を計算
                const daySchedules = schedules.filter(s => {
                  const d = new Date(s.scheduled_at);
                  return d.toDateString() === date.toDateString();
                });
                
                const hasSchedules = daySchedules.length > 0;
                const hasPendingSchedules = daySchedules.some(s => s.completed !== 1);

                return (
                  <div
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '12px',
                      backgroundColor: isSelected 
                        ? 'rgba(0, 212, 255, 0.12)' 
                        : isToday 
                        ? 'rgba(255,255,255,0.05)' 
                        : 'rgba(255,255,255,0.01)',
                      border: isSelected 
                        ? '1.5px solid #00d4ff' 
                        : isToday 
                        ? '1px dashed rgba(0, 212, 255, 0.4)' 
                        : '1px solid rgba(255,255,255,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxSizing: 'border-box'
                    }}
                  >
                    <span style={{ 
                      fontSize: '0.85rem', 
                      fontWeight: isToday || isSelected ? 'bold' : 'normal',
                      color: isSelected 
                        ? '#00d4ff' 
                        : isToday 
                        ? '#ffffff' 
                        : date.getDay() === 0 
                        ? '#ff4444' 
                        : date.getDay() === 6 
                        ? '#00d4ff' 
                        : '#ffffff'
                    }}>
                      {date.getDate()}
                    </span>

                    {/* スケジュール通知用ドット */}
                    {hasSchedules && (
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: hasPendingSchedules ? '#ffcc00' : '#00ff88',
                        position: 'absolute',
                        bottom: '5px',
                        boxShadow: hasPendingSchedules ? '0 0 6px #ffcc00' : '0 0 6px #00ff88'
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 選択した日の予定リスト */}
          <div style={{ textAlign: 'left' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#00d4ff', marginBottom: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AppIcon name="calendar" /> {selectedDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })} の計画一覧
            </h4>

            {(() => {
              const daySchedules = schedules.filter(s => {
                const d = new Date(s.scheduled_at);
                return d.toDateString() === selectedDate.toDateString();
              }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

              if (daySchedules.length === 0) {
                return (
                  <div style={{ color: '#666', fontSize: '0.8rem', padding: '1.5rem', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.005)' }}>
                    予定されたトレーニング計画はありません。
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {daySchedules.map(sch => {
                    const timeStr = new Date(sch.scheduled_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                    const isCompleted = sch.completed === 1;

                    return (
                      <div
                        key={sch.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.8rem 1rem',
                          borderRadius: '12px',
                          backgroundColor: isCompleted ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                          border: isCompleted ? '1px solid rgba(255,255,255,0.02)' : '1px solid rgba(255,255,255,0.05)',
                          transition: 'all 0.2s',
                          opacity: isCompleted ? 0.55 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={() => handleToggleSchedule(sch.id)}
                            style={{
                              width: '18px',
                              height: '18px',
                              accentColor: '#00ff88',
                              cursor: 'pointer'
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              color: isCompleted ? '#8a8a93' : '#ffffff',
                              textDecoration: isCompleted ? 'line-through' : 'none'
                            }}>
                              {sch.title}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#666', fontWeight: 'bold' }}>
                              <AppIcon name="timer" /> {timeStr}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(sch.id)}
                          aria-label={`${sch.title}の予定を削除`}
                          title="予定を削除"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ff4444',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            padding: '0.3rem',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.7,
                            transition: 'opacity 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                        >
                          <AppIcon name="delete" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* 計画の手動追加フォーム */}
          <div style={{ 
            marginTop: '0.5rem', 
            padding: '1.2rem', 
            border: '1px solid rgba(255,255,255,0.04)', 
            borderRadius: '16px', 
            background: 'rgba(255,255,255,0.01)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
              <AppIcon name="edit" size={20} />
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>計画を手動で追加</span>
            </div>
            
            <form onSubmit={handleAddSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>予定タイトル</label>
                <input
                  type="text"
                  value={newScheduleTitle}
                  onChange={e => setNewScheduleTitle(e.target.value)}
                  style={{ ...inputStyle, padding: '0.75rem' }}
                  placeholder="例: スクワット 50回"
                />
              </div>

              <div>
                <label style={labelStyle}>予定時間 (Time)</label>
                <input
                  type="time"
                  value={newScheduleTime}
                  onChange={e => setNewScheduleTime(e.target.value)}
                  style={{ ...inputStyle, padding: '0.75rem' }}
                />
              </div>

              <button 
                type="submit" 
                disabled={!newScheduleTitle.trim()}
                style={{
                  ...submitButtonStyle('#00d4ff'),
                  padding: '0.85rem',
                  fontSize: '0.9rem',
                  borderRadius: '12px',
                  boxShadow: newScheduleTitle.trim() ? '0 4px 12px rgba(0, 212, 255, 0.15)' : 'none'
                }}
              >
                カレンダーに追加
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
