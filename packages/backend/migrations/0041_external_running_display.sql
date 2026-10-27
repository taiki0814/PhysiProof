-- Display-only health data. Intentionally unrelated to running_sessions and game tables.
CREATE TABLE external_running_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  operation_id TEXT NOT NULL,
  synced_at_ms INTEGER,
  window_start_ms INTEGER,
  window_end_ms INTEGER
);
CREATE TABLE external_running_records (
  user_id TEXT NOT NULL REFERENCES external_running_links(user_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER NOT NULL CHECK(ended_at_ms>started_at_ms),
  distance_m REAL NOT NULL CHECK(distance_m>0 AND distance_m<=300000),
  PRIMARY KEY(user_id,source_id,record_id)
);
