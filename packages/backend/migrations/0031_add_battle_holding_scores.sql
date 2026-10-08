-- Keep all existing invitations/results on their original rule. New invitations opt in to v2.
ALTER TABLE team_battles ADD COLUMN scoring_version INTEGER NOT NULL DEFAULT 1 CHECK (scoring_version IN (1, 2));
ALTER TABLE team_battles ADD COLUMN holding_points_per_1000_sqm_full_period REAL NOT NULL DEFAULT 1 CHECK (holding_points_per_1000_sqm_full_period > 0);

-- Immutable ownership deltas inside accepted v2 battle windows. No backfill of past territory.
-- Triggers cover captures, carving, same-team merges, administrative deletes and FK cascades.
CREATE TABLE team_battle_area_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  territory_id TEXT NOT NULL,
  area_delta_sqm REAL NOT NULL CHECK (area_delta_sqm <> 0),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_team_battle_area_events_timeline
  ON team_battle_area_events(battle_id, team_id, recorded_at, id);

-- A completed live run can finalize territory only once; claim and territory writes are one batch.
CREATE TABLE running_territory_claims (
  running_session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER battle_area_insert AFTER INSERT ON territories
WHEN NEW.team_id IS NOT NULL AND NEW.area_sqm <> 0
BEGIN
  INSERT INTO team_battle_area_events (battle_id, team_id, territory_id, area_delta_sqm)
  SELECT b.id, p.team_id, NEW.id, NEW.area_sqm
  FROM team_battles b JOIN team_battle_participants p ON p.battle_id = b.id
  WHERE b.scoring_version = 2 AND b.status = 'accepted' AND b.cancelled_at IS NULL
    AND p.invitation_status = 'accepted' AND p.team_id = NEW.team_id
    AND julianday(CURRENT_TIMESTAMP) >= julianday(b.starts_at)
    AND julianday(CURRENT_TIMESTAMP) < julianday(b.ends_at);
END;

CREATE TRIGGER battle_area_delete AFTER DELETE ON territories
WHEN OLD.team_id IS NOT NULL AND OLD.area_sqm <> 0
BEGIN
  INSERT INTO team_battle_area_events (battle_id, team_id, territory_id, area_delta_sqm)
  SELECT b.id, p.team_id, OLD.id, -OLD.area_sqm
  FROM team_battles b JOIN team_battle_participants p ON p.battle_id = b.id
  WHERE b.scoring_version = 2 AND b.status = 'accepted' AND b.cancelled_at IS NULL
    AND p.invitation_status = 'accepted' AND p.team_id = OLD.team_id
    AND julianday(CURRENT_TIMESTAMP) >= julianday(b.starts_at)
    AND julianday(CURRENT_TIMESTAMP) < julianday(b.ends_at);
END;

CREATE TRIGGER battle_area_update AFTER UPDATE OF area_sqm, team_id ON territories
BEGIN
  INSERT INTO team_battle_area_events (battle_id, team_id, territory_id, area_delta_sqm)
  SELECT b.id, p.team_id, OLD.id,
    CASE WHEN OLD.team_id IS NEW.team_id THEN NEW.area_sqm - OLD.area_sqm ELSE -OLD.area_sqm END
  FROM team_battles b JOIN team_battle_participants p ON p.battle_id = b.id
  WHERE b.scoring_version = 2 AND b.status = 'accepted' AND b.cancelled_at IS NULL
    AND OLD.team_id IS NOT NULL AND p.invitation_status = 'accepted' AND p.team_id = OLD.team_id
    AND (CASE WHEN OLD.team_id IS NEW.team_id THEN NEW.area_sqm - OLD.area_sqm ELSE -OLD.area_sqm END) <> 0
    AND julianday(CURRENT_TIMESTAMP) >= julianday(b.starts_at)
    AND julianday(CURRENT_TIMESTAMP) < julianday(b.ends_at);

  INSERT INTO team_battle_area_events (battle_id, team_id, territory_id, area_delta_sqm)
  SELECT b.id, p.team_id, NEW.id, NEW.area_sqm
  FROM team_battles b JOIN team_battle_participants p ON p.battle_id = b.id
  WHERE b.scoring_version = 2 AND b.status = 'accepted' AND b.cancelled_at IS NULL
    AND NEW.team_id IS NOT NULL AND NEW.team_id IS NOT OLD.team_id AND NEW.area_sqm <> 0
    AND p.invitation_status = 'accepted' AND p.team_id = NEW.team_id
    AND julianday(CURRENT_TIMESTAMP) >= julianday(b.starts_at)
    AND julianday(CURRENT_TIMESTAMP) < julianday(b.ends_at);
END;

INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('battle_holding_points_per_1000_sqm_full_period', '1');
