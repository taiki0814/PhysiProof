export default function PreviewNotice(){
  return <aside aria-label="テスト専用画面の注意" style={{border:'2px solid #fbbf24',borderRadius:12,padding:16,marginBottom:24,background:'#241d0d',color:'#fff',lineHeight:1.7}}>
    <strong>テスト専用 · 通常の管理画面とは異なります</strong>
    <p style={{margin:'8px 0'}}>このページは編集部品だけの動作確認用です。データはメモリ内のダミーで、再読み込みすると消えます。本番と同じ管理メニュー・保存機能を確認する場合は、通常の管理画面を開いてください。</p>
    <a href="/admin?tab=uniform-templates" style={{display:'inline-block',padding:'8px 12px',borderRadius:8,background:'#fbbf24',color:'#17130a',fontWeight:700}}>通常のローカル管理画面を開く</a>
    <a href="/dashboard?tab=uniform" style={{display:'inline-block',margin:'8px 12px',color:'#8be4ff'}}>通常のユニフォーム工房を開く</a>
    <small style={{display:'block'}}>ローカルAPIの起動が必要です。未ログインの場合はローカルのログイン画面へ移動します。本番データには接続しません。</small>
  </aside>;
}
