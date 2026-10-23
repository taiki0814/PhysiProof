import AppIcon, { type AppIconName } from './AppIcon';

export const ADMIN_SECTIONS = [
  { id: 'summary', label: '概要・統計', icon: 'predict' },
  { id: 'users', label: 'ユーザー管理', icon: 'team' },
  { id: 'territories', label: '支配領域管理', icon: 'map' },
  { id: 'map', label: '支配領域マップ', icon: 'map' },
  { id: 'exercises', label: '運動ログ監査', icon: 'exercise' },
  { id: 'achievements', label: '実績管理', icon: 'ranking' },
  { id: 'notifications', label: '通知管理', icon: 'bell' },
  { id: 'settings', label: 'システム設定', icon: 'settings' },
  { id: 'running-places', label: '通過統計エリア', icon: 'map' },
  { id: 'uniform-templates', label: 'ユニフォーム管理', icon: 'uniform' },
  { id: 'api-usage', label: 'API使用状況', icon: 'radio' },
  { id: 'design-docs', label: '設計資料', icon: 'document' },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: AppIconName }>;
export type AdminSection = typeof ADMIN_SECTIONS[number]['id'];

export default function AdminNavigation({ active, onChange, counts }: {
  active: AdminSection;
  onChange: (section: AdminSection) => void;
  counts: Partial<Record<AdminSection, number>>;
}) {
  return <nav className="pp-admin-navigation" aria-label="管理メニュー">
    <label className="pp-admin-mobile-menu" htmlFor="admin-section-select">
      管理メニュー
      <select id="admin-section-select" value={active} onChange={event => {
        const section = ADMIN_SECTIONS.find(item => item.id === event.target.value);
        if (section) onChange(section.id);
      }}>
        {ADMIN_SECTIONS.map(section => <option key={section.id} value={section.id}>
          {section.label}{counts[section.id] === undefined ? '' : ` (${counts[section.id]})`}
        </option>)}
      </select>
    </label>
    <div className="pp-admin-desktop-menu">
      <span className="pp-admin-kicker">MANAGEMENT</span>
      {ADMIN_SECTIONS.map(section => <button key={section.id} type="button"
        className={`admin-nav-btn ${active === section.id ? 'active' : ''}`}
        aria-current={active === section.id ? 'page' : undefined}
        onClick={() => onChange(section.id)}>
        <AppIcon name={section.icon} /><span>{section.label}</span>
        {counts[section.id] !== undefined && <small>{counts[section.id]}</small>}
      </button>)}
    </div>
  </nav>;
}
