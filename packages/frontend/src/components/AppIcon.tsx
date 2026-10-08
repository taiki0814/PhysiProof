import React, { type CSSProperties } from 'react';
import {
  Home, Map, Route, Users, Trophy, Shirt, LineChart, Utensils, MessageCircle, UserRoundPlus,
  ShieldCheck, Bell, LogOut, Navigation, Info, Activity, Flame, Timer, Footprints, Swords,
  Medal, Award, Goal, Settings, Search, ChevronRight, CircleCheck, TriangleAlert, CircleX,
  LoaderCircle, Zap, UserRound, Heart, Dumbbell, Calendar, Send, Plus, X, Pencil, Trash2,
  Bot, Globe, WifiOff, MapPin, Compass, Gauge, Target, Download, FileText, Megaphone, Eye,
  EyeOff, Lock, ArrowRight, CirclePlay, Square, Pause, Crosshair, Layers, Menu, ArrowLeft,
  Copy, Check, RefreshCw, Ban, KeyRound, Scale, Monitor, Radio, Filter, Handshake, Volume2, VolumeX,
  Palette, GraduationCap, Castle, Mountain,
} from 'lucide-react';
import './AppIcon.css';

const icons = {
  home: Home, map: Map, run: Route, team: Users, ranking: Trophy, uniform: Shirt,
  predict: LineChart, meal: Utensils, chat: MessageCircle, friends: UserRoundPlus,
  admin: ShieldCheck, bell: Bell, logout: LogOut, navigation: Navigation, info: Info,
  activity: Activity, flame: Flame, timer: Timer, footprints: Footprints, battle: Swords,
  medal: Medal, award: Award, goal: Goal, settings: Settings, search: Search,
  chevron: ChevronRight, success: CircleCheck, warning: TriangleAlert, error: CircleX,
  loading: LoaderCircle, energy: Zap, user: UserRound, heart: Heart, exercise: Dumbbell,
  calendar: Calendar, send: Send, plus: Plus, close: X, edit: Pencil, delete: Trash2,
  bot: Bot, globe: Globe, offline: WifiOff, pin: MapPin, compass: Compass, gauge: Gauge,
  target: Target, download: Download, document: FileText, announcement: Megaphone,
  eye: Eye, hidden: EyeOff, lock: Lock, arrow: ArrowRight, play: CirclePlay,
  stop: Square, pause: Pause, locate: Crosshair, layers: Layers, menu: Menu,
  back: ArrowLeft, copy: Copy, check: Check, refresh: RefreshCw, ban: Ban,
  key: KeyRound, weight: Scale, monitor: Monitor, radio: Radio, filter: Filter,
  handshake: Handshake, sound: Volume2, mute: VolumeX, palette: Palette,
  education: GraduationCap, castle: Castle, mountain: Mountain,
} as const;
export type AppIconName = keyof typeof icons;

type AppIconProps = {
  name: AppIconName;
  size?: number | string;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** One visual language for UI chrome. Labels live on controls; decoration is hidden from AT. */
export default function AppIcon({ name, size = '1em', label, className = '', style }: AppIconProps) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={2} className={`pp-icon ${className}`.trim()} style={style}
    focusable="false" role={label ? 'img' : undefined} aria-label={label}
    aria-hidden={label ? undefined : true} />;
}

// Translate existing icon-only metadata at presentation time; never rewrite DB values or user text.
const legacyIcons: Readonly<Record<string, AppIconName>> = {
  '🏠': 'home', '🗺️': 'map', '🗺': 'map', '🏃': 'run', '🏃‍♂️': 'run', '🏃‍♀️': 'run',
  '👥': 'team', '🛡️': 'admin', '🛡': 'admin', '🏆': 'ranking', '👕': 'uniform',
  '✨': 'predict', '📈': 'predict', '📊': 'predict', '🥗': 'meal', '🍴': 'meal', '🍽️': 'meal',
  '💬': 'chat', '🤖': 'bot', '🔔': 'bell', '⚙️': 'settings', '⚙': 'settings', '⚔️': 'battle',
  '⚔': 'battle', '🔥': 'flame', '⏱️': 'timer', '⏱': 'timer', '⏳': 'loading', '⏰': 'timer',
  '🥇': 'medal', '🥈': 'medal', '🥉': 'medal', '🎖️': 'award', '🏅': 'award', '👑': 'award',
  '🎯': 'target', '🚀': 'arrow', '⭐': 'award', '🌟': 'award', '💎': 'award', '💪': 'exercise',
  '🦵': 'exercise', '🧘': 'exercise', '❤️': 'heart', '♥': 'heart', '⚡': 'energy',
  '✅': 'success', '❌': 'error', '⚠️': 'warning', '⚠': 'warning', '🎉': 'success',
  '🌐': 'globe', '🌍': 'globe', '📍': 'pin', '👤': 'user', '📅': 'calendar',
  '📜': 'document', '📄': 'document', '💻': 'monitor', '📡': 'radio', '📣': 'announcement',
  '🗑️': 'delete', '🗑': 'delete', '✏️': 'edit', '🔑': 'key', '🔒': 'lock', '⚖️': 'weight',
  '🤝': 'handshake', '🔄': 'refresh', '🩺': 'activity', '🚫': 'ban', '🌅': 'globe',
  '☀️': 'globe', '🌙': 'globe', '🔍': 'search', '📋': 'document', '🎽': 'uniform',
  '🎨': 'palette', '🎓': 'education', '🏰': 'castle', '🏔️': 'mountain',
};
export function legacyIconName(glyph: string, fallback: AppIconName = 'award'): AppIconName {
  return Object.prototype.hasOwnProperty.call(legacyIcons, glyph) ? legacyIcons[glyph] : fallback;
}
export function LegacyIcon({ glyph, fallback, ...props }: Omit<AppIconProps, 'name'> & { glyph: string; fallback?: AppIconName }) {
  return <AppIcon name={legacyIconName(glyph, fallback)} {...props} />;
}
