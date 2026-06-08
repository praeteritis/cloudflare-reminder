CREATE INDEX IF NOT EXISTS idx_send_logs_created
ON send_logs(created_at_utc);

CREATE INDEX IF NOT EXISTS idx_send_logs_success_created
ON send_logs(success, created_at_utc);

CREATE INDEX IF NOT EXISTS idx_send_logs_type_created
ON send_logs(type, created_at_utc);

CREATE INDEX IF NOT EXISTS idx_send_logs_task_created
ON send_logs(task_id, created_at_utc);
