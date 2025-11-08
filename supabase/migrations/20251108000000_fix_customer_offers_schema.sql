-- Migration to match customer_offers table with app requirements
-- This adds any missing columns that the app tries to insert

-- First, let's see what we have and add missing columns
ALTER TABLE customer_offers
  -- Add missing columns if they don't exist
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS vehicle_year INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_make TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_trim TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS down_payment NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS apr NUMERIC(6,5),
  ADD COLUMN IF NOT EXISTS term_months INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_payment NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trade_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trade_payoff NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dealer_fees NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS customer_addons NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS dealer_name TEXT,
  ADD COLUMN IF NOT EXISTS dealer_phone TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add default values for existing rows
UPDATE customer_offers
SET
  vehicle_year = COALESCE(vehicle_year, 0),
  vehicle_make = COALESCE(vehicle_make, 'Unknown'),
  vehicle_model = COALESCE(vehicle_model, 'Unknown'),
  vehicle_price = COALESCE(vehicle_price, 0),
  down_payment = COALESCE(down_payment, 0),
  apr = COALESCE(apr, 0),
  term_months = COALESCE(term_months, 0),
  monthly_payment = COALESCE(monthly_payment, 0),
  trade_value = COALESCE(trade_value, 0),
  trade_payoff = COALESCE(trade_payoff, 0),
  dealer_fees = COALESCE(dealer_fees, 0),
  customer_addons = COALESCE(customer_addons, 0),
  status = COALESCE(status, 'active')
WHERE id IS NOT NULL;

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_customer_offers_user_id ON customer_offers(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_customer_offers_status ON customer_offers(status);

-- Add RLS policies
ALTER TABLE customer_offers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own offers" ON customer_offers;
DROP POLICY IF EXISTS "Users can insert own offers" ON customer_offers;
DROP POLICY IF EXISTS "Users can update own offers" ON customer_offers;
DROP POLICY IF EXISTS "Users can delete own offers" ON customer_offers;

-- Policy: Users can view their own offers
CREATE POLICY "Users can view own offers"
  ON customer_offers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own offers
CREATE POLICY "Users can insert own offers"
  ON customer_offers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own offers
CREATE POLICY "Users can update own offers"
  ON customer_offers
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own offers
CREATE POLICY "Users can delete own offers"
  ON customer_offers
  FOR DELETE
  USING (auth.uid() = user_id);
