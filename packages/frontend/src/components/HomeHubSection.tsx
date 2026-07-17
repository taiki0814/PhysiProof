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
    team_id?: string | null;
    team_name?: string | null;
  };
  todayMission: any | null;
  onNavigateTab: (tab: 'map' | 'exercise' | 'ai-predict' | 'meal' | 'ranking' | 'chat') => void;
  onStartQuickRun: () => void;
  caloriesBurnedToday: number;
  caloriesConsumedToday: number;
  onExpandMission: () => void;
  onManageTeam: () => void;
}

const HomeHubSection: React.FC<HomeHubSectionProps> = ({
  currentUser,
  todayMission,
  onNavigateTab,
  onStartQuickRun,
  caloriesBurnedToday,
  caloriesConsumedToday,
  onExpandMission,
  onManageTeam
}) => {
  const currentWeightVal = currentUser.current_weight || 70;
  const targetWeightVal = currentUser.target_weight || 68;

  // Calorie Targets (fallback to defaults if not set)
  const targetBurn = currentUser.target_calories_burned || 500;
  const targetConsume = currentUser.target_calories_consumed || 2000;

  // XP Progress
  const currentLevel = currentUser.level || 1;
  const currentXp = currentUser.xp || 0;
  const xpNeeded = currentLevel * 100;
  const xpProgress = Math.min(1, currentXp / xpNeeded);

  // Steps / Calories mock calculations matching design
  const currentSteps = Math.round(caloriesBurnedToday * 25);
  const targetSteps = Math.round(targetBurn * 25);
  const stepProgress = Math.min(1, currentSteps / (targetSteps || 1));
  const stepPercentage = Math.round(stepProgress * 100);
  const activeTimeMins = Math.round(caloriesBurnedToday * 0.15); // 100 kcal = 15 mins roughly
  const activeTimeHoursStr = activeTimeMins >= 60 
    ? `${Math.floor(activeTimeMins / 60)}h ${activeTimeMins % 60}m`
    : `${activeTimeMins}m`;

  // SVG parameters for step goal circle
  const circleRadius = 40;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleDashoffset = circleCircumference - stepProgress * circleCircumference;

  // Past 7 Days calorie trend generator based on real target
  const getPast7Days = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIdx = new Date().getDay(); // 0 is Sun, 1 is Mon...
    const adjustedIdx = todayIdx === 0 ? 6 : todayIdx - 1; // convert 0-6 to Mon=0...Sun=6
    
    const list = [];
    for (let i = 6; i >= 0; i--) {
      const idx = (adjustedIdx - i + 7) % 7;
      const isToday = i === 0;
      
      let value = 0;
      if (isToday) {
        value = Math.round(caloriesBurnedToday);
      } else {
        const base = targetBurn;
        const seed = idx + 2;
        const variance = Math.sin(seed * 2.3) * 60 + Math.cos(seed * 0.9) * 35;
        value = Math.max(80, Math.round(base + variance));
      }
      list.push({ label: days[idx], val: value, isToday });
    }
    return list;
  };

  const chartData = getPast7Days();
  const maxVal = Math.max(...chartData.map(d => d.val), targetBurn, 100);

  // Activities generator
  const getActivities = () => {
    const list = [];
    if (caloriesBurnedToday > 50) {
      list.push({
        title: 'CARDIO BURST',
        type: 'Running',
        time: `${activeTimeHoursStr}`,
        kcal: `${Math.round(caloriesBurnedToday)} kcal`,
        stat: `AGI +${Math.max(1, Math.round(caloriesBurnedToday / 150))}`,
        icon: '🏃‍♂️',
        color: '#00ff88'
      });
    } else {
      list.push({
        title: 'CARDIO BURST',
        type: 'Running',
        time: '45m',
        kcal: '510 kcal',
        stat: 'STR +3',
        icon: '🏃‍♂️',
        color: '#00ff88'
      });
    }

    list.push({
      title: 'STRENGTH FUSION',
      type: 'Weights',
      time: '30m',
      kcal: '320 kcal',
      stat: 'STR +5',
      icon: '🏋️‍♂️',
      color: '#00d4ff'
    });

    list.push({
      title: 'CORE CIRCUIT',
      type: 'Yoga',
      time: '20m',
      kcal: '180 kcal',
      stat: 'AGI +2',
      icon: '🧘‍♂️',
      color: '#ff007f'
    });

    return list;
  };

  const activities = getActivities();

  // Dynamic CSS Inject
  const hudCss = `
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Outfit:wght@400;600;900&display=swap');

    .hud-dashboard {
      font-family: 'Share Tech Mono', 'Courier New', monospace;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.2rem;
      color: #00ff88;
    }

    .hud-card {
      background: rgba(6, 10, 20, 0.8);
      border: 1px solid rgba(0, 255, 136, 0.25);
      border-radius: 6px;
      padding: 20px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 0 15px rgba(0, 255, 136, 0.08), inset 0 0 8px rgba(0, 255, 136, 0.03);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }

    .hud-card::before, .hud-card::after {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      border-color: #00ff88;
      border-style: solid;
      pointer-events: none;
    }
    .hud-card::before {
      top: -1px; left: -1px;
      border-width: 1.5px 0 0 1.5px;
    }
    .hud-card::after {
      bottom: -1px; right: -1px;
      border-width: 0 1.5px 1.5px 0;
    }

    .hud-title {
      font-size: 0.85rem;
      font-weight: bold;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin: 0 0 16px 0;
      border-left: 3px solid #00ff88;
      padding-left: 8px;
      text-align: left;
      font-family: 'Share Tech Mono', monospace;
    }

    .hud-bar-container {
      width: 100%;
      height: 8px;
      background-color: rgba(255,255,255,0.05);
      border-radius: 4px;
      overflow: hidden;
    }

    .hud-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #00ff88, #00d4ff);
      border-radius: 4px;
      box-shadow: 0 0 8px rgba(0,255,136,0.5);
    }

    .hud-stat-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
      color: #b0b0b8;
    }

    .hud-stat-value {
      font-weight: bold;
      color: #00ff88;
      font-family: 'Share Tech Mono', monospace;
    }

    /* Column Chart */
    .hud-bar-chart {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      height: 110px;
      padding-top: 15px;
      border-bottom: 1.5px solid rgba(0, 255, 136, 0.2);
      margin-bottom: 4px;
    }

    .hud-chart-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex: 1;
    }

    .hud-chart-bar-fill {
      width: 16px;
      border-radius: 3px 3px 0 0;
      background: linear-gradient(to top, rgba(0, 255, 136, 0.25), rgba(0, 255, 136, 0.95));
      box-shadow: 0 0 8px rgba(0,255,136,0.25);
      transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .hud-chart-val {
      font-size: 0.55rem;
      color: #00ff88;
      font-family: 'Share Tech Mono', monospace;
      margin-bottom: 2px;
    }

    .hud-chart-label {
      font-size: 0.6rem;
      color: #8a8a93;
      font-family: 'Share Tech Mono', monospace;
      text-transform: uppercase;
    }
  `;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <style dangerouslySetInnerHTML={{ __html: hudCss }} />

      {/* Header Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 0.5rem', marginTop: '0.2rem' }}>
        <span style={{ fontSize: '1.5rem', color: '#00ff88', textShadow: '0 0 10px rgba(0,255,136,0.4)', animation: 'pulse 2s infinite' }}>💚</span>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: '900',
          margin: 0,
          background: 'linear-gradient(135deg, #ffffff 40%, #00ff88 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontFamily: "'Share Tech Mono', monospace",
          letterSpacing: '1px'
        }}>
          PhysiProof
        </h1>
      </div>

      <div className="hud-dashboard">
        
        {/* PANEL 1: RPG CHARACTER */}
        <div className="hud-card">
          <div className="hud-title">RPG CHARACTER</div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '65px', height: '65px', flexShrink: 0 }}>
              <img
                src={getUserAvatarSrc(currentUser.avatar_id, currentUser.avatar_image)}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '4px',
                  border: '1.5px solid #00ff88',
                  boxShadow: '0 0 12px rgba(0,255,136,0.3)',
                  objectFit: 'cover'
                }}
                alt="User Avatar"
              />
              <span style={{
                position: 'absolute',
                bottom: '-6px',
                right: '-6px',
                backgroundColor: '#00ff88',
                color: '#000',
                fontSize: '0.62rem',
                fontWeight: 'bold',
                padding: '1px 5px',
                borderRadius: '3px',
                border: '1px solid #000',
                fontFamily: 'sans-serif'
              }}>
                {currentLevel}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </h3>
              <div style={{ fontSize: '0.65rem', color: '#8a8a93', marginTop: '4px' }}>
                XP: {currentXp} / {xpNeeded} XP
              </div>
              <div 
                onClick={onManageTeam}
                style={{ 
                  fontSize: '0.65rem', 
                  color: '#00d4ff', 
                  marginTop: '4px', 
                  cursor: 'pointer',
                  display: 'inline-block',
                  fontWeight: 'bold',
                  textDecoration: 'underline'
                }}
              >
                🛡️ チーム: {currentUser.team_name || '未所属 (タップして管理)'}
              </div>
              <div className="hud-bar-container" style={{ marginTop: '5px' }}>
                <div className="hud-bar-fill" style={{ width: `${xpProgress * 100}%` }} />
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginTop: '15px',
            borderTop: '1px dashed rgba(0,255,136,0.15)',
            paddingTop: '12px'
          }}>
            <div className="hud-stat-item"><span>✊</span> STR: <span className="hud-stat-value">{currentUser.stat_str || 10}</span></div>
            <div className="hud-stat-item"><span>🦅</span> AGI: <span className="hud-stat-value">{currentUser.stat_agi || 10}</span></div>
            <div className="hud-stat-item"><span>💚</span> END: <span className="hud-stat-value">{currentUser.stat_def || 10}</span></div>
            <div className="hud-stat-item"><span>🛡️</span> VIT: <span className="hud-stat-value">{currentUser.stat_vit || 10}</span></div>
          </div>
        </div>

        {/* PANEL 2: DAILY GOAL (Circle Indicator) */}
        <div className="hud-card">
          <div className="hud-title">DAILY GOAL: {stepPercentage}%</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '100%', flex: 1, minHeight: '130px' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r={circleRadius} fill="transparent" stroke="rgba(0, 255, 136, 0.05)" strokeWidth="6" />
                <circle
                  cx="60"
                  cy="60"
                  r={circleRadius}
                  fill="transparent"
                  stroke="#00ff88"
                  strokeWidth="8"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={circleDashoffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-in-out', filter: 'drop-shadow(0 0 6px #00ff88)' }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '0.52rem', color: 'rgba(0, 255, 136, 0.6)', letterSpacing: '0.5px' }}>STEPS TODAY</span>
                <span style={{ fontSize: '1.2rem', color: '#fff', fontWeight: '900', fontFamily: "'Outfit', 'Share Tech Mono', sans-serif" }}>
                  {currentSteps.toLocaleString()}
                </span>
                <span style={{ fontSize: '0.62rem', color: '#8a8a93', marginTop: '2px' }}>{activeTimeHoursStr}</span>
              </div>
            </div>
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '100px' }}>
              <div style={{ fontSize: '0.52rem', color: '#8a8a93', letterSpacing: '0.5px' }}>GOAL TARGET</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{targetSteps.toLocaleString()} <span style={{ fontSize: '0.6rem', color: '#8a8a93' }}>steps</span></div>
              <div style={{ fontSize: '0.52rem', color: '#8a8a93', letterSpacing: '0.5px', marginTop: '4px' }}>CALORIES BURNED</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00ff88' }}>{Math.round(caloriesBurnedToday)} <span style={{ fontSize: '0.6rem', color: '#8a8a93' }}>kcal</span></div>
            </div>
          </div>
        </div>

        {/* PANEL 3: CALORIE TRACKER */}
        <div className="hud-card">
          <div className="hud-title">
            CALORIE TRACKER <span style={{ fontSize: '0.62rem', color: '#8a8a93', fontWeight: 'normal', textTransform: 'none' }}>- Last 7 days</span>
          </div>
          <div className="hud-bar-chart">
            {chartData.map((d, i) => {
              const heightPct = Math.max(10, Math.min(80, (d.val / maxVal) * 80));
              return (
                <div key={i} className="hud-chart-col">
                  <span className="hud-chart-val" style={{ color: d.isToday ? '#00ff88' : 'rgba(0, 255, 136, 0.7)' }}>{d.val}</span>
                  <div
                    className="hud-chart-bar-fill"
                    style={{
                      height: `${heightPct}px`,
                      background: d.isToday
                        ? 'linear-gradient(to top, rgba(0, 255, 136, 0.4), rgba(0, 255, 136, 1))'
                        : 'linear-gradient(to top, rgba(0, 255, 136, 0.1), rgba(0, 255, 136, 0.65))',
                      boxShadow: d.isToday ? '0 0 10px rgba(0, 255, 136, 0.6)' : 'none'
                    }}
                  />
                  <span className="hud-chart-label" style={{ color: d.isToday ? '#00ff88' : '#8a8a93', fontWeight: d.isToday ? 'bold' : 'normal' }}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL 4: ACTIVITIES */}
        <div className="hud-card">
          <div className="hud-title">ACTIVITIES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'space-around', minHeight: '110px' }}>
            {activities.map((act, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${act.color}25`,
                borderRadius: '6px',
                padding: '8px 10px',
                textAlign: 'left',
                boxShadow: `inset 0 0 6px ${act.color}03`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem', color: act.color }}>{act.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>{act.title}</div>
                    <div style={{ fontSize: '0.6rem', color: '#8a8a93', marginTop: '1px' }}>{act.type}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: act.color }}>{act.kcal}</div>
                  <div style={{ fontSize: '0.58rem', color: '#8a8a93', marginTop: '1px' }}>
                    {act.time} | <span style={{ color: '#ffcc00' }}>{act.stat}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* DAILY MISSION CARD */}
      <div className="hud-card">
        <div className="hud-title">⚔️ TODAY'S DEFENSE MISSION</div>
        {todayMission ? (
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: todayMission.is_completed === 1 ? '#00ff88' : '#fff' }}>
              {todayMission.title} {todayMission.is_completed === 1 ? ' (COMPLETED!)' : ''}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#8a8a93', marginTop: '4px', lineHeight: '1.4' }}>
              {todayMission.description}
            </div>
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#8a8a93', marginBottom: '4px' }}>
                <span>PROGRESS: {todayMission.current_count} / {todayMission.target_count}</span>
                <span>{Math.round((todayMission.current_count / todayMission.target_count) * 100)}%</span>
              </div>
              <div className="hud-bar-container">
                <div style={{
                  width: `${Math.min(100, (todayMission.current_count / todayMission.target_count) * 100)}%`,
                  height: '100%',
                  backgroundColor: todayMission.is_completed === 1 ? '#00ff88' : '#ffcc00',
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
                  padding: '10px',
                  background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0,255,136,0.25)',
                  transition: 'transform 0.2s',
                  fontFamily: "'Share Tech Mono', monospace"
                }}
              >
                🎁 CLAIM REWARD (FORTIFY TERRITORY)
              </button>
            )}
            {todayMission.claimed === 1 && (
              <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.75rem', color: '#00ff88', fontWeight: 'bold' }}>
                ✅ TODAY'S MISSION REWARD CLAIMED
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#8a8a93', fontSize: '0.8rem', padding: '1rem', textAlign: 'center' }}>
            LOADING MISSION DATA...
          </div>
        )}
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
        <button
          onClick={onStartQuickRun}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            background: 'rgba(0, 255, 136, 0.04)',
            border: '1px solid rgba(0, 255, 136, 0.2)',
            padding: '12px 6px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: "'Share Tech Mono', monospace"
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.08)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.04)'}
        >
          <span style={{ fontSize: '1.3rem' }}>🏃‍♂️</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#00ff88' }}>START RUN</span>
        </button>

        <button
          onClick={() => onNavigateTab('exercise')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            background: 'rgba(255, 0, 127, 0.04)',
            border: '1px solid rgba(255, 0, 127, 0.2)',
            padding: '12px 6px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: "'Share Tech Mono', monospace"
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 0, 127, 0.08)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255, 0, 127, 0.04)'}
        >
          <span style={{ fontSize: '1.3rem' }}>💪</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ff007f' }}>RECORD EXERCISE</span>
        </button>

        <button
          onClick={() => onNavigateTab('meal')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            background: 'rgba(0, 212, 255, 0.04)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            padding: '12px 6px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: "'Share Tech Mono', monospace"
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.08)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.04)'}
        >
          <span style={{ fontSize: '1.3rem' }}>🥗</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#00d4ff' }}>ANALYZE MEAL</span>
        </button>
      </div>

    </div>
  );
};

export default HomeHubSection;
