CREATE TABLE IF NOT EXISTS oauth_pending (
  token TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  expires_at_utc TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_expires
ON oauth_pending(expires_at_utc);
