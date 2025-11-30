-- Add vehicle weight and body type columns to vehicle tables
-- These columns store NHTSA vPIC API data for weight-based registration fee calculations

-- Add columns to vehicles table (saved vehicles)
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS body_class TEXT,
ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
ADD COLUMN IF NOT EXISTS curb_weight_lbs INTEGER,
ADD COLUMN IF NOT EXISTS weight_source TEXT; -- 'nhtsa_exact', 'gvwr_derived', 'manual'

-- Add columns to garage_vehicles table (trade-in vehicles)
ALTER TABLE garage_vehicles
ADD COLUMN IF NOT EXISTS body_class TEXT,
ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
ADD COLUMN IF NOT EXISTS curb_weight_lbs INTEGER,
ADD COLUMN IF NOT EXISTS weight_source TEXT;

-- Add columns to shared_vehicles table (imported shared vehicles)
ALTER TABLE shared_vehicles
ADD COLUMN IF NOT EXISTS body_class TEXT,
ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
ADD COLUMN IF NOT EXISTS curb_weight_lbs INTEGER,
ADD COLUMN IF NOT EXISTS weight_source TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN vehicles.body_class IS 'Vehicle body class from NHTSA (e.g., Sedan/Saloon, Sport Utility Vehicle)';
COMMENT ON COLUMN vehicles.vehicle_type IS 'Vehicle type from NHTSA (e.g., PASSENGER CAR, TRUCK)';
COMMENT ON COLUMN vehicles.curb_weight_lbs IS 'Vehicle curb weight in pounds for registration fee calculation';
COMMENT ON COLUMN vehicles.weight_source IS 'Source of weight: nhtsa_exact, gvwr_derived, or manual';

COMMENT ON COLUMN garage_vehicles.body_class IS 'Vehicle body class from NHTSA';
COMMENT ON COLUMN garage_vehicles.vehicle_type IS 'Vehicle type from NHTSA';
COMMENT ON COLUMN garage_vehicles.curb_weight_lbs IS 'Vehicle curb weight in pounds';
COMMENT ON COLUMN garage_vehicles.weight_source IS 'Source of weight data';

COMMENT ON COLUMN shared_vehicles.body_class IS 'Vehicle body class from NHTSA';
COMMENT ON COLUMN shared_vehicles.vehicle_type IS 'Vehicle type from NHTSA';
COMMENT ON COLUMN shared_vehicles.curb_weight_lbs IS 'Vehicle curb weight in pounds';
COMMENT ON COLUMN shared_vehicles.weight_source IS 'Source of weight data';
