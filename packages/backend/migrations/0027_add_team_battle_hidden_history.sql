CREATE TABLE IF NOT EXISTS team_battle_hidden_history (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (battle_id, user_id)
);
