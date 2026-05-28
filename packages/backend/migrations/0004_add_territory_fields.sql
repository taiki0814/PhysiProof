-- Add area_sqm and time_period to territories table
ALTER TABLE territories ADD COLUMN area_sqm REAL DEFAULT 0;
ALTER TABLE territories ADD COLUMN time_period TEXT DEFAULT 'morning';
