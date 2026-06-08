ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN linuxdo_id TEXT;
ALTER TABLE users ADD COLUMN linuxdo_username TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN last_login_at_utc TEXT;
ALTER TABLE users ADD COLUMN banned_at_utc TEXT;
ALTER TABLE users ADD COLUMN banned_reason TEXT;

ALTER TABLE tasks ADD COLUMN deleted_at_utc TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linuxdo_id
ON users(linuxdo_id)
WHERE linuxdo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted
ON tasks(user_id, deleted_at_utc);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
ON audit_logs(created_at_utc);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
ON audit_logs(action, created_at_utc);

INSERT OR IGNORE INTO app_settings (key, value, updated_at_utc)
VALUES
  ('allow_registration', 'true', datetime('now')),
  ('require_invite', 'false', datetime('now')),
  ('invite_code', '', datetime('now')),
  ('announcement_text', '', datetime('now'));
