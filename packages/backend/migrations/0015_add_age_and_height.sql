-- usersテーブルおよびweight_predictionsテーブルに、年齢と身長を追加

ALTER TABLE users ADD COLUMN age INTEGER;
ALTER TABLE users ADD COLUMN height REAL;

ALTER TABLE weight_predictions ADD COLUMN age INTEGER;
ALTER TABLE weight_predictions ADD COLUMN height REAL;
