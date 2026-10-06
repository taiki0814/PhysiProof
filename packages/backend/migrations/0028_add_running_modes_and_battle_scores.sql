-- Existing territory distances are aggregate estimates, not individual run records.
ALTER TABLE users ADD COLUMN legacy_running_distance_m REAL NOT NULL DEFAULT 0;
UPDATE users
SET legacy_running_distance_m = COALESCE((
  SELECT SUM(distance_m) FROM territories WHERE territories.user_id = users.id
), 0);

-- Existing territories are retained as personal legacy territory; team attribution
-- begins only with new team-mode runs.
UPDATE territories SET team_id = NULL;

CREATE TABLE IF NOT EXISTS running_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_mode TEXT NOT NULL CHECK (activity_mode IN ('personal', 'team')),
  team_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  distance_m REAL NOT NULL DEFAULT 0 CHECK (distance_m >= 0),
  duration_sec REAL NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
  territory_delta_sqm REAL NOT NULL DEFAULT 0,
  CHECK (
    (activity_mode = 'personal' AND team_id IS NULL)
    OR (activity_mode = 'team' AND team_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_running_sessions_one_active_per_user
  ON running_sessions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_running_sessions_user_mode
  ON running_sessions(user_id, activity_mode, completed_at);
CREATE INDEX IF NOT EXISTS idx_running_sessions_team
  ON running_sessions(team_id, completed_at) WHERE activity_mode = 'team';

ALTER TABLE team_battles ADD COLUMN distance_points_per_km REAL NOT NULL DEFAULT 1.0;
ALTER TABLE team_battles ADD COLUMN territory_points_per_1000_sqm REAL NOT NULL DEFAULT 1.0;

CREATE TABLE IF NOT EXISTS team_battle_run_scores (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  running_session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  distance_m REAL NOT NULL DEFAULT 0 CHECK (distance_m >= 0),
  territory_delta_sqm REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (battle_id, running_session_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_battle_run_scores_team
  ON team_battle_run_scores(battle_id, team_id);

-- Territory changes are stored as signed team-area deltas at online capture time.
-- Summing only events inside a battle window excludes all pre-existing territory.
CREATE INDEX IF NOT EXISTS idx_team_battles_active_window
  ON team_battles(status, starts_at, ends_at);

INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('battle_distance_points_per_km', '1'),
       ('battle_territory_points_per_1000_sqm', '1');
