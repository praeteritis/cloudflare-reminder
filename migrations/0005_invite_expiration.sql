ALTER TABLE invite_codes ADD COLUMN expires_at_utc TEXT;

CREATE INDEX IF NOT EXISTS idx_invite_codes_expires
ON invite_codes(expires_at_utc);
