-- Each battle contains one host and one or more separately responding opponent teams.
CREATE TABLE IF NOT EXISTS team_battle_participants (
  battle_id TEXT NOT NULL REFERENCES team_battles(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  role TEXT NOT NULL CHECK (role IN ('host', 'opponent')),
  invitation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invitation_status IN ('pending', 'accepted', 'rejected')),
  invited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  PRIMARY KEY (battle_id, team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_battle_one_host
  ON team_battle_participants(battle_id)
  WHERE role = 'host';
CREATE INDEX IF NOT EXISTS idx_team_battle_participants_team
  ON team_battle_participants(team_id, battle_id);

-- Preserve existing two-team battles in the participant-based model.
INSERT OR IGNORE INTO team_battle_participants
  (battle_id, team_id, role, invitation_status, invited_at, responded_at)
SELECT id, team_a_id, 'host', 'accepted', created_at, accepted_at
FROM team_battles;

INSERT OR IGNORE INTO team_battle_participants
  (battle_id, team_id, role, invitation_status, invited_at, responded_at)
SELECT id, team_b_id, 'opponent', status, created_at,
  CASE WHEN status IN ('accepted', 'rejected') THEN accepted_at ELSE NULL END
FROM team_battles;
