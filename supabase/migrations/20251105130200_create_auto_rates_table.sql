-- ============================================
-- AUTO RATES TABLE
-- Migration: 20251105_create_auto_rates_table.sql
-- ============================================

-- Create auto_rates table
CREATE TABLE IF NOT EXISTS auto_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_url TEXT,
  loan_type TEXT,
  term_label TEXT,
  term_range_min INTEGER,
  term_range_max INTEGER,
  credit_tier TEXT,
  credit_tier_label TEXT,
  credit_score_min INTEGER,
  credit_score_max INTEGER,
  base_apr_percent NUMERIC(5, 3),
  apr_adjustment NUMERIC(5, 3) DEFAULT 0,
  apr_percent NUMERIC(5, 3) NOT NULL,
  effective_at DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  vehicle_condition TEXT CHECK (vehicle_condition IN ('new', 'used')),
  term_months_min INTEGER,
  term_months_max INTEGER
);

-- Indexes for better query performance
CREATE INDEX idx_auto_rates_source ON auto_rates(source);
CREATE INDEX idx_auto_rates_credit_tier ON auto_rates(credit_tier);
CREATE INDEX idx_auto_rates_vehicle_condition ON auto_rates(vehicle_condition);
CREATE INDEX idx_auto_rates_term_range ON auto_rates(term_range_min, term_range_max);
CREATE INDEX idx_auto_rates_effective_at ON auto_rates(effective_at DESC);
CREATE INDEX idx_auto_rates_apr ON auto_rates(apr_percent);

-- Composite index for common queries (source + credit tier + condition + term)
CREATE INDEX idx_auto_rates_lookup ON auto_rates(source, credit_tier, vehicle_condition, term_range_min, term_range_max);

-- RLS Policies (public read access for rates)
ALTER TABLE auto_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view auto rates"
  ON auto_rates FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to insert/update rates (for admin functions)
CREATE POLICY "Authenticated users can insert rates"
  ON auto_rates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update rates"
  ON auto_rates FOR UPDATE
  TO authenticated
  USING (true);
