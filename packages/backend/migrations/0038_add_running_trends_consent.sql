-- No retroactive opt-in, no new GPS storage, no changes to run/scoring history.
ALTER TABLE users ADD COLUMN share_running_trends INTEGER NOT NULL DEFAULT 0
  CHECK(share_running_trends IN (0,1));
ALTER TABLE users ADD COLUMN running_trends_consented_at TEXT;
CREATE INDEX idx_running_trends_start ON running_sessions(julianday(started_at),user_id)
  WHERE status='completed';
INSERT OR IGNORE INTO system_settings(key,value) VALUES('show_running_trends_menu','true');
