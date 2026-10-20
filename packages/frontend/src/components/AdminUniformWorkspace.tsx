import { useState } from 'react';
import AdminUniformAssets from './AdminUniformAssets';
import AdminUniformTemplates from './AdminUniformTemplates';
import AppIcon from './AppIcon';

export default function AdminUniformWorkspace() {
  const [view, setView] = useState<'assets' | 'templates'>('assets');
  return <div className="pp-admin-uniform-workspace">
    <div className="pp-admin-uniform-switch" role="group" aria-label="ユニフォーム管理の表示">
      <button type="button" aria-pressed={view === 'assets'} onClick={() => setView('assets')}>
        <AppIcon name="layers" /><span>素材ライブラリ<small>服本体・柄・エンブレム</small></span>
      </button>
      <button type="button" aria-pressed={view === 'templates'} onClick={() => setView('templates')}>
        <AppIcon name="uniform" /><span>完成品テンプレート<small>配布するデザイン</small></span>
      </button>
    </div>
    {/* Keep both editors mounted so switching views never loses an unsaved draft. */}
    <div hidden={view !== 'assets'}><AdminUniformAssets /></div>
    <div hidden={view !== 'templates'}><AdminUniformTemplates /></div>
  </div>;
}
