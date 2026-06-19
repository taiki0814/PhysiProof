-- usersテーブルおよびweight_predictionsテーブルに、消費/摂取目標カロリーと性別を追加

ALTER TABLE users ADD COLUMN target_calories_burned REAL;
ALTER TABLE users ADD COLUMN target_calories_consumed REAL;
ALTER TABLE users ADD COLUMN gender TEXT;

ALTER TABLE weight_predictions ADD COLUMN gender TEXT;
