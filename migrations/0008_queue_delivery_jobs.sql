CREATE TABLE IF NOT EXISTS email_delivery_jobs (
  delivery_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  scheduled_for_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_message_id TEXT,
  last_error_message TEXT,
  queued_at_utc TEXT,
  last_attempted_at_utc TEXT,
  sent_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES reminder_runs(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_jobs_status_created
ON email_delivery_jobs(status, created_at_utc);

CREATE INDEX IF NOT EXISTS idx_email_delivery_jobs_run_status
ON email_delivery_jobs(run_id, status);

ALTER TABLE send_logs ADD COLUMN delivery_key TEXT;

CREATE INDEX IF NOT EXISTS idx_send_logs_delivery_key
ON send_logs(delivery_key);
