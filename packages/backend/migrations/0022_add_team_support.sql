-- チームテーブルの作成
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  owner_id TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- users テーブルにチームIDカラムを追加
ALTER TABLE users ADD COLUMN team_id TEXT REFERENCES teams(id);

-- territories テーブルにチームIDカラムを追加
ALTER TABLE territories ADD COLUMN team_id TEXT REFERENCES teams(id);
