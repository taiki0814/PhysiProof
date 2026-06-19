-- weight_predictionsテーブルの作成

CREATE TABLE IF NOT EXISTS weight_predictions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_weight REAL NOT NULL,
  target_weight REAL NOT NULL,
  total_calories_burned REAL NOT NULL,
  meal_calories_consumed REAL NOT NULL,
  days_to_target INTEGER NOT NULL,
  advice TEXT NOT NULL,
  daily_calorie_deficit REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
