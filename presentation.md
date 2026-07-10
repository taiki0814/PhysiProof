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
    font-size: 24px;
    background: radial-gradient(circle at top right, rgba(0, 229, 255, 0.05), transparent 45%),
                radial-gradient(circle at bottom left, rgba(0, 255, 136, 0.05), transparent 45%),
                #070a13;
  }
  h1 {
    color: #00ff88;
    font-size: 2.0em;
    margin-bottom: 15px;
  }
  h2 {
    color: #00e5ff;
    font-size: 1.4em;
    border-bottom: 2px solid #00e5ff;
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 15px;
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
  pre {
    background-color: #111827;
    border: 1px solid #1f2937;
    border-radius: 6px;
    padding: 8px;
    font-size: 0.75em;
    margin: 5px 0;
  }
  ul {
    margin-top: 5px;
    margin-bottom: 5px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 4px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .highlight {
    color: #00e5ff;
    font-weight: bold;
  }
  .success {
    color: #00ff88;
    font-weight: bold;
  }
  .warning {
    color: #ff3860;
    font-weight: bold;
  }
  .text-muted {
    color: #9ca3af;
    font-size: 0.9em;
  }
  ul {
    margin-top: 10px;
  }
  li {
    margin-bottom: 8px;
  }
---

# **PhysiProof**
### 運動強度証明 × 地政学的ゲーミフィケーション

次世代ウェルネスプラットフォーム

<br>

<div class="text-muted">
開発チーム / 発表者
</div>

---

## 1. 背景と課題

### 従来のフィットネスアプリにおける「不正（チート）」と「離脱」

<div class="grid-2">
<div>
<h3>① データ真正性の欠如（チート容易性）</h3>

* **自己申告データの脆弱性**
  * 手動入力や単なるボタン押しによる虚偽記録。
* **GPSの偽装・乗り物移動**
  * 車・電車等の移動をランニングと誤判定。
  * 疑似GPSアプリでの位置情報改ざん。
* **スマホの投擲・振動チート**
  * 端末を振ったり投げたりして歩数・運動回数を偽装。
</div>

<div>
<h3>② ゲーミフィケーションの不公平性と飽き</h3>

* **不正によるランキング崩壊**
  * 不正ユーザーが上位を独占し、真面目に運動するユーザーのモチベーションが低下。
* **単純な運動記録の限界**
  * 日々の数値記録や単純なグラフ表示だけではモチベーションが持続せず、早期に離脱。
</div>
</div>

---

## 2. 解決策：PhysiProof のコンセプト

<div class="grid-2">
<div>
<h3>信頼できるデータ ✕ 熱中するゲーム体験</h3>

* **客観的運動証明 (Proof of Exercise)**
  * 物理センサーとスマートな判定アルゴリズムにより、**「本当に運動したこと」**をサーバーサイドで厳密に検証・証明。
* **地政学的ゲーム性 (Territory War)**
  * 運動によって現実世界の「領土」を奪い合う陣取りゲームと、RPG的ステータス育成の融合。
* **AIと物理のハイブリッド推論**
  * 食事解析・目標予測を行い、API制限やオフライン時も物理モデルで稼働し続ける高い信頼性。
</div>

<div>

```
┌───────────────────────────────────────────────┐
│                 PhysiProof                    │
└───────┬───────────────────────────────┬───────┘
        │                               │
┌───────▼───────┐               ┌───────▼───────┐
│ 客観的運動証明 │               │ 地政学的ゲーム │
│ (Anti-Cheat)  │               │ (Territory)   │
└───────┬───────┘               └───────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        ▼
            ┌───────────────────────┐
            │ Gemini AI 身体予測・  │
            │  ハイブリッドモデル   │
            └───────────────────────┘
```

</div>
</div>

---

## 3. システムアーキテクチャ

### Zod と Hono RPC による完全型安全（End-to-End Type Safety）モノレポ

<div class="grid-2">
<div>
<h3>① 唯一の真実の情報源 (SSOT)</h3>

* `packages/shared` にバリデーションスキーマ（Zod）を集約。
* APIのI/O型、データベースモデル、フロントエンドのバリデーションまで全て同じスキーマから自動生成。

<h3>② Hono RPC による通信の保護</h3>

* バックエンド（Hono on Cloudflare Workers）からエクスポートした `AppType` を、フロントエンド（React/Vite）が `hc<AppType>` で利用。
* API呼び出し時のリクエスト・レスポンス型がコンパイル時に100%保証される。
</div>

<div>

```
    [ packages/shared ]  <-- 型の源泉 (Zod)
       /          \
      / (スキーマ) \ (スキーマ)
     v              v
[backend] ------> [frontend]
  (Hono)   (RPC)   (Vite/React)
     ^                  ^
     | (センサーデータ) | (領土・MAP UI)
[mobile-native] ────────┘
   (Android)
```
</div>
</div>

---

## 4. コア技術①：客観的運動証明 (Anti-Cheat)

### 物理法則とデバイス真正性に基づく不正排除ロジック

<div class="grid-2">
<div>
<h3>① 端末投擲・単純振動の排除</h3>

* 腕立て伏せなどの運動時、線形加速度センサーの合成ベクトル（ノルム）を解析。
* 重力加速度を大幅に超える `40m/s²` 以上の急激な変化は「端末の投擲」とみなして即座に却下。

<h3>② モーションロック (Motion Lock)</h3>

* 運動の開始前および終了時に、規定のジェスチャー（ひねりや回転など）をジャイロスコープで検知。
* 機械的な振動マシン等による自動歩数稼ぎを防止。
</div>

<div>
<h3>③ 乗り物移動の遮断</h3>

* GPSから計算される「移動速度」と物理センサーによる「歩数・ケイデンス」を多重分析。
* **チート判定基準**:
  * GPSが50m以上移動したにもかかわらず、歩数が0歩。
  * 移動速度が `時速 30 km` 以上、かつ速度に見合う歩数が記録されていない場合。
</div>
</div>

---

## 5. コア技術②：地政学的ゲーム (Territory War)

### 運動による現実世界の領土獲得とRPG要素の融合

<div class="grid-2">
<div>
<h3>① Turf.js による空間幾何演算</h3>

* GPSトラッキングデータを基に、ユーザーが獲得したルートとカバー領域をポリゴン（GeoJSON）化。
* サーバー（Cloudflare Workers）上で幾何計算ライブラリ `Turf.js` を使用。
* **`@turf/union`**: 自身の領地の結合。
* **`@turf/difference`**: 他ユーザーの領地と重なった際、相手の領地を「削り取る（Carve-out）」処理。
</div>

<div>
<h3>② RPG的育成システム</h3>

* 運動消費カロリーや獲得領土に応じてXPを付与。
* レベルアップ時にステータスポイント（STR: 筋力, AGI: 俊敏性など）を割り振り。
* ステータスが領土の防衛力（要塞化レベル）に影響し、ゲーム性を強化。
</div>
</div>

---

## 6. コア技術③：AI身体予測 ✕ 物理ハイブリッド設計

### Gemini 1.5 Flash による高精度予測とフォールバック

<div class="grid-2">
<div>
<h3>① Gemini によるスマート予測</h3>

* ユーザーの基本情報（年齢、身長、現在体重、目標体重）と活動履歴を Gemini に送信。
* 運動強度に基づき、目標達成にかかる日数や体重推移をAIがシミュレートしてプロット。

<h3>② 物理演算へのフォールバック</h3>

* AI APIの制限やネットワーク遮断時のために、ハリス・ベネディクト方程式に基づく熱力学計算モデル (`physics.ts`) を並行稼働。
* AIが利用できない場合は物理モデルへ自動フォールバックし、**単一障害点（SPOF）を回避**。
</div>

<div>

```
[フロントエンド (データ要求)]
             │
             ▼
[バックエンド (Hono / Worker)]
             │
      ┌──────┴──────┐
      │ (通常時)    │ (AI制限 / オフライン時)
      ▼             ▼
[Gemini API]   [物理フォールバック]
 (AI予測モデル)  (ハリス・ベネディクト等)
      │             │
      └──────┬──────┘
             │
             ▼
      [予測結果を返却]
```
</div>
</div>

---

## 7. 高機能AIコンパニオンと食事解析

### マルチモーダル画像解析とカレンダー自動連携

<div class="grid-2">
<div>
<h3>① マルチモーダル食事解析</h3>

* スマホカメラで撮影した食事の画像を Gemini に直接アップロード。
* AIが料理名、推定カロリー、PFCバランス（タンパク質・脂質・炭水化物）を分析し、**Structured Output（構造化JSON）**でバックエンドに返却。DBへ自動記録。
</div>

<div>
<h3>② AIコーチとカレンダー連携</h3>

* チャット型パーソナルAIコーチが運動や食事のアドバイスを提供。
* 対話中に「明日の朝にランニングの予定を入れるね」とAIが決めた場合、応答の末尾に非表示のマーカーを出力。
  ```json
  __SCHEDULE_ADD__:{"title":"ランニング","scheduled_at":"2026-07-11T08:00:00"}
  ```
* システムがこれを検知し、自動的に `training_schedules` テーブルに予定を自動インサート。
</div>
</div>

---

## 8. 高度なセキュリティとモバイル安定稼働

### Google Play Integrity とバックグラウンド対策

<div class="grid-2">
<div>
<h3>① デバイス真正性の検証</h3>

* Android実機で生成した `Play Integrity API` トークンをバックエンドへ送信。
* OSが改ざん（Root化）されていないか、エミュレータ上の偽装実行ではないかをGoogleサーバー経由で検証。
* **物理センサー生データの改ざん・リプレイ攻撃をブロック**。
</div>

<div>
<h3>② バックグラウンド動作の永続化</h3>

* モバイルブラウザでの位置・歩数追跡時、OSによるJSスレッドのサスペンドを回避。
* **Web Audio API**: 1.5秒ごとに極小の無音オーディオ信号を再生。
* **Screen Wake Lock API**: 画面消灯を防ぎ、バックグラウンドでのGPS測位を安定継続。
</div>
</div>

---

## 9. データベース設計 (Cloudflare D1)

### Edge環境に最適化されたデータベース構造

<div class="grid-2">
<div>
<h3>主要テーブルと設計の工夫</h3>

* **`users`**:
  * RPGステータス（STR, AGI等）、レベル、経験値、目標値を保持。
* **`territories`**:
  * GeoJSON形式の `area_polygon` (地理ポリゴン) を格納。
  * 時間帯（Morning/Afternoon/Night）や防衛レベル（Fortification Level）を管理。
* **`pushup_measurements`**:
  * チート検証用にセンサー生ログ（`sensor_log`）を格納。
</div>

<div>
<h3>整合性とパフォーマンス</h3>

* **`used_nonces` (リプレイ対策)**:
  * リクエストごとに一時Nonceを記録し、重複した送信データを検知・排除。
* **Edge分散配置**:
  * Cloudflare D1 により、世界各地のEdgeノードで超低遅延な読み込み・書き込みを実現。
</div>
</div>

---

## 10. まとめと今後の展望

<div class="grid-2">
<div>
<h3>プロジェクトの成果</h3>

* <span class="success">確かな信頼性 (Trust)</span>
  * センサー解析と Play Integrity による、**「ごまかしの効かない」**運動証明。
* <span class="success">強力な継続性 (Engagement)</span>
  * 領土争いとRPG要素が運動の習慣化をサポート。
* <span class="success">卓越した開発効率 (Safety)</span>
  * Monorepo ✕ Hono RPC ✕ Zod による堅牢な型安全開発。
</div>

<div>
<h3>今後の展望</h3>

* **マルチプレイヤー共同防衛戦**
  * チームを作成し、共同で巨大な「城（レイド領土）」を防衛・攻略する機能。
* **プライバシー保護型位置証明 (Zero-Knowledge Location)**
  * ユーザーの正確な居住地を特定させずに、領土の獲得だけを証明する暗号技術の導入。
* **ウェアラブル端末との直接連携**
  * Apple Watch / Wear OS との直接連携による、さらなる高精度なバイオメトリクス検知。
</div>
</div>

---

# **PhysiProof**
### ご清聴ありがとうございました。

運動を証明し、世界を支配する。次世代のウェルネスプラットフォーム。

---
