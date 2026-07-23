ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'confirmation';

-- Existing tasks without email cannot be acknowledged by reply, so migrate
-- them to ordinary scheduled notifications. Email tasks keep legacy behavior.
UPDATE tasks
SET task_type = 'scheduled'
WHERE notification_channel_ids NOT LIKE '%"email"%';

UPDATE reminder_runs
SET status = 'cancelled',
    next_nag_at_utc = NULL,
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'open'
  AND task_id IN (SELECT id FROM tasks WHERE task_type = 'scheduled');

UPDATE tasks
SET status = 'done',
    current_run_id = NULL,
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE task_type = 'scheduled'
  AND recurrence_type = 'none'
  AND current_run_id IS NOT NULL;

UPDATE tasks
SET current_run_id = NULL,
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE task_type = 'scheduled'
  AND recurrence_type = 'interval';

CREATE INDEX IF NOT EXISTS idx_tasks_type_status_due
ON tasks(task_type, status, next_due_at_utc);
