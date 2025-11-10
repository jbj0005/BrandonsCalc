-- Migration: Add Preference Fields to Customer Profiles
-- Date: 2025-11-04
-- Description: Add preferred_down_payment, preferred_trade_value, and preferred_trade_payoff columns

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS preferred_down_payment NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS preferred_trade_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS preferred_trade_payoff NUMERIC(10, 2);

COMMENT ON COLUMN customer_profiles.preferred_down_payment IS 'User''s typical down payment amount';
COMMENT ON COLUMN customer_profiles.preferred_trade_value IS 'Expected value of user''s trade-in vehicle';
COMMENT ON COLUMN customer_profiles.preferred_trade_payoff IS 'Amount owed on user''s trade-in vehicle';
