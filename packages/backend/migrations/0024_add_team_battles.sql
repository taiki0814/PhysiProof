-- 対戦はチームの通常成績と分離し、対戦期間内のライブ記録だけを集計する。
CREATE TABLE IF NOT EXISTS team_battles (
  id TEXT PRIMARY KEY,
  team_a_id TEXT NOT NULL REFERENCES teams(id),
  team_b_id TEXT NOT NULL REFERENCES teams(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  CHECK (team_a_id <> team_b_id),
  CHECK (julianday(ends_at) > julianday(starts_at))
);

CREATE INDEX IF NOT EXISTS idx_team_battles_team_a ON team_battles(team_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_battles_team_b ON team_battles(team_b_id, created_at DESC);

-- 承認時点のロスターを固定し、対戦中の移籍による二重参加を防ぐ。
CREATE TABLE IF NOT EXISTS team_battle_members (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  PRIMARY KEY (battle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_battle_members_user ON team_battle_members(user_id, battle_id);

-- source_nonce はオンライン記録の再送・二重加算を防ぐ一意キー。
CREATE TABLE IF NOT EXISTS team_battle_contributions (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  source_nonce TEXT NOT NULL REFERENCES used_nonces(nonce),
  user_id TEXT NOT NULL REFERENCES users(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  points INTEGER NOT NULL CHECK (points >= 0),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (battle_id, source_nonce)
);

CREATE INDEX IF NOT EXISTS idx_team_battle_contributions_score
  ON team_battle_contributions(battle_id, team_id);
