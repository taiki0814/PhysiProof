-- Additive: existing accounts and normal world-map ownership are preserved.
ALTER TABLE users ADD COLUMN territory_map_visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (territory_map_visibility IN ('private','friends'));
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE personal_territory_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_key TEXT NOT NULL UNIQUE,
  area_polygon TEXT NOT NULL,
  geometry_json TEXT,
  source TEXT NOT NULL CHECK(source IN ('legacy_snapshot','capture'))
);
CREATE INDEX idx_personal_territory_history_owner ON personal_territory_history(user_id,id);
INSERT INTO personal_territory_history(user_id,claim_key,area_polygon,geometry_json,source)
  SELECT user_id,'legacy:'||id,area_polygon,geometry_json,'legacy_snapshot'
  FROM territories WHERE team_id IS NULL;
-- Device caches validate this revision; devices never determine ownership.
CREATE TABLE territory_map_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO territory_map_revision VALUES(1,1);
CREATE TRIGGER territory_map_insert AFTER INSERT ON territories BEGIN
  UPDATE territory_map_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER territory_map_update AFTER UPDATE ON territories BEGIN
  UPDATE territory_map_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER territory_map_delete AFTER DELETE ON territories BEGIN
  UPDATE territory_map_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER territory_map_owner_update AFTER UPDATE OF name,age ON users BEGIN
  UPDATE territory_map_revision SET revision=revision+1 WHERE id=1;
END;
