-- Fix preferred_term default from 60 to 72 months
-- This aligns the database default with the UI default

ALTER TABLE customer_profiles
ALTER COLUMN preferred_term SET DEFAULT 72;

-- Update existing NULL or 60 values to 72 for consistency
UPDATE customer_profiles
SET preferred_term = 72
WHERE preferred_term IS NULL OR preferred_term = 60;

COMMENT ON COLUMN customer_profiles.preferred_term IS 'User''s preferred loan term in months (default: 72)';
