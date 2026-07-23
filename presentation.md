---
marp: true
theme: gaia
_class: lead
paginate: true
size: 16:9
backgroundColor: #0b0f19
color: #f3f4f6
style: |
  section {
    font-family: 'Noto Sans JP', 'Inter', sans-serif;
    padding: 35px 50px;
    font-size: 23px;
    background: radial-gradient(circle at top right, rgba(0, 229, 255, 0.07), transparent 45%),
                radial-gradient(circle at bottom left, rgba(0, 255, 136, 0.07), transparent 45%),
                #070a13;
  }
  h1 {
    color: #00ff88;
    font-size: 2.0em;
    margin-bottom: 12px;
    text-shadow: 0 0 12px rgba(0, 255, 136, 0.3);
  }
  h2 {
    color: #00e5ff;
    font-size: 1.35em;
    border-bottom: 2px solid #00e5ff;
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 16px;
  }
  h3 {
    color: #ffffff;
    font-size: 1.1em;
    margin-top: 5px;
    margin-bottom: 5px;
  }
  footer {
    color: #9ca3af;
    font-size: 0.55em;
  }
  code {
    background-color: #1f2937;
    color: #00ff88;
    padding: 2px 6px;
    border-radius: 4px;
  }
  ul {
    margin-top: 6px;
    margin-bottom: 6px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 6px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
  }
  .card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 12px;
    padding: 16px;
  }
  .highlight {
    color: #00e5ff;
    font-weight: bold;
  }
  .success {
    color: #00ff88;
    font-weight: bold;
  }
  .badge {
    background: linear-gradient(135deg, #00ff88, #00e5ff);
    color: #000;
    font-weight: bold;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.8em;
  }
  .text-muted {
    color: #9ca3af;
    font-size: 0.85em;
  }
---

# **PhysiProof**
### リアルな街を塗りつぶせ！都市型スプラトゥーン運動バトル

**「走って、塗って、奪い合え！」** リアルタイムGPS陣取りフィットネス

<br>

<div class="text-muted">
基本メニュー構成: 🏠 ホーム | 🗺️ マップ | 👥 フレンド | 🛡️ チーム | 🏆 ランク
</div>

---

## 🎯 プロジェクト概要・開発の目的

### 「運動の習慣化」をゲーミフィケーションで解決

- **従来のフィットネスアプリの課題**
  - 単なる歩数・消費カロリーの記録では「モチベーション維持」が困難。
- **PhysiProof の解決策**
  - 走った軌跡が実際の地図上で自分の陣地（テリトリー）になる！
  - まさに**リアル版スプラトゥーン**のように街を塗りつぶす快感を提供。
  - 個人戦だけでなく、チーム対抗戦・フレンド間競い合いで継続的な運動を促す。

---

## 🗺️ メインシステム：リアル都市陣取りバトル

<div class="grid-2">
<div class="card">

### 🏃‍♂️ 走って領土を塗りつぶす！
- 高精度GPSでランニング・ウォーキング経路を自動計測。
- 周回・移動したルートがそのまま自分の**占領領域（テリトリー）**へ変換！
- 近くの領域同士は走って繋ぐと**自動的にマージ（大型化）**。

</div>
<div class="card">

### 🛡️ 占領・要塞化と奪還戦
- チームやプレイヤー同士で領土の広さ（面積 m²）を争う。
- デイリーミッションで報酬を獲得し、自陣を**要塞化 (Fortify)**！
- 他のプレイヤーからの切り崩し・奪還を防ぐ戦略的ゲーム要素。

</div>
</div>

---

## 📱 主要5大メニュー構成

アプリの主要画面はシンプルな**5つのメインメニュー**で構成されています。

<div class="grid-3">
<div class="card">

### 🏠 ホーム
本日のミッション進捗、消費カロリー、RPGレベル・ステータスを一目で確認。

</div>
<div class="card">

### 🗺️ マップ <span class="badge">MAIN</span>
リアルタイムGPSトラッキング & 領土占領・要塞化バトルマップ。

</div>
<div class="card">

### 👥 フレンド
友達検索、フレンド申請・承認、相互のステータス管理。

</div>
</div>

<br>

<div class="grid-2">
<div class="card">

### 🛡️ チーム
仲間と共にチームを結成！メンバー全員の獲得領土を合算した大規模なクラン合戦。

</div>
<div class="card">

### 🏆 ランク
全体・チーム・さらに新機能「**フレンドのみ表示**」でライバルと領土面積を勝負！

</div>
</div>

---

## 🗺️ メイン機能：🗺️ マップ (Territory Conquest)

### 「走るほどに自分の領土が広がる」直感的なインタラクション

- **リアルタイムGPSトラッキング**
  - タップ1つで計測スタート。ルートを閉じることで独自の領域ポリゴンを算出。
- **領域の自動マージシステム**
  - 新しく獲得した領域が既存の領土と接触すると、自動的に結合して巨大領土へ成長！
- **防御＆要塞化メカニクス**
  - ミッション達成で獲得したポイントを使って陣地の耐久値を強化。

---

## 👥 フレンド & 🛡️ チーム（ソーシャル・合戦要素）

<div class="grid-2">
<div class="card">

### 👥 フレンドネットワーク
- **仲間を増やしてモチベーションUP**
  - ユーザー検索で仲間を検索・申請・承認。
  - フレンド一覧でレベルや最新のアクティビティをチェック。
  - 身近な友達同士でリアルタイムに励まし合える。

</div>
<div class="card">

### 🛡️ チーム（勢力バトル）
- **チーム結成・加入**
  - 友達同士や同僚でチームを作って参戦！
- **領土面積のチーム加算**
  - チームメンバー全員が塗った（獲得した）領土の合計面積でランキング争い。

</div>
</div>

---

## 🏆 ランキングシステム（競争とモチベーション）

### 「フレンド限定フィルター」で身近なライバルと熱いバトル！

- **マルチ視点ランキング**
  - **個人ランキング**: プレイヤー個人の総領土面積
  - **チームランキング**: 各チームの総合領土面積
- **👥 フレンドのみ表示機能**
  - フィルターの「フレンドのみ」をONにすると、自分とフレンドだけのランキングに瞬時に絞り込み！
  - 世界ランキングだけでなく、「友達の中で何位か」を競える。
- **期間別切り替え** (今日 / 今週 / 今年 / 全期間)

---

## ⚙️ 管理者画面によるメニュー動的可視性制御

### 運営方針に合わせてメニュー表示を柔軟にカスタマイズ

- **管理者ダッシュボード (`AdminDashboard`)**
  - 各メニュー項目 (🏠ホーム, 🗺️マップ, 💪記録, ✨予測, 🥗食事, 👥フレンド, 🛡️チーム, 🏆ランク, 💬コーチ) の表示/非表示をトグル設定可能。
- **即座にユーザー画面へ反映**
  - 管理者がOFFにしたメニュー項目は、一般ユーザー画面のナビゲーションバーから自動的に除外。
  - イベント時やシンプルな画面構成での運用など、運営ニーズに合わせて即時調整可能。

---

## 🛠️ 技術スタック & アーキテクチャ

### シングル・ソース・オブ・トゥルース (Zod Monorepo)

- **Frontend**: Vite + React + Vanilla CSS (Cyber/Neonテーマデザイン)
- **Backend**: Cloudflare Workers + SQLite (D1) + Hono RPC
- **Shared**: Zod を Single Source of Truth としたエンドツーエンドの型安全設計
- **Map & Spatial**: Leaflet / Turf.js による高精度な空間ジオメトリ計算

```
[shared (Zod Schema)] ──> [backend (Hono API / D1)] ──> [frontend (Hono RPC / React)]
```

---

## 🚀 今後の展望 & まとめ

### 「運動する」から「陣地を塗るために走りたくなる」世界へ

- **まとめ**
  - スプラトゥーン型の直感的な陣取り要素で、楽しく持続可能なフィットネスを提供。
  - ホーム・マップ・フレンド・チーム・ランクの洗練された5大メニューで、ソーシャル＆チーム体験を最大化。
- **今後のロードマップ**
  - 期間限定の地域対抗陣取りイベント
  - リアルタイム領土奪還アラート機能
  - AR技術を活用した現地チェックイン機能

---

# **PhysiProof**
### ご清聴ありがとうございました！

**さあ、仲間と共に街を自分の色に染め上げよう！**
