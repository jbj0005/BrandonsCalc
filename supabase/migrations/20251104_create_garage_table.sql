-- Migration: Create My Garage Table
-- Date: 2025-11-04
-- Description: Store user's vehicles for quick trade-in selection

-- ============================================================================
-- Table: garage_vehicles
-- Stores user's vehicles for trade-in auto-population
-- ============================================================================
CREATE TABLE IF NOT EXISTS garage_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Reference to customer profile
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,

  -- Vehicle Information
  nickname TEXT, -- User-friendly name like "My Civic" or "2020 Honda"
  year INTEGER,
  make TEXT,
  model TEXT,
  trim TEXT,
  mileage INTEGER,
  vin TEXT,
  condition TEXT, -- 'excellent', 'good', 'fair', 'poor'

  -- Financial Information
  estimated_value NUMERIC(10, 2), -- User's estimate of trade-in value
  payoff_amount NUMERIC(10, 2), -- Outstanding loan balance

  -- Notes
  notes TEXT, -- Additional notes about the vehicle

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_garage_customer_profile ON garage_vehicles(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_garage_last_used ON garage_vehicles(last_used_at DESC);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_garage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_garage_updated_at();

-- RLS Policies (permissive for MVP - restrict later)
ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on garage_vehicles for now"
  ON garage_vehicles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Helper function to increment usage count
CREATE OR REPLACE FUNCTION increment_garage_vehicle_usage(vehicle_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE garage_vehicles
  SET
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = vehicle_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE garage_vehicles IS 'Stores user vehicles for quick trade-in selection';
COMMENT ON COLUMN garage_vehicles.nickname IS 'User-friendly name for the vehicle';
COMMENT ON COLUMN garage_vehicles.estimated_value IS 'User estimated trade-in value';
COMMENT ON COLUMN garage_vehicles.payoff_amount IS 'Outstanding loan balance';
COMMENT ON COLUMN garage_vehicles.times_used IS 'Number of times vehicle was used in trade-in';
