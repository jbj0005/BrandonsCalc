-- Add offer_preview_html column to customer_offers table
ALTER TABLE customer_offers
ADD COLUMN IF NOT EXISTS offer_preview_html TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN customer_offers.offer_preview_html IS 'Stores the HTML preview of the offer as shown in the Submit Offer modal';
