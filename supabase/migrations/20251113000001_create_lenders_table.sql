-- Create lenders table to manage all lender configurations
CREATE TABLE IF NOT EXISTS lenders (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  long_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Partnership and sponsorship support (Phase 2)
  partnership_type TEXT NOT NULL DEFAULT 'standard' CHECK (partnership_type IN ('sponsored', 'preferred', 'standard')),
  priority_weight INTEGER NOT NULL DEFAULT 0 CHECK (priority_weight >= 0 AND priority_weight <= 100),
  apr_tolerance NUMERIC(5,3) NOT NULL DEFAULT 0.5 CHECK (apr_tolerance >= 0),
  badge_text TEXT,
  badge_color TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for active lenders lookup
CREATE INDEX IF NOT EXISTS idx_lenders_active ON lenders(is_active, display_order);

-- Create index for partnership queries
CREATE INDEX IF NOT EXISTS idx_lenders_partnership ON lenders(partnership_type, priority_weight DESC) WHERE is_active = true;

-- Add RLS policies
ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active lenders
CREATE POLICY "Public can view active lenders"
  ON lenders FOR SELECT
  USING (is_active = true);

-- Only authenticated users can insert/update lenders (for admin panel)
CREATE POLICY "Authenticated users can manage lenders"
  ON lenders FOR ALL
  USING (auth.role() = 'authenticated');

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lenders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lenders_timestamp
  BEFORE UPDATE ON lenders
  FOR EACH ROW
  EXECUTE FUNCTION update_lenders_updated_at();

-- Insert initial lenders from existing auto_rates sources
INSERT INTO lenders (id, source, short_name, long_name, display_order, is_active) VALUES
  ('nfcu', 'nfcu', 'NFCU', 'Navy Federal Credit Union', 1, true),
  ('sccu', 'sccu', 'SCCU', 'Space Coast Credit Union', 2, true),
  ('penfed', 'penfed', 'PenFed', 'Pentagon Federal Credit Union', 3, true),
  ('dcu', 'dcu', 'DCU', 'Digital Federal Credit Union', 4, true),
  ('launchcu', 'launchcu', 'Launch CU', 'Launch Federal Credit Union', 5, true),
  ('ngfcu', 'ngfcu', 'NGFCU', 'Nightingale Federal Credit Union', 6, true),
  ('ccufl', 'ccufl', 'CCU FL', 'Community Credit Union of Florida', 7, true),
  ('ccu_mi', 'ccu_mi', 'CCU MI', 'Community Credit Union Michigan', 8, false),
  ('ccu_online', 'ccu_online', 'CCU Online', 'Community Credit Union (Online)', 9, false),
  ('lcu', 'lcu', 'LCU', 'Launch Credit Union (Legacy)', 10, false)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE lenders IS 'Centralized lender configuration with partnership and sponsorship support';
COMMENT ON COLUMN lenders.partnership_type IS 'Type of partnership: sponsored (paid placement), preferred (negotiated rates), or standard';
COMMENT ON COLUMN lenders.priority_weight IS 'Weight for sorting sponsored/preferred lenders (0-100, higher = more priority)';
COMMENT ON COLUMN lenders.apr_tolerance IS 'Maximum APR difference to still show sponsored lender first (e.g., 0.5 = 0.5%)';
COMMENT ON COLUMN lenders.badge_text IS 'Text to display in UI badge (e.g., "Sponsored", "Partner")';
