CREATE TABLE map_chest_weeks (
  prefecture_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  retry_at INTEGER NOT NULL DEFAULT 0,
  candidates_json TEXT,
  candidates_fetched_at INTEGER,
  PRIMARY KEY (prefecture_code, expires_at)
);

CREATE TABLE map_chests (
  id TEXT PRIMARY KEY,
  prefecture_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  FOREIGN KEY (prefecture_code, expires_at) REFERENCES map_chest_weeks (prefecture_code, expires_at)
);
CREATE INDEX idx_map_chests_week ON map_chests (prefecture_code, expires_at);

ALTER TABLE running_sessions ADD COLUMN chest_id TEXT REFERENCES map_chests(id);

CREATE TABLE running_chest_points (
  session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  captured_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, sequence)
);

CREATE TABLE map_chest_claims (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chest_id TEXT NOT NULL REFERENCES map_chests(id),
  session_id TEXT NOT NULL UNIQUE REFERENCES running_sessions(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('small', 'medium', 'large')),
  reward_id TEXT,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, chest_id),
  UNIQUE (user_id, reward_id)
);

CREATE TRIGGER clear_finished_chest_trace
AFTER UPDATE OF status ON running_sessions
WHEN OLD.chest_id IS NOT NULL AND OLD.status = 'active' AND NEW.status <> 'active'
BEGIN
  DELETE FROM running_chest_points WHERE session_id = NEW.id;
END;
