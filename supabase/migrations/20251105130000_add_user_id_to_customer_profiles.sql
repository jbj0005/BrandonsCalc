-- Migration: Add user_id and name fields to customer_profiles
-- Date: 2025-11-05
-- Description: Link customer_profiles to Supabase Auth users and add first/last name fields

-- Add user_id column (references auth.users)
ALTER TABLE customer_profiles
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add first_name and last_name columns
ALTER TABLE customer_profiles
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Create unique index to ensure one profile per auth user
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_user_id
ON customer_profiles(user_id)
WHERE user_id IS NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id_lookup
ON customer_profiles(user_id);

-- Update existing profiles: Extract name parts if full_name exists
UPDATE customer_profiles
SET first_name = SPLIT_PART(full_name, ' ', 1),
    last_name = CASE
      WHEN ARRAY_LENGTH(STRING_TO_ARRAY(full_name, ' '), 1) > 1
      THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
      ELSE ''
    END
WHERE full_name IS NOT NULL
  AND (first_name IS NULL OR first_name = '');
