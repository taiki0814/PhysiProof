-- 初期スキーマの作成

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  current_weight REAL,
  target_weight REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS territories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  area_polygon TEXT,
  fortification_level INTEGER DEFAULT 1,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pushup_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  sensor_log TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- デモデータの登録
INSERT OR IGNORE INTO users (id, login_id, password_hash, name, current_weight, target_weight) VALUES 
('demo-user-1', 'demo1', 'hash1', 'PhysiRunner_Alpha', 70.5, 68.0),
('demo-user-2', 'demo2', 'hash2', 'YogaMaster_Beta', 62.0, 60.0);

INSERT OR IGNORE INTO territories (id, user_id, latitude, longitude, area_polygon, fortification_level) VALUES 
('territory-1', 'demo-user-1', 35.7103, 139.7594, '[[35.710, 139.759], [35.711, 139.759], [35.711, 139.760], [35.710, 139.760]]', 5),
('territory-2', 'demo-user-2', 35.7126, 139.7619, '[[35.712, 139.761], [35.713, 139.761], [35.713, 139.762], [35.712, 139.762]]', 3);

INSERT OR IGNORE INTO used_nonces (nonce) VALUES ('seed-nonce-1'), ('seed-nonce-2');
