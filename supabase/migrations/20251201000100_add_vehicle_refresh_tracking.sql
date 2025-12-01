-- Add fields for tracking vehicle data freshness and changes
-- Used for smart refresh on selection and diff display

-- Add last_refreshed_at to track when MarketCheck data was last fetched
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ DEFAULT NULL;

-- Add previous values for diff tracking
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS previous_asking_price NUMERIC DEFAULT NULL;

ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS previous_mileage INTEGER DEFAULT NULL;

-- Comment on the purpose of these columns
COMMENT ON COLUMN vehicles.last_refreshed_at IS 'Timestamp of last MarketCheck API refresh';
COMMENT ON COLUMN vehicles.previous_asking_price IS 'Previous asking price for diff display';
COMMENT ON COLUMN vehicles.previous_mileage IS 'Previous mileage for diff display';

-- Also add to garage_vehicles for consistency
ALTER TABLE garage_vehicles
ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE garage_vehicles
ADD COLUMN IF NOT EXISTS previous_estimated_value NUMERIC DEFAULT NULL;

ALTER TABLE garage_vehicles
ADD COLUMN IF NOT EXISTS previous_mileage INTEGER DEFAULT NULL;

COMMENT ON COLUMN garage_vehicles.last_refreshed_at IS 'Timestamp of last data refresh';
COMMENT ON COLUMN garage_vehicles.previous_estimated_value IS 'Previous estimated value for diff display';
COMMENT ON COLUMN garage_vehicles.previous_mileage IS 'Previous mileage for diff display';
