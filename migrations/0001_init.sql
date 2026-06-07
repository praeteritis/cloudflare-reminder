CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  first_due_at_utc TEXT NOT NULL,
  next_due_at_utc TEXT NOT NULL,
  recurrence_type TEXT NOT NULL DEFAULT 'none',
  recurrence_interval_minutes INTEGER,
  recurrence_anchor TEXT NOT NULL DEFAULT 'scheduled_time',
  nag_interval_minutes INTEGER NOT NULL DEFAULT 1440,
  current_run_id TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE reminder_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  due_at_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  sent_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at_utc TEXT,
  next_nag_at_utc TEXT,
  completed_at_utc TEXT,
  completed_by TEXT,
  completion_email_sent_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  task_id TEXT,
  type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  success INTEGER NOT NULL,
  error_message TEXT,
  created_at_utc TEXT NOT NULL
);

CREATE INDEX idx_tasks_due
ON tasks(status, next_due_at_utc);

CREATE INDEX idx_runs_task_status
ON reminder_runs(task_id, status);

CREATE INDEX idx_runs_next_nag
ON reminder_runs(status, next_nag_at_utc);
