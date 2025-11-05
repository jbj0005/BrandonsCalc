-- Migration: Remove Trade-In Preferences from Customer Profiles
-- Date: 2025-11-04
-- Description: Remove preferred_trade_value and preferred_trade_payoff columns
--              These fields are now obsolete as trade-in management is handled via My Garage

-- Drop the trade-in preference columns
ALTER TABLE customer_profiles
  DROP COLUMN IF EXISTS preferred_trade_value,
  DROP COLUMN IF EXISTS preferred_trade_payoff;

-- Note: preferred_down_payment is kept as it's not related to trade-in management
