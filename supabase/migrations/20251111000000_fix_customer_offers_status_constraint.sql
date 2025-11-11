-- Fix customer_offers status constraint to allow extended statuses
-- Current constraint only allows: 'active', 'closed'
-- New constraint allows: 'active', 'closed', 'sent', 'accepted', 'rejected', 'viewed'

-- Drop existing constraint
ALTER TABLE customer_offers
  DROP CONSTRAINT IF EXISTS customer_offers_status_check;

-- Add new constraint with all statuses
ALTER TABLE customer_offers
  ADD CONSTRAINT customer_offers_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text,
    'closed'::text,
    'sent'::text,
    'accepted'::text,
    'rejected'::text,
    'viewed'::text
  ]));

-- Update default status to remain 'active'
-- (no change needed, already set in table definition)

COMMENT ON CONSTRAINT customer_offers_status_check ON customer_offers IS
  'Allows active/closed/sent/accepted/rejected/viewed statuses for offer lifecycle tracking';
