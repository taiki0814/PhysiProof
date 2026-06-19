-- Create user_missions table for daily quests
CREATE TABLE IF NOT EXISTS user_missions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mission_date TEXT NOT NULL, -- YYYY-MM-DD
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'exercise' | 'meal'
  target_count INTEGER NOT NULL,
  current_count INTEGER DEFAULT 0,
  is_completed INTEGER DEFAULT 0,
  claimed INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, mission_date)
);
