-- Add audit and staleness tracking columns to auto_rates
-- These columns enable:
--   1. Staleness detection (visual indicators in myLenders)
--   2. Soft delete pattern (audit trail preservation)
--   3. Rate diff comparison before pushing to production

ALTER TABLE auto_rates
ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for staleness queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_auto_rates_staleness
ON auto_rates(source, last_scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_rates_active
ON auto_rates(is_active, source)
WHERE is_active = TRUE;

-- Column comments for documentation
COMMENT ON COLUMN auto_rates.last_scraped_at IS 'Timestamp when rate was last scraped/updated - used for staleness detection';
COMMENT ON COLUMN auto_rates.source_url IS 'URL where rate was scraped from (audit trail)';
COMMENT ON COLUMN auto_rates.is_active IS 'Soft delete flag - false means rate is deprecated/replaced';
COMMENT ON COLUMN auto_rates.deleted_at IS 'Timestamp of soft delete - preserves audit trail';

-- Update existing rows to mark them as active with current timestamp
UPDATE auto_rates
SET is_active = TRUE,
    last_scraped_at = created_at
WHERE is_active IS NULL;
