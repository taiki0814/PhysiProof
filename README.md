# PhysiProof: Proof of Exercise Monorepo

Hono (Backend), Vite/React (Frontend), Zod (Shared), and D1 Database を組み合わせた、運動強度証明（Proof of Exercise）プラットフォームです。

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
