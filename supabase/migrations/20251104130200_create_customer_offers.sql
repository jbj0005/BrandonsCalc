-- Migration: Create Customer Offers Table
-- Date: 2025-11-04
-- Description: Store customer offer submissions with vehicle, dealer, and financing details

-- Create customer_offers table
CREATE TABLE IF NOT EXISTS customer_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,

  -- Offer identification
  offer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),

  -- Vehicle details
  vehicle_year INTEGER,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_trim TEXT,
  vehicle_vin TEXT,
  vehicle_mileage INTEGER,
  vehicle_condition TEXT,

  -- Dealer/Seller details
  dealer_name TEXT,
  dealer_address TEXT,
  dealer_phone TEXT,

  -- Offer pricing
  offer_price DECIMAL(10, 2),
  down_payment DECIMAL(10, 2),

  -- Trade-in details (JSON array of vehicles)
  trade_in_details JSONB,

  -- Financing details
  apr DECIMAL(5, 4),
  term_months INTEGER,
  monthly_payment DECIMAL(10, 2),

  -- Full offer text (for email)
  offer_text TEXT,

  -- Customer contact at time of submission
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,

  -- Timestamps
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_customer_offers_profile ON customer_offers(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_offers_status ON customer_offers(status);
CREATE INDEX IF NOT EXISTS idx_customer_offers_submitted ON customer_offers(submitted_at DESC);

-- Enable Row Level Security
ALTER TABLE customer_offers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own offers
CREATE POLICY "Users can view own offers"
  ON customer_offers
  FOR SELECT
  USING (auth.uid()::text = customer_profile_id::text);

-- Policy: Users can insert their own offers
CREATE POLICY "Users can insert own offers"
  ON customer_offers
  FOR INSERT
  WITH CHECK (auth.uid()::text = customer_profile_id::text);

-- Policy: Users can update their own offers
CREATE POLICY "Users can update own offers"
  ON customer_offers
  FOR UPDATE
  USING (auth.uid()::text = customer_profile_id::text);

-- Policy: Users can delete their own offers
CREATE POLICY "Users can delete own offers"
  ON customer_offers
  FOR DELETE
  USING (auth.uid()::text = customer_profile_id::text);

-- Add updated_at trigger
CREATE TRIGGER update_customer_offers_updated_at
  BEFORE UPDATE ON customer_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
