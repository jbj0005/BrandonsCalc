# Fix garage_vehicles Migration Error

## Problem
You got: `ERROR: 42703: column "last_used_at" does not exist`

This means the `garage_vehicles` table exists from a previous attempt but is missing some columns.

## Solution - Run This Safe Migration

### Step 1: Go to Supabase SQL Editor
https://app.supabase.com/project/txndueuqljeujlccngbj/sql

### Step 2: Run This SQL

Copy and paste this into SQL Editor and click "Run":

```sql
-- ============================================
-- FIX GARAGE VEHICLES TABLE
-- Safely add missing columns
-- ============================================

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
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='garage_vehicles' AND column_name='nickname'
    ) THEN
        ALTER TABLE garage_vehicles ADD COLUMN nickname TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='garage_vehicles' AND column_name='times_used'
    ) THEN
        ALTER TABLE garage_vehicles ADD COLUMN times_used INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='garage_vehicles' AND column_name='last_used_at'
    ) THEN
        ALTER TABLE garage_vehicles ADD COLUMN last_used_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_user_id ON garage_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_created_at ON garage_vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_last_used ON garage_vehicles(last_used_at DESC NULLS LAST);

-- Enable RLS
ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (to avoid duplicates)
DROP POLICY IF EXISTS "Users can view own garage vehicles" ON garage_vehicles;
DROP POLICY IF EXISTS "Users can insert own garage vehicles" ON garage_vehicles;
DROP POLICY IF EXISTS "Users can update own garage vehicles" ON garage_vehicles;
DROP POLICY IF EXISTS "Users can delete own garage vehicles" ON garage_vehicles;

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

-- Trigger
DROP TRIGGER IF EXISTS update_garage_vehicles_updated_at ON garage_vehicles;
CREATE TRIGGER update_garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function
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
```

### Step 3: Verify It Worked

Run this query to check the columns:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'garage_vehicles'
ORDER BY ordinal_position;
```

You should see all these columns:
- id
- user_id
- year
- make
- model
- trim
- vin
- mileage
- condition
- estimated_value
- payoff_amount
- photo_url
- notes
- created_at
- updated_at
- **nickname** ← Should now exist
- **times_used** ← Should now exist
- **last_used_at** ← Should now exist

### Step 4: Test the App

1. Refresh http://localhost:3000/
2. Open browser console
3. Click "My Garage"
4. Should see: `🔍 Querying garage_vehicles table...`
5. No errors!

---

## Alternative: Nuclear Option (Clean Slate)

If you want to start completely fresh and don't mind losing any test data:

```sql
-- ⚠️ WARNING: This deletes all data!
DROP TABLE IF EXISTS garage_vehicles CASCADE;

-- Then run the full migration from above
-- (It will create everything fresh)
```

---

## Why This Happened

The original migration used `CREATE TABLE IF NOT EXISTS`, which skips table creation if it already exists. But then it tried to create indexes on columns (`last_used_at`) that didn't exist in the old schema.

The fix checks for column existence before adding them with `ALTER TABLE`.
