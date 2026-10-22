import type { AppIconName } from '../components/AppIcon';

export const DASHBOARD_MENUS = [
  { key:'home', label:'ホーム', icon:'home', setting:'show_home_menu' },
  { key:'map', label:'マップ', icon:'map', setting:'show_map_menu' },
  { key:'trends', label:'走行傾向', icon:'activity', setting:'show_running_trends_menu' },
  { key:'uniform', label:'ユニフォーム', icon:'uniform', setting:'show_uniform_menu' },
  { key:'meal', label:'食事', icon:'meal', setting:'show_meal_menu' },
  { key:'friends', label:'フレンド', icon:'friends', setting:'show_friends_menu' },
  { key:'team', label:'チーム', icon:'team', setting:'show_team_menu' },
  { key:'ranking', label:'ランク', icon:'ranking', setting:'show_ranking_menu' },
] as const satisfies readonly {key:string;label:string;icon:AppIconName;setting:string}[];
export type DashboardTab = typeof DASHBOARD_MENUS[number]['key'] | 'exercise';
export function initialDashboardTab(search: string): DashboardTab {
  const tab = new URLSearchParams(search).get('tab');
  return DASHBOARD_MENUS.find(menu => menu.key === tab)?.key ?? 'home';
}
export function dashboardMenuVisibility(settings: Record<string,string> = {}): Record<string,boolean> {
  return Object.fromEntries(DASHBOARD_MENUS.map(menu => [menu.key, settings[menu.setting] !== 'false']));
}
