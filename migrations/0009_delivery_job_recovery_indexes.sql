CREATE INDEX IF NOT EXISTS idx_email_delivery_jobs_status_scheduled
ON email_delivery_jobs(status, scheduled_for_utc, created_at_utc);

CREATE INDEX IF NOT EXISTS idx_email_delivery_jobs_status_updated
ON email_delivery_jobs(status, updated_at_utc);
