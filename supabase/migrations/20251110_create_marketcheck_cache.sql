-- Create MarketCheck API Response Cache Table
-- Purpose: Reduce expensive MarketCheck API calls by caching responses
-- Cache Strategy: 7 days for active listings, 30 days for historical listings

CREATE TABLE IF NOT EXISTS marketcheck_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache key
  vin TEXT UNIQUE NOT NULL,

  -- MarketCheck response data
  mc_response JSONB NOT NULL,
  mc_listing_id TEXT,
  mc_search_source TEXT, -- "active", "historical", "summary", etc.

  -- Timestamps
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  api_calls_saved INTEGER DEFAULT 0, -- Track cache hits for analytics

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mc_cache_vin ON marketcheck_cache(vin);
CREATE INDEX IF NOT EXISTS idx_mc_cache_expires ON marketcheck_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_mc_cache_active ON marketcheck_cache(is_active);
CREATE INDEX IF NOT EXISTS idx_mc_cache_created ON marketcheck_cache(created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_marketcheck_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketcheck_cache_updated_at
  BEFORE UPDATE ON marketcheck_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_marketcheck_cache_updated_at();

-- RLS Policies (public read for all authenticated users, system write)
ALTER TABLE marketcheck_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read cache (shared cache)
CREATE POLICY "Anyone can read marketcheck cache"
  ON marketcheck_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can write (server-side only)
CREATE POLICY "Service role can insert/update marketcheck cache"
  ON marketcheck_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to clean up expired cache entries (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_marketcheck_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM marketcheck_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_marketcheck_cache() TO service_role;

-- Comment for documentation
COMMENT ON TABLE marketcheck_cache IS 'Cache for MarketCheck API responses to reduce expensive API calls. Shared across all users.';
COMMENT ON COLUMN marketcheck_cache.vin IS 'Vehicle Identification Number (cache key)';
COMMENT ON COLUMN marketcheck_cache.mc_response IS 'Full MarketCheck API response as JSONB';
COMMENT ON COLUMN marketcheck_cache.expires_at IS 'Cache expiration timestamp (7 days for active, 30 days for historical)';
COMMENT ON COLUMN marketcheck_cache.api_calls_saved IS 'Counter incremented on each cache hit for cost savings analytics';
