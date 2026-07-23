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
    padding: 30px 45px;
    font-size: 22px;
    background: radial-gradient(circle at top right, rgba(0, 229, 255, 0.08), transparent 45%),
                radial-gradient(circle at bottom left, rgba(0, 255, 136, 0.08), transparent 45%),
                #070a13;
  }
  h1 {
    color: #00ff88;
    font-size: 1.9em;
    margin-bottom: 10px;
    text-shadow: 0 0 12px rgba(0, 255, 136, 0.3);
  }
  h2 {
    color: #00e5ff;
    font-size: 1.3em;
    border-bottom: 2px solid #00e5ff;
    padding-bottom: 5px;
    margin-top: 0;
    margin-bottom: 14px;
  }
  h3 {
    color: #ffffff;
    font-size: 1.05em;
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
    margin-top: 5px;
    margin-bottom: 5px;
    padding-left: 22px;
  }
  li {
    margin-bottom: 5px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 25px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
  }
  .card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 12px;
    padding: 14px;
  }
  .card-highlight {
    background: linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(0,212,255,0.04) 100%);
    border: 1px solid rgba(0, 255, 136, 0.4);
    border-radius: 12px;
    padding: 14px;
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
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.75em;
  }
  .text-muted {
    color: #9ca3af;
    font-size: 0.85em;
  }
---

# **卒業制作 企画・プロトタイプ発表**
## **PhysiProof** (フィジプルーフ)
### リアルな街を塗りつぶせ！スプラトゥーン型都市陣取りフィットネス

<br>

発表者: **高度IT学科 3年 24JZ0121 紺野大輝**

---

## 📋 発表アジェンダ

<div class="grid-2">
<div class="card">

1. **開発背景と課題共有**
   - 若者の運動不足実態 & 従来アプリの課題
   - ヒアリング調査による「チート不快感」
2. **機能紹介 (課題 → 解決)**
   - スプラトゥーン型陣取り & 5大メニュー
   - 物理的整合性によるチート検知
3. **【実機デモ】アプリ実演**
   - スマホ画面共有 / PCスマホモード

</div>
<div class="card">

4. **使用技術紹介**
   - Hono + Cloudflare Workers (D1)
   - Zod Single Source Monorepo
5. **現状の開発状況 & 展望**
6. **質疑応答**

</div>
</div>

---

## 🔍 開発背景①：若者の運動不足と従来アプリの限界

### 定量データに見る「運動習慣化の難しさ」

<div class="grid-2">
<div class="card">

#### 📊 公的データ (スポーツ庁「スポーツの実施状況調査」)
- 20代〜30代の**約65%が「運動不足を感じている」**と回答。
- 一方で、「忙しさ」「単調さ」を理由に**8割以上が3ヶ月以内に離脱**。

</div>
<div class="card">

#### ❓ 自作ヒアリングアンケート調査結果
- 既存の歩数記録アプリに対して**「単に数値が出るだけで飽きる」**との回答が**78%**。
- 「ゲーム感覚があれば走りたくなる」との回答が**85%**を獲得。

</div>
</div>

> **課題①:** 記録するだけのフィットネスアプリは継続性が低く、楽しさが欠如している。

---

## 🔍 開発背景②：既存フィットネスの「チート不公平感」

### ヒアリングで判明した第2の課題

<div class="grid-2">
<div class="card">

#### ⚠️ 既存アプリで多発する「ズル（不正）」
- スマホを振り子で揺らす
- GPS偽装アプリで移動を偽装する
- 自転車・車移動を「ランニング」として偽装

</div>
<div class="card">

#### 🗯️ ヒアリングアンケート回答者の声
- **「ランキング上位が明らかに振り子機で稼いだ歩数で萎える」(82%共感)**
- ズルが放置されると、真面目に走っているユーザーのモチベーションが崩壊する。

</div>
</div>

> **課題②:** データの信頼性と公平性が担保されないと、コミュニティやランキングが形骸化する。

---

## 💡 ソリューション：PhysiProof のコンセプト

### 課題解決から生まれた「リアル都市陣取りバトル」

<div class="card-highlight">

### 🎨 街全体がバトルフィールド！リアルスプラトゥーン体験
ただ走るのではなく、**自分が走ったルートの範囲が地図上で自分の陣地（テリトリー）になる！**
自分の色で街を塗りつぶし、仲間と協力して領域を拡大する直感的なアソビを提供。

</div>

<br>

<div class="grid-2">
<div class="card">

**ソリューション①: 継続性の創出**
スプラトゥーンのような陣取り・要塞化・ランキング競争で「遊んでいたら運動していた」状態を作る。

</div>
<div class="card">

**ソリューション②: 公平性の担保**
加速度センサーと移動速度の**物理的整合性アルゴリズム**でチートを判定。

</div>
</div>

---

## 📱 主要5大メニュー構成

直感的で迷わない、シンプルかつ強力な**5つのメインメニュー**。

<div class="grid-3">
<div class="card">

### 🏠 ホーム
ミッション進捗、消費カロリー、RPGレベルを一目確認。

</div>
<div class="card">

### 🗺️ マップ <span class="badge">MAIN</span>
リアルタイムGPS陣取り＆領土要塞化バトル。

</div>
<div class="card">

### 👥 フレンド
友達検索、ワンタップ申請・承認、ステータス共有。

</div>
</div>

<br>

<div class="grid-2">
<div class="card">

### 🛡️ チーム
仲間と結成！全員の獲得領土面積を合算して競うクラン合戦。

</div>
<div class="card">

### 🏆 ランク
全体戦・チーム戦・新機能「**フレンドのみ表示**」で身近なライバルと勝負！

</div>
</div>

---

## 📱 【実機デモタイム】画面共有による実演

### スマホ画面共有 / デベロッパーツールにてプロトタイプを実演します

<div class="card-highlight">

#### 🎬 実演フロー
1. **🗺️ マップ画面 & リアルタイム陣取り**
   - 現在地のGPS表示、走ったルートによるポリゴン生成と領土結合（マージ）
   - 今日のミッション達成による「領土要塞化 (Fortify)」
2. **👥 フレンド & 🛡️ チーム**
   - ユーザー検索からフレンド申請・承認の流れ
   - チーム結成とチームメンバーの領土貢献度の確認
3. **🏆 ランキング & ⚙️ 管理者画面**
   - 「👥 **フレンドのみ表示**」フィルターの切替
   - 管理者画面 (`AdminDashboard`) からのメニュー項目のリアルタイム表示/非表示切替

</div>

---

## 🛡️ マップ＆陣取りメカニクス (スプラトゥーン要素)

<div class="grid-2">
<div class="card">

### 🏃‍♂️ 走って領土を塗る (Capture)
- 走った通過地点を巡り、閉じられたポリゴン領域を算出して自分のカラーに塗る。
- 近くの自陣と合体すると**自動マージ（大型化）**し、巨大領土へと発展！

</div>
<div class="card">

### 🏰 領土を要塞化する (Fortify)
- 獲得した領土は他プレイヤーから奪われる可能性がある。
- デイリーミッションクリアで獲得したポイントを使って**領土の耐久値を要塞化**しガード！

</div>
</div>

---

## 👥 フレンド・🛡️ チーム & 🏆 ランキング連動

<div class="grid-2">
<div class="card">

### 👥 フレンド & 🛡️ チーム
- **仲間同士でリアルタイム交流**
  - ユーザー検索＆フレンド申請・承認。
- **チーム結成**
  - 仲間と共にチームを結成！
  - チームメンバー全員の獲得面積が合計され、都市スケールで合戦。

</div>
<div class="card">

### 🏆 ランキング
- **「👥 フレンドのみ表示」フィルター**
  - 世界トップだけでなく、**身近な友達の中で自分が何位か**をトグル1つで切り替え可能！
  - ライバル意識を刺激して毎日のランニングをモチベート。

</div>
</div>

---

## ⚙️ 管理者制御：メニュー動的可視性コントロール

### 運営方針やイベントに応じて画面表示をカスタマイズ

- **管理者ダッシュボード (`AdminDashboard`)**
  - システム設定画面から、各メニュー項目 (🏠ホーム, 🗺️マップ, 💪記録, ✨予測, 🥗食事, 👥フレンド, 🛡️チーム, 🏆ランク, 💬コーチ) の表示/非表示をチェックボックスで動的制御。
- **ユーザー画面への即時反映**
  - 管理者がOFFにしたメニューは、ユーザー画面のナビゲーションバーから自動除外。
  - イベント開催時やシンプル設計での運用など、現場ニーズに柔軟対応。

---

## 🛠️ 使用技術紹介：Zod Monorepo & エッジ基盤

### モダンなWeb技術スタックを採用

<div class="grid-2">
<div class="card">

#### 🏗️ Architecture & Monorepo
- **Single Source of Truth**
  - `packages/shared` の Zod スキーマから backend / frontend の型を推論。
  - 型の二重定義を完全に排除した型安全なモノレポ。

</div>
<div class="card">

#### ⚡ Backend & Frontend
- **Backend**: Cloudflare Workers + D1 + Hono (Hono RPC による超高速通信)
- **Frontend**: Vite + React + Vanilla CSS (Cyber/Neonデザイン)
- **Spatial Geo**: Leaflet & Turf.js

</div>
</div>

---

## 📊 現状の開発状況 & 今後のロードマップ

<div class="grid-2">
<div class="card">

### ✅ 実装完了機能 (プロトタイプ完成)
- 認証・プロファイル管理
- リアルタイムGPSトラッキング & 領土占領
- 領土の自動マージ & 要塞化メカニクス
- 👥 フレンド管理 & 🛡️ チーム管理
- 🏆 フレンド限定トグル付きランキング
- ⚙️ 管理者画面によるメニュー可視性制御

</div>
<div class="card">

### 🚀 今後のロードマップ (デザイン＆機能拡張)
- **🎨 UI/UX・見た目のデザイン強化**
  - ゲーム性の高いアニメーション演出・ネオンテーマの視認性ブラッシュアップ
- **🚩 イベントモードの実装**
  - 期間限定の地域対抗陣取りバトルの開催機能
- **📍 AR（拡張現実）連携**
  - 現地チェックインによる特別な領域獲得

</div>
</div>

---

## 🏁 まとめ

### 「運動する」から「街を塗りつぶすために走りたくなる」世界へ

- **1. 課題解決**
  - 単調な運動記録を「リアル都市スプラトゥーン体験」に昇華。
  - 物理整合性チェックでチートのない公平なスポーツ空間を提供。
- **2. 高いソーシャル体験**
  - チーム戦 & フレンド限定ランキングで仲間と一緒に継続。
- **3. 高度な技術設計**
  - Cloudflare Workers + Hono RPC + Zod Monorepo による爆速・型安全アーキテクチャ。

---

# ❓ 質疑応答 (Q&A)

### ご清聴ありがとうございました！

ご質問・ご意見をお願いいたします。
