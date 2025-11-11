-- Add display_preferences JSONB column to customer_profiles table
-- This stores user preferences for which vehicle attributes and offer sections to display

-- Add the column
ALTER TABLE customer_profiles
ADD COLUMN IF NOT EXISTS display_preferences JSONB DEFAULT '{
  "selectedVehicleCard": {
    "year": true,
    "make": true,
    "model": true,
    "trim": true,
    "askingPrice": true,
    "estimatedValue": false,
    "vin": true,
    "mileage": false,
    "condition": false,
    "payoffAmount": false,
    "dealerName": false,
    "dealerCity": false,
    "dealerState": false,
    "dealerPhone": false
  },
  "previewOffer": {
    "showTradeInSection": false,
    "showFeesSection": false
  }
}'::jsonb;

-- Add a comment explaining the column
COMMENT ON COLUMN customer_profiles.display_preferences IS
'User preferences for display customization. Controls which vehicle attributes appear in Selected Vehicle card and which sections appear in Preview Offer modal. Protected fields (trade value, trade payoff, cash down) are disabled in Preview Offer customization to protect negotiating power.';

-- Create index for faster JSONB queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_customer_profiles_display_preferences
ON customer_profiles USING gin(display_preferences);
