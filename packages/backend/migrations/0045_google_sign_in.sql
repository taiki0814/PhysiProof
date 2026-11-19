CREATE TABLE google_auth_challenges (
  id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('login', 'link')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  operation_id TEXT,
  CHECK ((purpose='login' AND user_id IS NULL) OR (purpose='link' AND user_id IS NOT NULL))
);
CREATE INDEX idx_google_auth_challenge_expiry ON google_auth_challenges(expires_at);

CREATE TABLE auth_identities (
  provider TEXT NOT NULL CHECK(provider='google'),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider, subject),
  UNIQUE(provider, user_id)
);
