-- Add stock number fields to vehicles, customer_offers, and saved_offers tables
-- These fields store dealer stock/inventory numbers for vehicle identification

-- Add stock number to vehicles table
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS dealer_stock TEXT;

-- Add stock number to customer_offers table
ALTER TABLE customer_offers
  ADD COLUMN IF NOT EXISTS vehicle_stock_number TEXT;

-- Add stock number to saved_offers table (for consistency)
ALTER TABLE saved_offers
  ADD COLUMN IF NOT EXISTS vehicle_stock_number TEXT;

-- Create indexes for searching by stock number (only where not null for efficiency)
CREATE INDEX IF NOT EXISTS idx_vehicles_dealer_stock
  ON vehicles(dealer_stock)
  WHERE dealer_stock IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_offers_stock
  ON customer_offers(vehicle_stock_number)
  WHERE vehicle_stock_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_offers_stock
  ON saved_offers(vehicle_stock_number)
  WHERE vehicle_stock_number IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN vehicles.dealer_stock IS 'Dealer inventory/stock number for the vehicle';
COMMENT ON COLUMN customer_offers.vehicle_stock_number IS 'Dealer stock number snapshot at offer submission';
COMMENT ON COLUMN saved_offers.vehicle_stock_number IS 'Dealer stock number for the offered vehicle';
