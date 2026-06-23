-- Create system_settings table to store global configurations
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Set default limit of territories to 10000
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('max_territories', '10000');
