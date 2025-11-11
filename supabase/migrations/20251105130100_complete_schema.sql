-- ============================================
-- COMPLETE EXCELCALC DATABASE SCHEMA
-- Migration: 20251105_complete_schema.sql
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CUSTOMER PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  preferred_credit_score TEXT CHECK (preferred_credit_score IN ('excellent', 'good', 'fair', 'poor')),
  preferred_down_payment NUMERIC(10, 2) DEFAULT 0,
  preferred_trade_value NUMERIC(10, 2) DEFAULT 0,
  preferred_trade_payoff NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id ON customer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON customer_profiles(email);

-- RLS Policies
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON customer_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON customer_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON customer_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 2. GARAGE VEHICLES TABLE
-- ============================================
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_user_id ON garage_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_created_at ON garage_vehicles(created_at DESC);

-- RLS Policies
ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicles"
  ON garage_vehicles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicles"
  ON garage_vehicles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicles"
  ON garage_vehicles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vehicles"
  ON garage_vehicles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 3. CUSTOMER OFFERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS customer_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Vehicle Information
  vehicle_year INTEGER NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_trim TEXT,
  vehicle_price NUMERIC(10, 2) NOT NULL,

  -- Financing Details
  down_payment NUMERIC(10, 2) DEFAULT 0,
  trade_value NUMERIC(10, 2) DEFAULT 0,
  trade_payoff NUMERIC(10, 2) DEFAULT 0,
  apr NUMERIC(5, 3) NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_payment NUMERIC(10, 2) NOT NULL,

  -- Fees & Taxes
  dealer_fees NUMERIC(10, 2) DEFAULT 0,
  customer_addons NUMERIC(10, 2) DEFAULT 0,
  state_tax_rate NUMERIC(5, 3) DEFAULT 0,
  county_tax_rate NUMERIC(5, 3) DEFAULT 0,
  total_tax NUMERIC(10, 2) DEFAULT 0,

  -- Calculated Totals
  amount_financed NUMERIC(10, 2) NOT NULL,
  finance_charge NUMERIC(10, 2) NOT NULL,
  total_of_payments NUMERIC(10, 2) NOT NULL,

  -- Customer Info
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_location TEXT,

  -- Dealer Info
  dealer_name TEXT,
  dealer_phone TEXT,
  dealer_address TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected')),

  -- Metadata
  share_token TEXT UNIQUE,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_offers_user_id ON customer_offers(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_offers_share_token ON customer_offers(share_token);
CREATE INDEX IF NOT EXISTS idx_customer_offers_status ON customer_offers(status);
CREATE INDEX IF NOT EXISTS idx_customer_offers_created_at ON customer_offers(created_at DESC);

-- RLS Policies
ALTER TABLE customer_offers ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their own offers
CREATE POLICY "Users can view own offers"
  ON customer_offers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Anyone can view offers with share_token (public sharing)
CREATE POLICY "Anyone can view offers with share token"
  ON customer_offers FOR SELECT
  TO anon, authenticated
  USING (share_token IS NOT NULL);

CREATE POLICY "Users can insert own offers"
  ON customer_offers FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Users can update own offers"
  ON customer_offers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 4. SMS LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES customer_offers(id) ON DELETE SET NULL,
  message_sid TEXT NOT NULL UNIQUE,
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  dealer_name TEXT,
  customer_name TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_logs_offer_id ON sms_logs(offer_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_message_sid ON sms_logs(message_sid);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at DESC);

-- RLS Policies
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view SMS logs"
  ON sms_logs FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- 5. RATE SHEETS TABLE (for lender rates)
-- ============================================
CREATE TABLE IF NOT EXISTS rate_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name TEXT NOT NULL,
  credit_tier TEXT NOT NULL CHECK (credit_tier IN ('excellent', 'good', 'fair', 'poor')),
  term_months INTEGER NOT NULL,
  apr NUMERIC(5, 3) NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rate_sheets_lender ON rate_sheets(lender_name);
CREATE INDEX IF NOT EXISTS idx_rate_sheets_active ON rate_sheets(is_active);
CREATE INDEX IF NOT EXISTS idx_rate_sheets_effective_date ON rate_sheets(effective_date DESC);

-- RLS Policies (public read access)
ALTER TABLE rate_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active rate sheets"
  ON rate_sheets FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ============================================
-- 6. TRIGGER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_offers_updated_at
  BEFORE UPDATE ON customer_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_sheets_updated_at
  BEFORE UPDATE ON rate_sheets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. FUNCTION TO CREATE USER PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.customer_profiles (user_id, email, full_name, phone)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 8. SAMPLE DATA (Optional - Comment out in production)
-- ============================================

-- Sample rate sheets
INSERT INTO rate_sheets (lender_name, credit_tier, term_months, apr, effective_date)
VALUES 
  ('Capital One', 'excellent', 36, 3.99, CURRENT_DATE),
  ('Capital One', 'excellent', 48, 4.49, CURRENT_DATE),
  ('Capital One', 'excellent', 60, 4.99, CURRENT_DATE),
  ('Capital One', 'excellent', 72, 5.49, CURRENT_DATE),
  ('Capital One', 'good', 36, 5.99, CURRENT_DATE),
  ('Capital One', 'good', 48, 6.49, CURRENT_DATE),
  ('Capital One', 'good', 60, 6.99, CURRENT_DATE),
  ('Capital One', 'good', 72, 7.49, CURRENT_DATE),
  ('Chase Bank', 'excellent', 36, 3.89, CURRENT_DATE),
  ('Chase Bank', 'excellent', 48, 4.39, CURRENT_DATE),
  ('Chase Bank', 'excellent', 60, 4.89, CURRENT_DATE),
  ('Chase Bank', 'excellent', 72, 5.39, CURRENT_DATE),
  ('Chase Bank', 'good', 36, 5.89, CURRENT_DATE),
  ('Chase Bank', 'good', 48, 6.39, CURRENT_DATE),
  ('Chase Bank', 'good', 60, 6.89, CURRENT_DATE),
  ('Chase Bank', 'good', 72, 7.39, CURRENT_DATE)
ON CONFLICT DO NOTHING;
