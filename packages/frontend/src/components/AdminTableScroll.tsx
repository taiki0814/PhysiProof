import { type ReactNode, useId } from 'react';
import AppIcon from './AppIcon';

/** Keep the filters in place while only the wide table scrolls. */
export default function AdminTableScroll({ label, children }: { label: string; children: ReactNode }) {
  const hintId = useId();
  return <div className="pp-admin-table-frame">
    <p className="pp-admin-table-hint" id={hintId}><AppIcon name="arrow" /> 左右にスワイプして詳細・操作を確認</p>
    <div className="pp-admin-table-scroll" role="region" aria-label={label} aria-describedby={hintId} tabIndex={0}>
      {children}
    </div>
  </div>;
}
