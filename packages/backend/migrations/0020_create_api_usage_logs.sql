-- Migration: Create api_usage_logs table
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id TEXT PRIMARY KEY,
    api_type TEXT NOT NULL, -- 'map' or 'general'
    endpoint TEXT NOT NULL,  -- 'predict', 'meal_analysis', 'exercise_calories', 'chat', 'sensor_audit', 'territory_audit'
    status TEXT NOT NULL, -- 'success' or 'error'
    error_message TEXT,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
