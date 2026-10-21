export default function UniformAdminRecovery({hasDraft,checking,onRecheck}:{hasDraft:boolean;checking:boolean;onRecheck:()=>void}) {
  return <aside className="pp-assets-recovery" role="alert" aria-label="素材保存の管理者認証">
    <strong>素材操作の管理者認証が必要です</strong>
    <p>通常の管理画面とは別に、素材の追加・保存には有効な管理者認証（12時間）が必要です。同じアカウントで別端末からログインした場合も、再認証が必要になることがあります。</p>
    <p>{hasDraft?'編集中の画像・部位分け・入力内容は、このタブに残っています。':'この画面を閉じずに、別タブで管理者として再ログインしてください。'}再ログイン後、このタブに戻って認証を再確認してください。ページの再読み込みは不要です。</p>
    <div className="pp-assets-recovery-actions">
      <a href="/login" target="_blank" rel="noopener noreferrer">別タブで再ログイン</a>
      <button type="button" disabled={checking} onClick={onRecheck}>{checking?'認証を確認中…':'認証を再確認'}</button>
    </div>
  </aside>;
}
