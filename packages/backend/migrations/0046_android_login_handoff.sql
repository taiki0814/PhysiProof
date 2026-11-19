CREATE TABLE android_login_handoffs (
  id TEXT PRIMARY KEY,
  proof_hash TEXT NOT NULL,
  confirmation_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  approval_session_hash TEXT,
  approval_password_fingerprint TEXT,
  consumed_at TEXT
);

CREATE INDEX idx_android_login_handoffs_expiry ON android_login_handoffs(expires_at);
