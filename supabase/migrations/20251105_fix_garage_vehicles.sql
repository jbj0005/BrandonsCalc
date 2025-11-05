-- ============================================
-- FIX GARAGE VEHICLES TABLE
-- Safely add missing columns if they don't exist
-- ============================================

-- Drop the table if you want a clean start (OPTIONAL - use with caution!)
-- DROP TABLE IF EXISTS garage_vehicles CASCADE;

-- Create table (will skip if exists)
CREATE TABLE IF NOT EXISTS garage_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  vin TEXT,
  mileage INTEGER,
  condition TEXT CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  estimated_value NUMERIC(10, 2),
  payoff_amount NUMERIC(10, 2) DEFAULT 0,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add nickname column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='garage_vehicles' AND column_name='nickname'
    ) THEN
        ALTER TABLE garage_vehicles ADD COLUMN nickname TEXT;
    END IF;

    -- Add times_used column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='garage_vehicles' AND column_name='times_used'
    ) THEN
        ALTER TABLE garage_vehicles ADD COLUMN times_used INTEGER DEFAULT 0;
    END IF;

    -- Add last_used_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='garage_vehicles' AND column_name='last_used_at'
    ) THEN
        ALTER TABLE garage_vehicles ADD COLUMN last_used_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create indexes (IF NOT EXISTS handles duplicates)
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_user_id ON garage_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_created_at ON garage_vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_last_used ON garage_vehicles(last_used_at DESC NULLS LAST);

-- Enable RLS
ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own garage vehicles" ON garage_vehicles;
DROP POLICY IF EXISTS "Users can insert own garage vehicles" ON garage_vehicles;
DROP POLICY IF EXISTS "Users can update own garage vehicles" ON garage_vehicles;
DROP POLICY IF EXISTS "Users can delete own garage vehicles" ON garage_vehicles;

-- Recreate RLS policies
CREATE POLICY "Users can view own garage vehicles"
  ON garage_vehicles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own garage vehicles"
  ON garage_vehicles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own garage vehicles"
  ON garage_vehicles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own garage vehicles"
  ON garage_vehicles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create or replace the trigger
DROP TRIGGER IF EXISTS update_garage_vehicles_updated_at ON garage_vehicles;
CREATE TRIGGER update_garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create or replace helper function
CREATE OR REPLACE FUNCTION increment_garage_vehicle_usage(vehicle_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE garage_vehicles
  SET
    times_used = COALESCE(times_used, 0) + 1,
    last_used_at = NOW()
  WHERE id = vehicle_id;
END;
$$ LANGUAGE plpgsql;
