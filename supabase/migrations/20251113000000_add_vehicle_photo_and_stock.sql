-- Add vehicle_photo_url column to customer_offers table
-- This stores the URL to the vehicle's photo for display in offers

ALTER TABLE customer_offers
  ADD COLUMN IF NOT EXISTS vehicle_photo_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN customer_offers.vehicle_photo_url IS 'URL to the vehicle photo for display in offers';
