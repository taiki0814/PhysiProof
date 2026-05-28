-- Add avatar_id to users table
ALTER TABLE users ADD COLUMN avatar_id TEXT DEFAULT 'default';
