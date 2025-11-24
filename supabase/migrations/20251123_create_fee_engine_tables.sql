-- =====================================================
-- Fee Engine Tables Migration
-- Created: 2025-11-23
-- Purpose: DMS-style fee calculation engine infrastructure
-- =====================================================

-- =====================================================
-- 1. JURISDICTION_RULES TABLE
-- Stores government fee rules, tax rates, and exemptions
-- =====================================================
CREATE TABLE IF NOT EXISTS jurisdiction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Location identifiers
  state_code TEXT NOT NULL,
  county_name TEXT,

  -- Rule classification
  rule_type TEXT NOT NULL CHECK (rule_type IN ('government_fee', 'tax_calculation', 'exemption')),

  -- Rule data (JSONB for flexibility)
  rule_data JSONB NOT NULL,

  -- Versioning
  version TEXT NOT NULL DEFAULT 'v1',

  -- Effective date range
  effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiration_date TIMESTAMPTZ,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX idx_jurisdiction_rules_lookup
  ON jurisdiction_rules(state_code, county_name, rule_type, effective_date, expiration_date)
  WHERE expiration_date IS NULL;

CREATE INDEX idx_jurisdiction_rules_state
  ON jurisdiction_rules(state_code, rule_type);

CREATE INDEX idx_jurisdiction_rules_county
  ON jurisdiction_rules(state_code, county_name)
  WHERE county_name IS NOT NULL;

-- RLS policies
ALTER TABLE jurisdiction_rules ENABLE ROW LEVEL SECURITY;

-- Public read access (rules are public knowledge)
CREATE POLICY "Jurisdiction rules are publicly readable"
  ON jurisdiction_rules FOR SELECT
  TO public
  USING (true);

-- Only admins can insert/update/delete rules
CREATE POLICY "Only admins can modify jurisdiction rules"
  ON jurisdiction_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- =====================================================
-- 2. DEALER_FEE_CONFIGS TABLE
-- Stores dealer-specific fee packages and configurations
-- =====================================================
CREATE TABLE IF NOT EXISTS dealer_fee_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dealer identification
  dealer_id TEXT NOT NULL,
  config_version TEXT NOT NULL,

  -- Configuration data (JSONB for flexibility)
  config_data JSONB NOT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
-- Ensure only one active config per dealer
CREATE UNIQUE INDEX idx_dealer_configs_active_unique
  ON dealer_fee_configs(dealer_id)
  WHERE is_active = true;

CREATE INDEX idx_dealer_configs_dealer
  ON dealer_fee_configs(dealer_id, is_active);

CREATE INDEX idx_dealer_configs_active
  ON dealer_fee_configs(dealer_id)
  WHERE is_active = true;

-- RLS policies
ALTER TABLE dealer_fee_configs ENABLE ROW LEVEL SECURITY;

-- Dealers can read their own configs
CREATE POLICY "Dealers can read own configs"
  ON dealer_fee_configs FOR SELECT
  TO authenticated
  USING (
    dealer_id = current_setting('app.dealer_id', true)
    OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('admin', 'dealer')
    )
  );

-- Dealers can insert/update own configs
CREATE POLICY "Dealers can modify own configs"
  ON dealer_fee_configs FOR ALL
  TO authenticated
  USING (
    dealer_id = current_setting('app.dealer_id', true)
    OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('admin', 'dealer')
    )
  );

-- =====================================================
-- 3. SCENARIO_CALCULATIONS TABLE
-- Audit log of all fee calculations
-- =====================================================
CREATE TABLE IF NOT EXISTS scenario_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scenario tracking
  scenario_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Input and output (JSONB for flexibility)
  scenario_input JSONB NOT NULL,
  scenario_result JSONB NOT NULL,

  -- Performance tracking
  calculation_duration_ms INTEGER,

  -- Metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scenario_calculations_user
  ON scenario_calculations(user_id, calculated_at DESC);

CREATE INDEX idx_scenario_calculations_timestamp
  ON scenario_calculations(calculated_at DESC);

CREATE INDEX idx_scenario_calculations_scenario
  ON scenario_calculations(scenario_id);

-- RLS policies
ALTER TABLE scenario_calculations ENABLE ROW LEVEL SECURITY;

-- Users can read their own calculations
CREATE POLICY "Users can read own calculations"
  ON scenario_calculations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Any authenticated user can insert calculations
CREATE POLICY "Authenticated users can log calculations"
  ON scenario_calculations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 4. UPDATED_AT TRIGGER FUNCTION
-- Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to jurisdiction_rules
CREATE TRIGGER update_jurisdiction_rules_updated_at
  BEFORE UPDATE ON jurisdiction_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to dealer_fee_configs
CREATE TRIGGER update_dealer_fee_configs_updated_at
  BEFORE UPDATE ON dealer_fee_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to get active jurisdiction rules
CREATE OR REPLACE FUNCTION get_active_jurisdiction_rules(
  p_state_code TEXT,
  p_county_name TEXT DEFAULT NULL,
  p_rule_type TEXT DEFAULT NULL
)
RETURNS SETOF jurisdiction_rules AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM jurisdiction_rules
  WHERE
    state_code = p_state_code
    AND (p_county_name IS NULL OR county_name = p_county_name OR county_name IS NULL)
    AND (p_rule_type IS NULL OR rule_type = p_rule_type)
    AND effective_date <= now()
    AND (expiration_date IS NULL OR expiration_date > now())
  ORDER BY
    -- County-specific rules take precedence over state-wide
    CASE WHEN county_name IS NOT NULL THEN 1 ELSE 2 END,
    effective_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get active dealer config
CREATE OR REPLACE FUNCTION get_active_dealer_config(p_dealer_id TEXT)
RETURNS dealer_fee_configs AS $$
DECLARE
  result dealer_fee_configs;
BEGIN
  SELECT * INTO result
  FROM dealer_fee_configs
  WHERE dealer_id = p_dealer_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. COMMENTS
-- =====================================================
COMMENT ON TABLE jurisdiction_rules IS 'Government fee rules, tax rates, and exemptions by jurisdiction';
COMMENT ON COLUMN jurisdiction_rules.rule_data IS 'JSONB containing GovernmentFeeRule, TaxRateRule, or ExemptionRule';

COMMENT ON TABLE dealer_fee_configs IS 'Dealer-specific fee packages and configurations';
COMMENT ON COLUMN dealer_fee_configs.config_data IS 'JSONB containing FeePackage arrays and default settings';

COMMENT ON TABLE scenario_calculations IS 'Audit log of all fee calculations for analytics and debugging';
COMMENT ON COLUMN scenario_calculations.scenario_input IS 'Complete ScenarioInput JSONB';
COMMENT ON COLUMN scenario_calculations.scenario_result IS 'Complete ScenarioResult JSONB';
