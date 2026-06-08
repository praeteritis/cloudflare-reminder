CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT,
  created_at_utc TEXT NOT NULL,
  used_by TEXT,
  used_at_utc TEXT,
  FOREIGN KEY (used_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_used
ON invite_codes(used_at_utc);
