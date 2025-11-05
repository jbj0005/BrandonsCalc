-- ============================================
-- CREATE GARAGE VEHICLES TABLE
-- For vehicles the user OWNS (trade-ins)
-- Separate from 'vehicles' table which stores SAVED vehicles (interested in buying)
-- ============================================

CREATE TABLE IF NOT EXISTS garage_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Friendly name for UI
  nickname TEXT,

  -- Vehicle Info
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  vin TEXT,
  mileage INTEGER,

  -- Ownership Details
  condition TEXT CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  estimated_value NUMERIC(10, 2),
  payoff_amount NUMERIC(10, 2) DEFAULT 0,

  -- Optional
  photo_url TEXT,
  notes TEXT,

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_user_id ON garage_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_created_at ON garage_vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_last_used ON garage_vehicles(last_used_at DESC NULLS LAST);

-- RLS Policies
ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;

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

-- Trigger for updated_at
CREATE TRIGGER update_garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function to increment usage metrics
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
