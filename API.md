# PhysiProof API 仕様書

PhysiProof のバックエンド API (Hono + Cloudflare Worker) の仕様書です。
本プロジェクトは Hono RPC を使用しており、バリデーションスキーマとして `@my-app/shared` の Zod スキーマを共有しています。

---

## 📌 共通仕様

### 1. ベースURL
開発環境および本番環境のすべての API エンドポイントは、以下のベースパスを起点とします。
* `/api`
  * 例: サインアップは `POST /api/auth/signup`

### 2. 認証 (Authentication)
認証が必要なエンドポイントは、`firebaseAuth` ミドルウェアによって保護されています。
リクエスト送信時、Firebase Authentication から取得した JWT (IDトークン) を以下のヘッダーに付与する必要があります。
```http
Authorization: Bearer <firebase_id_token>
```
* サーバー側では、デコードされたトークンからユーザーID (`firebaseUser.sub`) を取得し、所有権の検証を行っています。

### 3. バリデーション & エラーレスポンス
リクエストボディは Zod スキーマに基づいて自動的に検証されます。バリデーションエラーが発生した場合、以下の共通フォーマットで `400 Bad Request` が返却されます。
```json
{
  "error": "エラーメッセージ（複数の場合はカンマ区切り）"
}
```

一般的なシステムエラー時のレスポンス（`500 Internal Server Error` など）:
```json
{
  "error": "Internal Server Error"
}
```

---

## 🗺️ API カテゴリ一覧

1. [認証関連 API](#1-認証関連-api) (`/auth/*`, `/sync/*`)
2. [運動測定（プッシュアップ）API](#2-運動測定プッシュアップ-api) (`/pushups/*`, `/exercises/*`, `/predict`)
3. [ユーザープロフィール・ステータス API](#3-ユーザープロフィールステータス-api) (`/users/*`, `/ranking`)
4. [食事記録 & 解析 API](#4-食事記録--解析-api) (`/meals/*`)
5. [AIコーチ対話（チャット）API](#5-aiコーチ対話チャット-api) (`/chat/*`)
6. [トレーニング計画 API](#6-トレーニング計画-api) (`/schedules/*`)
7. [領域（Territories）API](#7-領域territories-api) (`/territories/*`)
8. [実績 & ミッション API](#8-実績--ミッション-api) (`/achievements/*`, `/missions/*`)
9. [通知 API](#9-通知-api) (`/notifications/*`)
10. [管理者向け API](#10-管理者向け-api) (`/admin/*`)

---

## 🔑 各 API の詳細仕様

### 1. 認証関連 API

#### `POST /auth/signup`
新規ユーザーのアカウント登録を行います。
* **認証**: 不要
* **リクエストボディ (JSON)**: `signupSchema`
  ```json
  {
    "loginId": "user123", // 必須、3文字以上
    "password": "securepassword", // 必須、6文字以上
    "name": "山田 太郎" // 必須、1文字以上
  }
  ```
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "userId": "uuid-string"
  }
  ```

#### `POST /auth/login`
ログイン認証を行い、ユーザーのステータス情報を含むプロフィールを取得します。
* **認証**: 不要
* **リクエストボディ (JSON)**: `loginSchema`
  ```json
  {
    "loginId": "user123",
    "password": "securepassword"
  }
  ```
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "userId": "uuid-string",
    "name": "山田 太郎",
    "avatar_id": "default",
    "avatar_image": null, // base64画像データがある場合は文字列
    "login_id": "user123",
    "role": "user", // "user" | "admin"
    "current_weight": 70.5,
    "target_weight": 65.0,
    "target_calories_burned": 500,
    "target_calories_consumed": 2000,
    "gender": "male",
    "age": 28,
    "height": 175.2,
    "level": 1,
    "xp": 0,
    "status_points": 0,
    "stat_str": 10,
    "stat_agi": 10,
    "stat_def": 10,
    "stat_vit": 10
  }
  ```

---

### 2. 運動測定（プッシュアップ）API

#### `POST /pushups`
腕立て伏せなどの運動データを送信・保存します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `pushupMeasurementSchema`
  ```json
  {
    "user_id": "uuid-string", // ログイン中の Firebase UID と一致する必要あり
    "exercise_type": "pushup", // 種目名
    "count": 15, // 回数 (0以上)
    "timestamp": "2026-07-09T11:14:30.000Z", // ISO8601形式
    "nonce": "unique-session-nonce", // 重複送信(Replay Attack)防止用のユニーク文字列
    "steps": 0, // オプション
    "distance": 0, // オプション
    "integrity_token": "play-integrity-token-string", // オプション (端末真正性検証用)
    "sensor_log": [ // 物理的整合性検証（不正防止）用センサー生データ
      { "x": 0.1, "y": -9.8, "z": 0.2, "t": 1718223122100, "gx": 0, "gy": 0, "gz": 0 }
    ]
  }
  ```
* **レスポンス (201 Created)**:
  ```json
  {
    "message": "プッシュアップの記録を保存しました。",
    "newAchievements": [ // 新しく解除された実績
      {
        "id": "pushup_master",
        "title": "筋鉄の意志",
        "icon": "💪",
        "description": "累計の腕立て伏せ計測回数が 100 回を突破した。"
      }
    ],
    "xpInfo": {
      "levelUp": true,
      "newLevel": 2,
      "newXp": 15,
      "newStatusPoints": 3
    }
  }
  ```

#### `POST /pushups/bulk`
オフライン時に蓄積された複数の運動データを一括送信します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `bulkPushupMeasurementSchema`
  `pushupMeasurementSchema` のオブジェクト配列
* **レスポンス (200 OK)**:
  ```json
  {
    "message": "一括送信処理が完了しました。",
    "details": {
      "processed": 5, // 正常に処理された件数
      "skipped": 1, // Nonce重複によりスキップされた件数
      "failed": 0 // バリデーション・所有権不一致等で失敗した件数
    },
    "newAchievements": [],
    "xpInfo": {
      "levelUp": false,
      "newLevel": 2,
      "newXp": 80,
      "newStatusPoints": 3
    }
  }
  ```

#### `GET /exercises/me`
自分の運動ログのサマリー（種目ごとの合計回数と推定消費カロリー）を取得します。
* **認証**: 必要
* **クエリパラメータ**:
  * `period`: 絞り込み期間 (`"daily"` | `"weekly"` | `"all"`)。デフォルトは `"all"`。
* **レスポンス (200 OK)**:
  ```json
  {
    "stats": [
      {
        "exercise_type": "pushup",
        "total_count": 120,
        "estimated_calories": 54.5 // AI推定、またはメタデータに基づくカロリー
      },
      {
        "exercise_type": "ランニング（支配領域）",
        "total_count": 5200, // メートル
        "estimated_calories": 350.0
      }
    ]
  }
  ```

#### `DELETE /exercises/type/:type`
指定した運動種目の自分の測定データを一括削除します。
* **認証**: 必要
* **パスパラメータ**:
  * `type`: 削除対象の `exercise_type` (例: `pushup`)
* **レスポンス (200 OK)**:
  ```json
  {
    "message": "pushup の記録をすべて削除しました"
  }
  ```

#### `POST /predict`
現在のカロリー収支とステータスに基づき、目標体重達成までの必要日数とAIアドバイスを予測します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `predictionRequestSchema`
  ```json
  {
    "totalCaloriesBurned": 450.5, // 今日の消費カロリー
    "mealCaloriesConsumed": 1800.0, // 今日の摂取カロリー
    "currentWeight": 72.0, // 現在体重 (kg)
    "targetWeight": 68.0, // 目標体重 (kg)
    "gender": "male", // オプション ("male" | "female" | "other")
    "age": 28, // オプション
    "height": 172.5 // オプション (cm)
  }
  ```
* **レスポンス (200 OK)**: `predictionSchema`
  ```json
  {
    "daysToTarget": 45,
    "advice": "今日のペースを維持すれば、約45日で目標に到達可能です。有酸素運動の割合を少し増やして、PFCバランスを意識しましょう。",
    "dailyCalorieDeficit": 600.0,
    "confidenceScore": 0.85,
    "source": "ai", // "ai" (Gemini) または "fallback" (物理計算エンジン)
    "debugPrompt": "..." // 開発者向けデバッグ情報
  }
  ```

#### `GET /predictions/history`
過去の体重目標予測履歴を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "predictions": [
      {
        "id": "uuid-string",
        "current_weight": 72.0,
        "target_weight": 68.0,
        "total_calories_burned": 450.5,
        "meal_calories_consumed": 1800.0,
        "days_to_target": 45,
        "advice": "...",
        "daily_calorie_deficit": 600.0,
        "gender": "male",
        "age": 28,
        "height": 172.5,
        "created_at": "2026-07-09T11:15:00.000Z"
      }
    ]
  }
  ```

---

### 3. ユーザープロフィール・ステータス API

#### `GET /users/me`
自分の現在のステータス・プロフィール情報を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "uuid-string",
      "name": "山田 太郎",
      "avatar_id": "default",
      "avatar_image": null,
      "login_id": "user123",
      "role": "user",
      "current_weight": 72.0,
      "target_weight": 68.0,
      "target_calories_burned": 500,
      "target_calories_consumed": 2000,
      "gender": "male",
      "age": 28,
      "height": 172.5,
      "level": 2,
      "xp": 45,
      "status_points": 3,
      "stat_str": 10,
      "stat_agi": 10,
      "stat_def": 10,
      "stat_vit": 10
    }
  }
  ```

#### `PUT /users/me`
自分のプロフィール情報を更新します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `updateProfileSchema` (すべてオプション、変更するもののみ送信)
  ```json
  {
    "name": "山田 太郎 (更新後)", // 1〜50文字
    "avatar_id": "custom", // アバターID
    "avatar_image": "data:image/png;base64,...", // base64形式の画像データ
    "login_id": "new_user123",
    "password": "new_securepassword",
    "current_weight": 71.5,
    "target_weight": 68.0,
    "target_calories_burned": 550,
    "target_calories_consumed": 1950,
    "gender": "male",
    "age": 28,
    "height": 172.5
  }
  ```
* **レスポンス (200 OK)**:
  更新されたプロフィールの値と、解除された実績 (`newAchievements`) が返却されます。

#### `POST /users/me/allocate-stats`
レベルアップ時に得られるステータスポイント（Status Points）を各パラメータに割り振ります。
* **認証**: 必要
* **リクエストボディ (JSON)**: `allocateStatsSchema`
  ```json
  {
    "str": 2, // STR(筋力)に割り振るポイント
    "agi": 1, // AGI(敏捷)に割り振るポイント
    "def": 0, // DEF(防御)に割り振るポイント
    "vit": 0  // VIT(体力)に割り振るポイント
  }
  ```
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "message": "ステータスを更新しました。",
    "stats": {
      "status_points": 0, // 残りポイント
      "stat_str": 12, // 更新後のパラメータ値
      "stat_agi": 11,
      "stat_def": 10,
      "stat_vit": 10
    }
  }
  ```

#### `GET /ranking`
支配領域（面積）のランキングを取得します。
* **認証**: 不要
* **クエリパラメータ**:
  * `period`: 領域獲得の時間帯絞り込み (`"morning"` | `"afternoon"` | `"night"` | `"all"`)。デフォルトは `"all"`。
  * `duration`: 集計対象の期間 (`"daily"` | `"weekly"` | `"yearly"` | `"all"`)。デフォルトは `"all"`。
* **レスポンス (200 OK)**:
  ```json
  {
    "ranking": [
      {
        "rank": 1,
        "name": "山田 太郎",
        "avatar_id": "custom",
        "avatar_image": "...",
        "territories": 5, // 保有領域数
        "points": 2450 // 総面積 (平方メートル) を整数に丸めた値
      }
    ]
  }
  ```

---

### 4. 食事記録 & 解析 API

#### `POST /meals/analyze`
アップロードされた食事画像（Base64）を Gemini に送信し、画像解析によるメニュー名、推定カロリー、PFCバランス、および健康アドバイスを生成・記録します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `mealAnalysisRequestSchema`
  ```json
  {
    "image": "data:image/jpeg;base64,..." // 必須、Base64エンコード画像
  }
  ```
* **レスポンス (200 OK)**:
  ```json
  {
    "name": "アボカドチキンサラダ",
    "calories": 420.0,
    "pfc": {
      "protein": 28.5,
      "fat": 18.0,
      "carbs": 12.0
    },
    "advice": "高タンパクで良質な脂質が含まれています。トレーニング後の栄養補給として最適です。",
    "id": "uuid-string", // 新規登録された食事記録のID
    "created_at": "2026-07-09T11:15:30.000Z",
    "newAchievements": [], // カロリーマネージャー実績などが解除された場合に含まれます
    "xpInfo": {
      "levelUp": false,
      "newLevel": 2,
      "newXp": 65,
      "newStatusPoints": 3
    }
  }
  ```

#### `GET /meals/history`
自分の食事記録履歴の一覧を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "meals": [
      {
        "id": "uuid-string",
        "name": "アボカドチキンサラダ",
        "calories": 420.0,
        "protein": 28.5,
        "fat": 18.0,
        "carbs": 12.0,
        "advice": "...",
        "created_at": "2026-07-09T11:15:30.000Z"
      }
    ]
  }
  ```

---

### 5. AIコーチ対話（チャット）API

#### `GET /chat/history`
AIコーチとのチャット対話履歴（直近50件）を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "messages": [
      {
        "id": "msg-id-1",
        "sender": "user",
        "message": "最近、肩こりが酷いのですがおすすめの運動はありますか？",
        "created_at": "2026-07-09T11:10:00.000Z"
      },
      {
        "id": "msg-id-2",
        "sender": "ai",
        "message": "肩こりには、肩甲骨を動かすストレッチや軽めの腕立て伏せが効果的です！...",
        "created_at": "2026-07-09T11:10:05.000Z"
      }
    ]
  }
  ```

#### `POST /chat`
AIコーチに質問を送信し、対話的アドバイスを取得します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `chatRequestSchema`
  ```json
  {
    "message": "明日の20時にスクワット50回やるよ"
  }
  ```
* **レスポンス (201 Created)**:
  ```json
  {
    "userMessage": {
      "id": "uuid-user-msg",
      "sender": "user",
      "message": "明日の20時にスクワット50回やるよ",
      "created_at": "2026-07-09T11:15:50.000Z"
    },
    "aiMessage": {
      "id": "uuid-ai-msg",
      "sender": "ai",
      "message": "了解！明日の20時にスクワット50回の予定をカレンダーに登録しておいたよ！頑張ろう！",
      "created_at": "2026-07-09T11:15:55.000Z"
    },
    "newAchievements": []
  }
  ```
* **AI自動スケジュール機能**:
  AIがユーザーのメッセージからトレーニング予定（日時と内容）を検知すると、バックエンドで自動的にカレンダー（トレーニング計画）へ登録を実行します。

---

### 6. トレーニング計画 API

#### `GET /schedules`
自分が登録しているトレーニング予定の一覧を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "schedules": [
      {
        "id": "uuid-schedule-1",
        "user_id": "uuid-user",
        "title": "スクワット50回",
        "scheduled_at": "2026-07-10T20:00:00.000Z",
        "completed": 0, // 0: 未完了, 1: 完了
        "created_at": "2026-07-09T11:15:55.000Z"
      }
    ]
  }
  ```

#### `POST /schedules`
トレーニング予定を手動で新規登録します。
* **認証**: 必要
* **リクエストボディ (JSON)**: `createTrainingScheduleSchema`
  ```json
  {
    "title": "腕立て伏せ 30回", // 必須、1文字以上
    "scheduled_at": "2026-07-11T10:00:00.000Z" // 必須、ISO日時
  }
  ```
* **レスポンス (201 Created)**:
  ```json
  {
    "success": true,
    "schedule": {
      "id": "new-schedule-uuid",
      "user_id": "uuid-user",
      "title": "腕立て伏せ 30回",
      "scheduled_at": "2026-07-11T10:00:00.000Z",
      "completed": 0
    }
  }
  ```

#### `DELETE /schedules/:id`
指定したトレーニング予定を削除します。
* **認証**: 必要
* **パスパラメータ**:
  * `id`: 削除対象スケジュールの UUID
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "message": "スケジュールを削除しました。"
  }
  ```

#### `POST /schedules/:id/toggle`
指定したトレーニング予定の完了状態（`completed`: 0 と 1）を切り替えます。
* **認証**: 必要
* **パスパラメータ**:
  * `id`: トグル対象スケジュールの UUID
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "completed": 1 // 変更後の完了状態
  }
  ```

---

### 7. 領域（Territories）API

#### `POST /territories`
GPSによるトラッキングデータに基づき、新規の支配領域（土地）を保存・マージします。
* **認証**: 必要
* **リクエストボディ (JSON)**: `createTerritorySchema`
  ```json
  {
    "user_id": "uuid-user",
    "latitude": 35.6812, // 代表中心緯度
    "longitude": 139.7671, // 代表中心経度
    "area_sqm": 120.5, // 占有面積（平方メートル）
    "time_period": "morning", // "morning" | "afternoon" | "night"
    "area_polygon": "[[35.6812,139.7671],[35.6815,139.7671],[35.6815,139.7675],[35.6812,139.7675]]", // [lat, lng] 配列の文字列化
    "distance_m": 450.0, // オプション、移動距離（メートル）
    "duration_sec": 300, // オプション、所要時間（秒）
    "avg_speed_kmh": 5.4, // オプション、平均速度
    "address": "東京都千代田区丸の内" // オプション、逆ジオコーディング住所
  }
  ```
* **特記事項**:
  * **チート防止**: `avg_speed_kmh` が 40 km/h を超える登録は `400 Bad Request` となり拒否されます。
  * **自動逆ジオコーディング**: `address` 未設定時は OpenStreetMap (Nominatim) API を用いてサーバー側で住所を取得します。
  * **対戦・上書き (削り取り)**: 自分以外の領域と重なった場合、防衛レベルによる軽減はなく、重なった部分を差し引きます。領域が完全に上書きされた場合は削除され、所有者には通知されます。
  * **自己マージ**: 新領域が自分の既存領域と重なる場合、自動的に結合（Union）されて1つの領域にマージされます。
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "message": "領域を保存しました", // または "2個 of 領域を統合しました"
    "id": "final-territory-uuid",
    "newAchievements": [],
    "xpInfo": {
      "levelUp": false,
      "newLevel": 2,
      "newXp": 95,
      "newStatusPoints": 3
    }
  }
  ```

#### `GET /territories`
全プレイヤーが所有するマップ上の全支配領域データを取得します（フロントエンドのマップ描画用）。
* **認証**: 不要
* **レスポンス (200 OK)**:
  ```json
  {
    "territories": [
      {
        "id": "territory-uuid",
        "user_id": "owner-user-uuid",
        "user_name": "山田 太郎",
        "latitude": 35.6812,
        "longitude": 139.7671,
        "area_polygon": "[[35.6812,139.7671],...]",
        "area_sqm": 120.5,
        "time_period": "morning",
        "captured_at": "2026-07-09T11:15:00.000Z",
        "address": "東京都千代田区丸の内"
      }
    ]
  }
  ```

---

### 8. 実績 & ミッション API

#### `GET /achievements/me`
自分が現在までに解除（Unlock）した実績一覧を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "achievements": [
      {
        "achievement_id": "first_close", // 実績ID (sharedで定義)
        "unlocked_at": "2026-07-09T03:14:00.000Z"
      }
    ]
  }
  ```

#### `GET /missions/today`
本日のランニングミッションを取得します。ミッションは、オンラインで距離が記録されたランニングを1回完了すると達成です。腕立て記録や食事解析はミッション進捗・報酬に影響しません。既存の当日ミッションが運動・食事型の場合は、受取状態を保ったままランニング型に置き換えます。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "mission": {
      "id": "mission-uuid",
      "user_id": "uuid-user",
      "mission_date": "2026-07-09",
      "title": "🏃 今日のランニング",
      "description": "オンラインでランニングを1回完了しよう。",
      "target_type": "running",
      "target_count": 1,
      "current_count": 0,
      "is_completed": 0, // 0: 未達成, 1: 達成
      "claimed": 0 // 0: 未受け取り, 1: 受け取り済み
    }
  }
  ```

#### `POST /missions/claim`
達成済みのランニングミッションの報酬として100 XPを受け取ります。領土の選択や強化は行いません。
* **認証**: 必要
* **リクエストボディ (JSON)**: `claimMissionRewardRequestSchema`
  ```json
  {
    "missionId": "mission-uuid" // 達成済みランニングミッションID
  }
  ```
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "message": "ランニングミッションの報酬を受け取りました。",
    "xpInfo": {
      "levelUp": false,
      "newLevel": 3,
      "newXp": 50,
      "newStatusPoints": 3
    }
  }
  ```

---

### 9. 通知 API

#### `GET /notifications`
自分宛ての通知一覧（直近50件）を取得します。
* **認証**: 必要
* **レスポンス (200 OK)**:
  ```json
  {
    "notifications": [
      {
        "id": "notif-uuid",
        "user_id": "uuid-user",
        "title": "⚠️ 領土が削られました",
        "message": "あなたの領土の一部が「鈴木」によって削られました。",
        "type": "territory_lost", // "level_up" | "territory_lost" | "system" | "admin_alert" など
        "is_read": 0, // 0: 未読, 1: 既読
        "created_at": "2026-07-09T11:12:00.000Z"
      }
    ]
  }
  ```

#### `POST /notifications/:id/read`
指定した通知を既読状態に更新します。
* **認証**: 必要
* **パスパラメータ**:
  * `id`: 対象の通知 UUID
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "message": "通知を既読にしました。"
  }
  ```

---

### 10. 管理者向け API
※これらの API を呼び出すには、`firebaseAuth` で識別されたユーザーのロール（`role`）が `admin` である必要があります。非管理者からのアクセスは `403 Forbidden` となります。

#### `GET /admin/settings`
システム全体の設定（保有領域の上限数など）を取得します。
* **レスポンス (200 OK)**:
  ```json
  {
    "settings": {
      "max_territories": "20"
    }
  }
  ```

#### `POST /admin/settings`
システムの設定を更新します。
* **リクエストボディ (JSON)**: `systemSettingsSchema`
  ```json
  {
    "max_territories": "30" // 必須、1以上の数値文字列
  }
  ```
* **レスポンス (200 OK)**: `{ "success": true, "message": "システム設定を更新しました。" }`

#### `GET /admin/summary`
アプリ全体の統計データを取得します。
* **レスポンス (200 OK)**:
  ```json
  {
    "totalUsers": 150,
    "totalTerritories": 432,
    "totalExercises": 3540,
    "totalArea": 54230.8 // 平方メートル
  }
  ```

#### `GET /admin/users`
全ユーザーの一覧とステータス情報を取得します。
* **レスポンス (200 OK)**: `{ "users": [ ... ] }`

#### `POST /admin/users/:id`
特定のユーザーの情報を強制的に更新します。
* **パスパラメータ**: `:id` (ユーザー UUID)
* **リクエストボディ (JSON)**: `adminUpdateUserSchema` (部分更新可)
* **レスポンス (200 OK)**: `{ "success": true, "message": "ユーザー情報を更新しました。" }`

#### `DELETE /admin/users/:id`
特定のユーザーとその関連データ（測定履歴、領土、ミッション等）を物理削除します。
* **パスパラメータ**: `:id` (ユーザー UUID)
* **レスポンス (200 OK)**: `{ "success": true, "message": "ユーザー及び関連データを削除しました。" }`

#### `GET /admin/notifications`
全ユーザー向けに送信された通知の一覧を取得します（最新100件）。
* **レスポンス (200 OK)**: `{ "notifications": [ ... ] }`

#### `POST /admin/notifications`
特定のユーザーへ管理メッセージや警告通知を送信します。
* **リクエストボディ (JSON)**: `adminSendNotificationSchema`
  ```json
  {
    "user_id": "target-user-uuid",
    "title": "メンテナンスのお知らせ",
    "message": "本日24:00よりメンテナンスを行います。",
    "type": "system" // "level_up" | "territory_lost" | "system" | "admin_alert"
  }
  ```
* **レスポンス (200 OK)**: `{ "success": true, "message": "通知を送信しました。" }`

#### `DELETE /admin/notifications/:id`
送信された特定の通知を削除します。
* **パスパラメータ**: `:id` (通知 UUID)
* **レスポンス (200 OK)**: `{ "success": true, "message": "通知を削除しました。" }`

#### `GET /admin/territories`
監査情報（AI監査ステータス）を含む全支配領域データを取得します。
* **レスポンス (200 OK)**: `{ "territories": [ ... ] }` (平均速度や `ai_integrity` などの監査結果含む)

#### `DELETE /admin/territories/:id`
特定の支配領域を強制削除します。
* **パスパラメータ**: `:id` (領土 UUID)
* **レスポンス (200 OK)**: `{ "success": true, "message": "領域を削除しました。" }`

#### `POST /admin/territories/:id/audit`
特定の領土データ（面積、速度、形状など）に対して Gemini による不正検知監査を強制実行します。
* **パスパラメータ**: `:id` (領土 UUID)
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "integrity": "healthy", // "healthy" | "suspicious" | "cheating"
    "reason": "平均速度が妥当であり、移動経路（多角形）の形状も人間のランニング特性と一致しています。",
    "confidence": 0.95
  }
  ```

#### `GET /admin/exercises`
全プレイヤーの最新50件の運動ログを取得します。
* **レスポンス (200 OK)**: `{ "exercises": [ ... ] }` (センサログや `ai_integrity` 監査結果含む)

#### `DELETE /admin/exercises/:id`
特定の運動ログを削除します。
* **パスパラメータ**: `:id` (運動履歴 UUID)
* **レスポンス (200 OK)**: `{ "success": true, "message": "運動履歴を削除しました。" }`

#### `POST /admin/exercises/:id/audit`
特定の運動センサ生ログに対して Gemini による自動監査を実行し、人間が行った運動（腕立て伏せ等）の加速度波形として真正であるかを監査します。
* **パスパラメータ**: `:id` (運動履歴 UUID)
* **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "integrity": "healthy", // "healthy" | "suspicious" | "cheating"
    "reason": "Z軸の定期的な加速度の振幅変動が認められ、典型的な腕立て伏せの動作と合致しています。",
    "confidence": 0.92
  }
  ```

#### `GET /admin/api-usage`
過去の API 使用率、エンドポイント別の成功/エラーコール数、平均レスポンスタイム、最近のサーバーエラー履歴を取得します。
* **レスポンス (200 OK)**:
  ```json
  {
    "summary": [ { "api_type": "exercise", "total_calls": 320, "success_count": 315, "error_count": 5, "avg_response_ms": 120 } ],
    "byEndpoint": [ ... ],
    "daily": [ ... ],
    "recentErrors": [ ... ]
  }
  ```
