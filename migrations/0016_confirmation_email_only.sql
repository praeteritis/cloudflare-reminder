UPDATE tasks
SET notification_channel_ids = '["email"]',
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE task_type = 'confirmation'
  AND notification_channel_ids <> '["email"]';
