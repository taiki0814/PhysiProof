-- Existing user/team/outfit JSON and their revisions are untouched.
-- Separate, expiring proof of a password-authenticated administrator for R2 writes.
CREATE TABLE uniform_admin_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX uniform_admin_session_user ON uniform_admin_sessions(user_id);
CREATE TABLE uniform_assets (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('model','pattern','emblem')),
  name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('draft','published','hidden')),
  sort_order INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX uniform_assets_catalog ON uniform_assets(kind,status,sort_order,name,id);
CREATE TABLE uniform_asset_versions (
  asset_id TEXT NOT NULL REFERENCES uniform_assets(id), revision INTEGER NOT NULL,
  metadata_json TEXT NOT NULL, image_key TEXT, thumbnail_key TEXT, source_key TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(asset_id,revision)
);
CREATE TRIGGER uniform_asset_version_no_update BEFORE UPDATE ON uniform_asset_versions
BEGIN SELECT RAISE(ABORT,'Uniform asset versions are immutable'); END;
CREATE TRIGGER uniform_asset_version_no_delete BEFORE DELETE ON uniform_asset_versions
BEGIN SELECT RAISE(ABORT,'Used uniform asset versions must be retained'); END;
