-- Add columns to cache Gemini AI audit results
ALTER TABLE pushup_measurements ADD COLUMN ai_integrity TEXT;
ALTER TABLE pushup_measurements ADD COLUMN ai_reason TEXT;
ALTER TABLE pushup_measurements ADD COLUMN ai_confidence REAL;
