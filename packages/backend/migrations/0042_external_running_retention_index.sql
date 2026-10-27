-- Keep the existing five-minute retention sweep proportional to expired rows.
CREATE INDEX idx_external_running_retention ON external_running_records(started_at_ms);
