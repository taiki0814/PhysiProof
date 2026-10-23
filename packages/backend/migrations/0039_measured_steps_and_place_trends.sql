ALTER TABLE users ADD COLUMN share_place_trends INTEGER NOT NULL DEFAULT 0 CHECK(share_place_trends IN(0,1));
ALTER TABLE users ADD COLUMN place_trends_consented_at TEXT;
ALTER TABLE users ADD COLUMN place_trends_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE running_sessions ADD COLUMN place_consent_epoch INTEGER;
CREATE TRIGGER snapshot_place_consent AFTER INSERT ON running_sessions BEGIN
  UPDATE running_sessions SET place_consent_epoch=(SELECT CASE WHEN share_place_trends=1 THEN place_trends_epoch ELSE NULL END FROM users WHERE id=NEW.user_id) WHERE id=NEW.id;
END;
CREATE TABLE running_motion (
  session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT -1,
  recorded_at_ms INTEGER NOT NULL DEFAULT 0, received_at_ms INTEGER NOT NULL DEFAULT 0,
  steps INTEGER, source TEXT NOT NULL DEFAULT 'unavailable',
  last_fix_json TEXT,
  measured_steps INTEGER NOT NULL DEFAULT 0 CHECK(measured_steps>=0),
  eligible_steps INTEGER NOT NULL DEFAULT 0 CHECK(eligible_steps>=0 AND eligible_steps<=measured_steps),
  state TEXT NOT NULL DEFAULT 'baseline', write_token TEXT NOT NULL DEFAULT ''
);
CREATE TABLE running_places (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  south REAL NOT NULL, north REAL NOT NULL, west REAL NOT NULL, east REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), revision INTEGER NOT NULL DEFAULT 1,
  CHECK(north>south AND east>west)
);
CREATE TABLE running_place_passages (
  session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES running_places(id),
  bucket_at TEXT NOT NULL,
  PRIMARY KEY(session_id,place_id,bucket_at)
);
CREATE INDEX idx_place_passages_period ON running_place_passages(place_id,bucket_at,user_id);
CREATE INDEX idx_place_passages_user ON running_place_passages(user_id);
CREATE TRIGGER clear_motion_on_finish AFTER UPDATE OF status ON running_sessions WHEN NEW.status<>'active'
BEGIN
  UPDATE running_motion SET last_fix_json=NULL,steps=NULL WHERE session_id=NEW.id;
  DELETE FROM running_place_passages WHERE session_id=NEW.id AND NEW.status<>'completed';
END;
-- A coarse surroundings area, NOT the official course boundary or a suggested route.
-- Reference: National Gardens Association https://fng.or.jp/koukyo/access/map/
INSERT INTO running_places(id,name,description,south,north,west,east,active) VALUES
('imperial-palace-surroundings','皇居外周・周辺エリア','皇居周辺の粗い集計エリアです。公式コースの境界ではなく、周辺道路の利用も含みます。通行可能範囲や混雑・安全性を保証する表示ではありません。',35.672,35.695,139.741,139.765,1);
