-- Migration: Create Offer Management Tables
-- Date: 2025-11-04
-- Description: Tables for customer profiles, salesperson contacts, saved offers, and offer submissions

-- ============================================================================
-- Table 1: customer_profiles
-- Stores user contact information for auto-population across the app
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Contact Info
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,

  -- Address (Google Places integration)
  street_address TEXT,
  city TEXT,
  state TEXT,
  state_code TEXT, -- e.g., "FL", "CA"
  zip_code TEXT,
  county TEXT, -- County ID from tax tables
  county_name TEXT,
  google_place_id TEXT, -- For Google Places API reference

  -- Preferences (auto-populate defaults)
  preferred_lender_id TEXT, -- Last used lender
  preferred_term INTEGER DEFAULT 60, -- Default term preference in months
  credit_score_range TEXT, -- Last used credit score range

  -- Meta
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_customer_email ON customer_profiles(email);
CREATE INDEX IF NOT EXISTS idx_customer_phone ON customer_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_customer_last_used ON customer_profiles(last_used_at DESC);

-- ============================================================================
-- Table 2: salesperson_contacts
-- Stores salesperson/dealer information for quick reuse and auto-complete
-- ============================================================================
CREATE TABLE IF NOT EXISTS salesperson_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Salesperson Info
  full_name TEXT NOT NULL,
  dealership_name TEXT,
  phone TEXT,
  email TEXT,

  -- Usage tracking
  times_used INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate entries
  CONSTRAINT unique_salesperson UNIQUE(full_name, dealership_name)
);

-- Indexes for autocomplete and sorting
CREATE INDEX IF NOT EXISTS idx_salesperson_name ON salesperson_contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_dealership_name ON salesperson_contacts(dealership_name);
CREATE INDEX IF NOT EXISTS idx_salesperson_usage ON salesperson_contacts(times_used DESC, last_used_at DESC);

-- ============================================================================
-- Table 3: saved_offers
-- Stores complete offer state for recall and comparison
-- ============================================================================
CREATE TABLE IF NOT EXISTS saved_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- References
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,
  salesperson_id UUID REFERENCES salesperson_contacts(id) ON DELETE SET NULL,

  -- Offer Metadata
  offer_name TEXT, -- e.g., "2024 Camry - ABC Motors"
  status TEXT DEFAULT 'draft', -- draft, submitted, accepted, rejected, expired

  -- Vehicle Data
  vehicle_year INTEGER,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_trim TEXT,
  vehicle_vin TEXT,
  vehicle_condition TEXT, -- 'new' or 'used'
  vehicle_mileage INTEGER,

  -- Pricing
  sale_price DECIMAL(10,2),
  down_payment DECIMAL(10,2),

  -- Trade-in
  has_tradein BOOLEAN DEFAULT FALSE,
  tradein_year INTEGER,
  tradein_make TEXT,
  tradein_model TEXT,
  tradein_vin TEXT,
  tradein_allowance DECIMAL(10,2),
  tradein_payoff DECIMAL(10,2),
  tradein_net DECIMAL(10,2), -- Calculated: allowance - payoff

  -- Financing
  term INTEGER, -- Loan term in months
  apr DECIMAL(5,4), -- e.g., 0.0549 for 5.49%
  monthly_payment DECIMAL(10,2),
  finance_charge DECIMAL(10,2), -- Total interest paid over life of loan
  amount_financed DECIMAL(10,2),
  total_of_payments DECIMAL(10,2),
  lender_id TEXT,
  lender_name TEXT,

  -- Fees (stored as JSONB for flexibility)
  fees JSONB, -- { dealer_fees, customer_addons, govt_fees, state_tax_rate, county_tax_rate, etc. }

  -- Location
  state_code TEXT,
  county_name TEXT,

  -- Complete State Snapshot
  -- Full serialized wizardData object for perfect restoration
  wizard_state JSONB NOT NULL,

  -- Notes
  customer_notes TEXT,

  -- Meta
  last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for queries and performance
CREATE INDEX IF NOT EXISTS idx_saved_offers_customer ON saved_offers(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_saved_offers_status ON saved_offers(status);
CREATE INDEX IF NOT EXISTS idx_saved_offers_created ON saved_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_offers_updated ON saved_offers(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_offers_vehicle ON saved_offers(vehicle_year, vehicle_make, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_saved_offers_last_viewed ON saved_offers(last_viewed_at DESC);

-- ============================================================================
-- Table 4: offer_submissions
-- Track when offers are submitted to dealers
-- ============================================================================
CREATE TABLE IF NOT EXISTS offer_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- References
  saved_offer_id UUID REFERENCES saved_offers(id) ON DELETE CASCADE,
  salesperson_id UUID REFERENCES salesperson_contacts(id) ON DELETE SET NULL,

  -- Submission Details
  submission_method TEXT, -- 'share', 'email', 'sms', 'copy'
  formatted_text TEXT, -- The actual formatted text that was sent
  recipient_contact TEXT, -- Phone or email where it was sent

  -- Optional: track dealer responses
  dealer_response TEXT,
  dealer_response_at TIMESTAMP WITH TIME ZONE,

  -- Meta
  notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offer_submissions_offer ON offer_submissions(saved_offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_submissions_date ON offer_submissions(submitted_at DESC);

-- ============================================================================
-- Database Functions
-- ============================================================================

-- Function to increment salesperson usage count
CREATE OR REPLACE FUNCTION increment_salesperson_usage(salesperson_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE salesperson_contacts
  SET
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = salesperson_id;
END;
$$;

-- Function to update customer profile last_used_at
CREATE OR REPLACE FUNCTION update_customer_last_used(profile_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE customer_profiles
  SET last_used_at = NOW()
  WHERE id = profile_id;
END;
$$;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_salesperson_contacts_updated_at
  BEFORE UPDATE ON salesperson_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_offers_updated_at
  BEFORE UPDATE ON saved_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- For now, we'll allow all operations without authentication
-- Later, this can be restricted based on user authentication
-- ============================================================================

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE salesperson_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_submissions ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no authentication required for now)
CREATE POLICY "Allow all on customer_profiles"
  ON customer_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all on salesperson_contacts"
  ON salesperson_contacts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all on saved_offers"
  ON saved_offers
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all on offer_submissions"
  ON offer_submissions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE customer_profiles IS 'Stores customer contact information for auto-population across the app';
COMMENT ON TABLE salesperson_contacts IS 'Stores salesperson/dealer contacts with usage tracking for auto-complete';
COMMENT ON TABLE saved_offers IS 'Stores complete offer state for recall, comparison, and submission';
COMMENT ON TABLE offer_submissions IS 'Tracks when offers are submitted to dealers with submission details';

COMMENT ON COLUMN customer_profiles.google_place_id IS 'Google Places API reference for address validation';
COMMENT ON COLUMN saved_offers.wizard_state IS 'Complete serialized wizardData object for perfect restoration';
COMMENT ON COLUMN saved_offers.fees IS 'Flexible JSONB storage for all fee types';
COMMENT ON COLUMN offer_submissions.formatted_text IS 'The actual formatted text that was shared/sent';
