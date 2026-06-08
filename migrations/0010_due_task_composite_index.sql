CREATE INDEX IF NOT EXISTS idx_tasks_status_deleted_due_current_run
ON tasks(status, deleted_at_utc, next_due_at_utc, current_run_id);
