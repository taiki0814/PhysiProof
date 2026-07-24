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
    padding: 20px 30px 15px 30px;
    font-size: 26px;
    background: radial-gradient(circle at top right, rgba(0, 229, 255, 0.08), transparent 45%),
                radial-gradient(circle at bottom left, rgba(0, 255, 136, 0.08), transparent 45%),
                #070a13;
  }
  h1 {
    color: #00ff88;
    font-size: 2.2em;
    margin-top: 0;
    margin-bottom: 10px;
    text-shadow: 0 0 12px rgba(0, 255, 136, 0.3);
  }
  h2 {
    color: #00e5ff;
    font-size: 1.5em;
    border-bottom: 2px solid #00e5ff;
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 16px;
  }
  h3 {
    color: #ffffff;
    font-size: 1.2em;
    margin-top: 4px;
    margin-bottom: 4px;
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
    margin-top: 4px;
    margin-bottom: 4px;
    padding-left: 20px;
  }
  li {
    margin-bottom: 6px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
  }
  .grid-4 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }
  .card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 12px;
    padding: 16px;
  }
  .card-highlight {
    background: linear-gradient(135deg, rgba(0,255,136,0.1) 0%, rgba(0,212,255,0.05) 100%);
    border: 1px solid rgba(0, 255, 136, 0.4);
    border-radius: 12px;
    padding: 18px;
    text-align: center;
  }
  .stat-num {
    font-size: 2.2em;
    font-weight: 900;
    color: #00ff88;
    line-height: 1;
    margin-bottom: 4px;
  }
  .stat-num-red {
    color: #ff3860;
  }
  .stat-num-blue {
    color: #00e5ff;
  }
  .tech-card {
    background: rgba(15, 23, 42, 0.7);
    border-left: 5px solid #00e5ff;
    border-top: 1px solid rgba(0, 229, 255, 0.2);
    border-right: 1px solid rgba(0, 229, 255, 0.2);
    border-bottom: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 8px;
    padding: 14px 18px;
  }
  .tech-card-green {
    border-left-color: #00ff88;
  }
  .tech-card-purple {
    border-left-color: #a855f7;
  }
  .tech-card-orange {
    border-left-color: #f97316;
  }
  .tech-tag {
    display: inline-block;
    background: rgba(0, 229, 255, 0.12);
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.85em;
    font-weight: bold;
    margin-right: 6px;
    margin-bottom: 6px;
  }
  .tech-tag-green {
    background: rgba(0, 255, 136, 0.12);
    color: #00ff88;
    border-color: rgba(0, 255, 136, 0.3);
  }
  .tech-tag-purple {
    background: rgba(168, 85, 247, 0.12);
    color: #c084fc;
    border-color: rgba(168, 85, 247, 0.3);
  }
  .badge {
    background: linear-gradient(135deg, #00ff88, #00e5ff);
    color: #000;
    font-weight: bold;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75em;
  }
  .flow-box {
    background: rgba(0, 255, 136, 0.05);
    border: 1px dashed #00ff88;
    border-radius: 10px;
    padding: 12px;
    text-align: center;
    font-family: monospace;
    font-size: 0.9em;
  }
  .step-arrow {
    font-size: 1.5em;
    color: #00e5ff;
    margin: 0 10px;
  }
---

# **PhysiProof**
### リアルな街を塗りつぶせ！スプラトゥーン型都市陣取りフィットネス

<br>

**卒業制作 企画・プロトタイプ発表**
高度情報処理科 3年 24JZ0121 **紺野大輝**

---

## 発表アジェンダ

<div class="grid-3">
<div class="card">

### 1. 課題共有
運動不足とチート問題

</div>
<div class="card">

### 2. コンセプト
都市陣取りバトル

</div>
<div class="card">

### 3. メニュー構成
主要5大メニュー

</div>
</div>

<br>

<div class="grid-3">
<div class="card">

### 4. 実機デモ
プロトタイプ実演

</div>
<div class="card">

### 5. 使用技術
Zod & エッジアーキ

</div>
<div class="card">

### 6. ロードマップ
デザイン強化＆展望

</div>
</div>

---

## 開発背景①：運動継続の難しさ

<div class="grid-3">
<div class="card" style="text-align: center;">

<div class="stat-num stat-num-red">65%</div>

**20〜30代の運動不足率**
(スポーツ庁調べ)

</div>

<div class="card" style="text-align: center;">

<div class="stat-num stat-num-red">80%</div>

**3ヶ月以内の運動離脱率**
「単調さ」が最大の壁

</div>

<div class="card" style="text-align: center;">

<div class="stat-num stat-num-blue">78%</div>

**「数値だけは飽きる」**
(自作ヒアリング調査)

</div>
</div>

<br>

> **課題:** 記録するだけのフィットネスは飽きる ➔ **「ゲーム性」** が必要！

---

## 開発背景②：チートによるモチベ崩壊

<div class="grid-2">
<div class="card">

### 横行するズル（不正）
- スマホ振り子機で歩数稼ぎ
- GPS位置偽装アプリ
- 車移動でのカウント

</div>

<div class="card" style="text-align: center;">

<div class="stat-num stat-num-red">82%</div>

**「ズルを見ると萎える」**
(アンケート共感率)

</div>
</div>

<br>

> **課題:** 不正が放置されるとモチベ低下 ➔ **「物理整合性検証」** が必須！

---

## コンセプト：リアル都市陣取りバトル

<div class="card-highlight">

## 走る <span class="step-arrow">➔</span> 塗る <span class="step-arrow">➔</span> 奪い合う

**自分の走ったルートが、実際のマップ上で自分の「陣地」になる！**

</div>

<br>

<div class="grid-2">
<div class="card">

### ゲームで楽しく継続
スプラトゥーン感覚で街を自分の色に染める

</div>

<div class="card">

### 物理検証でチートゼロ
速度・加速度チェックでフェアなバトル

</div>
</div>

---

## 主要5大メニュー構成

<div class="grid-3">
<div class="card">

### ホーム
ミッション & カロリー

</div>

<div class="card">

### マップ <span class="badge">MAIN</span>
リアルタイム陣取り

</div>

<div class="card">

### フレンド
友達検索 & 相互フォロー

</div>
</div>

<br>

<div class="grid-2">
<div class="card">

### チーム
仲間と結成！領土面積合算バトル

</div>

<div class="card">

### ランク
全体戦 & **「フレンド限定」** フィルター

</div>
</div>

---

## 実機デモタイム：プロトタイプ実演

<div class="card-highlight">

### スマホ実機 / 画面共有デモ

**1. マップ** ➔ 走ってポリゴン生成 & 要塞化
**2. フレンド & チーム** ➔ 申請・承認 & チーム結成
**3. ランク & 管理者** ➔ フレンド限定表示 & メニューON/OFF

</div>

---

## マップ＆陣取りメカニクス

<div class="grid-2">
<div class="card">

### 塗る＆合体 (Capture & Merge)
- 移動軌跡から領域ポリゴンを自動生成
- 自陣と接触すると**自動で巨大化！**

</div>

<div class="card">

### 耐久度アップ (Fortify)
- 陣地は他プレイヤーに奪われるリスク
- ミッションポイントで**自陣を要塞化！**

</div>
</div>

---

## チーム戦 ＆ フレンド限定ランク

<div class="grid-2">
<div class="card">

### チーム（都市スケール合戦）
- 仲間全員の獲得面積をリアルタイム合算
- チーム同士で街の総面積を競い合う

</div>

<div class="card">

### フレンド限定フィルター
- ボタン1つで**「友達だけのランキング」**へ
- 身近なライバルとトップを競う！

</div>
</div>

---

## 管理者制御：メニュー可視性コントロール

<div class="card-highlight">

### 管理者ダッシュボード (`AdminDashboard`)

各メニュー (ホーム / マップ / フレンド / チーム / ランク) の表示/非表示をチェックボックスで**リアルタイム制御**

</div>

<br>

- **柔軟な運用**: イベント期間やシンプルモードなど、用途に応じた画面を即時配信
- **セキュリティ**: API側でも非表示機能のアクセスを2重ブロック

---

## 使用技術構成

<div class="grid-4">

<div class="tech-card">

### Frontend
<span class="tech-tag">React 18</span> <span class="tech-tag">Vite</span>
<span class="tech-tag">TypeScript</span>

</div>

<div class="tech-card tech-card-green">

### Backend / DB
<span class="tech-tag tech-tag-green">Cloudflare Workers</span>
<span class="tech-tag tech-tag-green">Hono</span> <span class="tech-tag tech-tag-green">D1 (SQLite)</span>

</div>

<div class="tech-card tech-card-purple">

### Geo / Spatial
<span class="tech-tag tech-tag-purple">Leaflet.js</span> <span class="tech-tag tech-tag-purple">Turf.js</span>
<span class="tech-tag tech-tag-purple">OSRM</span>

</div>

<div class="tech-card tech-card-orange">

### Architecture
<span class="tech-tag">npm workspaces</span>
<span class="tech-tag">Zod (Single Source)</span>

</div>

</div>

---

## システムアーキテクチャ

<div class="flow-box">

```
   【 shared (Zod Schema) 】 ── Single Source of Truth
              │ (型定義の自動共有)
   ┌──────────┴──────────┐
   ▼                     ▼
【 Frontend (React) 】 ◀━━━ Hono RPC (型安全通信) ━━━▶ 【 Backend (Cloudflare) 】
```

</div>

<br>

<div class="grid-3">
<div class="card" style="text-align: center;">

### 堅牢な型安全
型二重定義の排除 (バグ0)

</div>
<div class="card" style="text-align: center;">

### 超高速応答
エッジサーバー応答

</div>
<div class="card" style="text-align: center;">

### 高精度
数ミリ秒で陣地計算

</div>
</div>

---

## 開発状況 ＆ ロードマップ

<div class="grid-2">
<div class="card">

### プロトタイプ完成機能
- リアルタイムGPS陣取り＆要塞化
- フレンド・チーム管理
- フレンド限定ランキング
- 管理者メニュー表示制御

</div>

<div class="card">

### 今後のロードマップ
- **UI/UX・見た目のデザイン強化**
  - ゲーム演出・視認性ブラッシュアップ
- **地域対抗イベント機能**
- **AR（拡張現実）現地連携**

</div>
</div>

---

## まとめ

<div class="card-highlight">

### 「運動する」から「街を塗るために走りたくなる」世界へ

</div>

<br>

- **1. 課題解決** ➔ リアル都市スプラトゥーン体験 ＋ チートゼロ
- **2. 高いソーシャル** ➔ チーム合戦 ＆ フレンド限定ランキング
- **3. モダン技術** ➔ Cloudflare Workers ＋ Hono RPC ＋ Zod Monorepo

---

# 質疑応答 (Q&A)

### ご清聴ありがとうございました！

