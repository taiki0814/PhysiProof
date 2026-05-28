-- 運動種目ごとのメタデータ（AIが算出した1回あたりのカロリーなど）をキャッシュするテーブル
CREATE TABLE IF NOT EXISTS exercise_metadata (
  exercise_type TEXT PRIMARY KEY,
  unit_calories REAL NOT NULL, -- 1回あたりの消費カロリー
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
