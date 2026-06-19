-- Add role column to users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

-- Seed the administrator account
INSERT OR IGNORE INTO users (id, login_id, password_hash, name, role, current_weight, target_weight)
VALUES ('admin-uuid-1', 'admin', 'admin123', '管理者', 'admin', 70.0, 70.0);
