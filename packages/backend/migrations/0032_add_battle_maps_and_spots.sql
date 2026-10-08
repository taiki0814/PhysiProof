-- Existing battles keep their original scoring and shared world; new clients opt in.
ALTER TABLE team_battles ADD COLUMN map_mode TEXT NOT NULL DEFAULT 'shared' CHECK (map_mode IN ('isolated','shared'));
ALTER TABLE team_battles ADD COLUMN map_rules_version INTEGER NOT NULL DEFAULT 0 CHECK (map_rules_version IN (0,1));
ALTER TABLE team_battles ADD COLUMN spots_enabled INTEGER NOT NULL DEFAULT 0 CHECK (spots_enabled IN (0,1));
ALTER TABLE team_battles ADD COLUMN spot_holding_multiplier REAL NOT NULL DEFAULT 1.2 CHECK (spot_holding_multiplier >= 1);
ALTER TABLE team_battles ADD COLUMN spot_capture_points REAL NOT NULL DEFAULT 0 CHECK (spot_capture_points >= 0);
ALTER TABLE team_battles ADD COLUMN map_latitude REAL;
ALTER TABLE team_battles ADD COLUMN map_longitude REAL;
ALTER TABLE team_battles ADD COLUMN map_radius_m INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE team_battles ADD COLUMN map_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE running_sessions ADD COLUMN battle_id TEXT REFERENCES team_battles(id);
-- Retain the legacy coordinate array for older clients, but never discard holes
-- or detached components when shared-world ownership changes.
ALTER TABLE territories ADD COLUMN geometry_json TEXT;

CREATE TABLE battle_spots (
  id TEXT PRIMARY KEY NOT NULL,
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  latitude REAL NOT NULL, longitude REAL NOT NULL,
  UNIQUE(battle_id,latitude,longitude)
);
CREATE INDEX idx_battle_spots_battle ON battle_spots(battle_id);
CREATE TABLE battle_territories (
  id TEXT PRIMARY KEY NOT NULL,
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  geometry_json TEXT NOT NULL, area_sqm REAL NOT NULL CHECK(area_sqm >= 0)
);
CREATE INDEX idx_battle_territories_battle ON battle_territories(battle_id,team_id);
-- Unique revisions serialize polygon read/modify/write across concurrent captures.
CREATE TABLE battle_map_write_guards (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, PRIMARY KEY(battle_id,revision)
);
-- Continuously maintained until starts_at, then immutable: no cron, polling writes,
-- or snapshot taken late after the first run. Includes outsiders in shared maps.
CREATE TABLE battle_shared_baselines (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  territory_id TEXT NOT NULL, team_id TEXT NOT NULL,
  geometry_json TEXT NOT NULL, area_sqm REAL NOT NULL,
  PRIMARY KEY(battle_id,territory_id)
);
CREATE TABLE battle_map_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('territory','capture')),
  territory_id TEXT, team_id TEXT, user_id TEXT,
  geometry_json TEXT, area_sqm REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_battle_map_events_timeline ON battle_map_events(battle_id,recorded_at,id);

CREATE TRIGGER battle_map_world_insert AFTER INSERT ON territories WHEN NEW.team_id IS NOT NULL
BEGIN
  INSERT OR REPLACE INTO battle_shared_baselines
  SELECT id,NEW.id,NEW.team_id,COALESCE(NEW.geometry_json,NEW.area_polygon),NEW.area_sqm FROM team_battles
  WHERE map_rules_version=1 AND map_mode='shared' AND cancelled_at IS NULL
    AND julianday('now')<julianday(starts_at);
  INSERT INTO battle_map_events(battle_id,kind,territory_id,team_id,geometry_json,area_sqm)
  SELECT id,'territory',NEW.id,NEW.team_id,COALESCE(NEW.geometry_json,NEW.area_polygon),NEW.area_sqm FROM team_battles
  WHERE map_rules_version=1 AND map_mode='shared' AND status='accepted' AND cancelled_at IS NULL
    AND julianday('now')>=julianday(starts_at) AND julianday('now')<julianday(ends_at);
END;
CREATE TRIGGER battle_map_world_delete AFTER DELETE ON territories WHEN OLD.team_id IS NOT NULL
BEGIN
  DELETE FROM battle_shared_baselines WHERE territory_id=OLD.id AND battle_id IN (
    SELECT id FROM team_battles WHERE julianday('now')<julianday(starts_at)
  );
  INSERT INTO battle_map_events(battle_id,kind,territory_id,team_id)
  SELECT id,'territory',OLD.id,OLD.team_id FROM team_battles
  WHERE map_rules_version=1 AND map_mode='shared' AND status='accepted' AND cancelled_at IS NULL
    AND julianday('now')>=julianday(starts_at) AND julianday('now')<julianday(ends_at);
END;
CREATE TRIGGER battle_map_world_update AFTER UPDATE OF area_polygon,geometry_json,area_sqm,team_id ON territories
BEGIN
  DELETE FROM battle_shared_baselines WHERE territory_id=OLD.id AND battle_id IN (
    SELECT id FROM team_battles WHERE julianday('now')<julianday(starts_at)
  );
  INSERT OR REPLACE INTO battle_shared_baselines
  SELECT id,NEW.id,NEW.team_id,COALESCE(NEW.geometry_json,NEW.area_polygon),NEW.area_sqm FROM team_battles
  WHERE map_rules_version=1 AND map_mode='shared' AND cancelled_at IS NULL AND NEW.team_id IS NOT NULL
    AND julianday('now')<julianday(starts_at);
  INSERT INTO battle_map_events(battle_id,kind,territory_id,team_id,geometry_json,area_sqm)
  SELECT id,'territory',NEW.id,NEW.team_id,CASE WHEN NEW.team_id IS NULL THEN NULL ELSE COALESCE(NEW.geometry_json,NEW.area_polygon) END,NEW.area_sqm FROM team_battles
  WHERE map_rules_version=1 AND map_mode='shared' AND status='accepted' AND cancelled_at IS NULL
    AND julianday('now')>=julianday(starts_at) AND julianday('now')<julianday(ends_at);
END;
