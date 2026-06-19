-- Add speed metrics and AI integrity check columns to territories table
ALTER TABLE territories ADD COLUMN distance_m REAL DEFAULT 0;
ALTER TABLE territories ADD COLUMN duration_sec REAL DEFAULT 0;
ALTER TABLE territories ADD COLUMN avg_speed_kmh REAL DEFAULT 0;
ALTER TABLE territories ADD COLUMN ai_integrity TEXT;
ALTER TABLE territories ADD COLUMN ai_reason TEXT;
ALTER TABLE territories ADD COLUMN ai_confidence REAL;
