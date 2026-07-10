# PhysiProof: Proof of Exercise Monorepo

Hono (Backend), Vite/React (Frontend), Zod (Shared), and D1 Database を組み合わせた、運動強度証明（Proof of Exercise）プラットフォームです。

## 📄 各種資料・プロモーション素材
本プロジェクトの紹介、説明用資料として以下のファイルを同梱しています：
- **[1枚説明ビラ (A4チラシ風 HTML)](./flyer.html)**: 画面イメージや特徴を1枚にまとめた印刷用パンフレット。
- **[機能説明スライド (Marp形式)](./presentation.md)**: プレゼンテーションや講義、レビュー等で使えるスライド原稿。
- **[MIT ライセンス](./LICENSE)**: 本プロジェクトのライセンス定義。

---

## 🚀 起動手順

### 1. 依存関係のインストール
プロジェクトのルートディレクトリで実行します。
```bash
npm install
```

### 2. データベースの初期化
ローカル環境で D1 データベースをセットアップし、マイグレーションを適用します。
```bash
# packages/backend に移動
cd packages/backend
# マイグレーションの適用
npx wrangler d1 migrations apply DB --local
```

### 3. 開発サーバーの起動
バックエンドとフロントエンドの両方のサーバーを同時に起動します。
```bash
# ターミナル 1: Backend (Hono)
npm run dev:backend

# ターミナル 2: Frontend (Vite)
npm run dev:frontend
```

## 🛠️ 使用技術一覧 (Technology Stack)

本プロジェクトは、フロントエンドからバックエンドまで一貫した型安全を確保し、高度なチート防止アルゴリズムとAIによる推論予測を組み合わせた構成となっています。

### 🏗️ コア・アーキテクチャ
- **ワークスペース**: `npm workspaces` モノレポ構成
- **型定義とスキーマバリデーション**: `shared` に置かれた `Zod` スキーマを「唯一の真実（SSOT）」として参照。

### 📡 バックエンド (API / DB)
- **Webフレームワーク**: `Hono` (超軽量・高速フレームワーク)
- **データベース**: `Cloudflare D1` (エッジ配置のSQLite互換データベース)
- **ホスティング/ランタイム**: `Cloudflare Workers` (サーバーレス・エッジコンピューティング環境)
- **リクエストバリデーション**: `@hono/zod-validator`

### 💻 フロントエンド (Web App / PWA)
- **ライブラリ/言語**: `React 18` + `TypeScript`
- **ビルドツール**: `Vite`
- **幾何計算 (GIS)**: `@turf/area`, `@turf/difference`, `@turf/union`, `@turf/helpers` (領土の削り取り・マージなどの空間演算)
- **状態管理/通信**: `Hono RPC` (バックエンド API の型定義を読み込み、完全型安全にクライアント通信)
- **スタイリング**: `Vanilla CSS` (HSLに基づくスタイリッシュなダークモード)

### 🛡️ 運動証明（Anti-Cheat）＆ セキュリティ
- **物理センサー整合性検証**: 線形加速度データを用いた「端末投げチート」の排除。
- **移動相関検証**: GPSの移動ベクトルと物理歩数（Step Counter）の連動検証による「乗り物移動チート」の排除。
- **端末真正性保証**: `Google Play Integrity API` (エミュレータ・改ざん端末の排除)。
- **リプレイ攻撃対策**: Nonce 一時テーブルによる重複送信の排除。

### 🔄 CI/CD & 自動デプロイ
- **プラットフォーム**: `GitHub Actions`
- **挙動**: `main`ブランチへのプッシュをトリガーに、ビルド・型チェックの後に `Cloudflare Workers` / `Pages` へ自動デプロイが実行されます。

### ✨ AI (身体推論)
- **推論モデル**: `Gemini 1.5 Flash` (食事と運動実績データからの身体遷移予測)
- **耐障害性**: AI使用制限時または障害時に、ハリス・ベネディクトの方程式に基づく物理計算モデルへの自動フォールバック。

### 🚀 バックグラウンド位置追跡技術
- **Web Audio API (Keep-Alive)**: 1.5秒ごとの無音オーディオ信号再生により、別アプリ使用中やスリープ中でもブラウザのJavaScriptサスペンドを回避。
- **Screen Wake Lock API**: 計測中の画面の自動スリープ（ロック）を防止。

## ⚙️ 環境変数の設定ガイド

### Gemini API キー
AI による目標達成予測機能を利用するには、Gemini API キーの設定が必要です。

1. [Google AI Studio](https://aistudio.google.com/) で API キーを取得します。
2. `packages/backend/wrangler.toml` の `[vars]` セクションにキーを記述します。
   ```toml
   [vars]
   GEMINI_API_KEY = "あなたのAPIキー"
   ```
3. 本番環境（Cloudflare Workers）にデプロイする場合は、以下のコマンドを使用します：
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```

## 🏗 データベース・スキーマ
本プロジェクトでは以下のテーブルが D1 上に構築されます：

- **Users**: ユーザー基本情報、現在の体重、目標体重。
- **Territories**: 運動によって獲得可能な領土データ。
- **ExerciseLogs**: プッシュアップ、ランニングなどの運動記録。
- **Meals**: 摂取カロリーと食事の記録。
- **PushupMeasurements**: 加速度センサーログを含む詳細な運動証明データ。

## 🛠 開発ワークフロー (Constitution)
本プロジェクトは **Zod を単一の真実の情報源 (SSOT)** としています。
1. `shared` で Zod スキーマを定義。
2. `backend` で D1 マイグレーションと API を実装。
3. `frontend` で Hono RPC を介して型安全に通信。

型の整合性を保つため、スキーマ変更時は必ず `npm run typecheck` を実行してください。

---

## 📖 技術解説 (Technical Documentation)
プロジェクトのアーキテクチャ、独自アルゴリズム、AI 連携の詳細については [README_TECH.md](./README_TECH.md) を参照してください。
