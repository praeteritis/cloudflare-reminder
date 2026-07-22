CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled_name
ON notification_channels(enabled, name);

ALTER TABLE tasks ADD COLUMN notification_channel_ids TEXT NOT NULL DEFAULT '["email"]';
ALTER TABLE email_delivery_jobs ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'email';

CREATE INDEX IF NOT EXISTS idx_email_delivery_jobs_channel_status
ON email_delivery_jobs(channel_id, status, scheduled_for_utc);

CREATE TABLE IF NOT EXISTS notification_delivery_cycles (
  cycle_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  scheduled_for_utc TEXT NOT NULL,
  completed_at_utc TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES reminder_runs(id)
);
