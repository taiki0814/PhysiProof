-- Keep existing radius-based invitations and every saved spot unchanged.
ALTER TABLE team_battles ADD COLUMN spot_scope TEXT NOT NULL DEFAULT 'radius'
  CHECK (spot_scope IN ('radius', 'prefecture'));
ALTER TABLE team_battles ADD COLUMN prefecture_code TEXT;
ALTER TABLE team_battles ADD COLUMN prefecture_name TEXT;
ALTER TABLE team_battles ADD COLUMN spot_bounds_json TEXT;

-- Reusable public-path candidates, not user locations or battle layouts.
-- The lease/cooldown prevents separate Worker instances querying the same
-- prefecture concurrently. Failed retrieval never replaces the last success.
CREATE TABLE battle_prefecture_candidates (
  prefecture_code TEXT PRIMARY KEY,
  candidates_json TEXT,
  fetched_at_ms INTEGER NOT NULL DEFAULT 0,
  lease_until_ms INTEGER NOT NULL DEFAULT 0,
  retry_after_ms INTEGER NOT NULL DEFAULT 0
);
