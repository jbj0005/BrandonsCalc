-- Create sms_opt_status table for TCPA compliance
-- Tracks SMS opt-in/opt-out status per phone number
-- Required by law before sending marketing/transactional SMS

CREATE TABLE IF NOT EXISTS sms_opt_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  opted_in_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  source TEXT, -- 'web_form', 'sms_reply', 'manual', etc.
  ip_address TEXT, -- IP of user when they opted in (for audit trail)
  user_agent TEXT, -- User agent when opted in
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Source must be one of the allowed types
  CONSTRAINT sms_opt_status_source_check CHECK (
    source IS NULL OR source = ANY (ARRAY[
      'web_form'::text,
      'sms_reply'::text,
      'manual'::text,
      'import'::text
    ])
  ),

  -- Validation: if opted_in is true, opted_in_at must be set
  CONSTRAINT sms_opt_status_opted_in_check CHECK (
    (opted_in = false) OR (opted_in = true AND opted_in_at IS NOT NULL)
  ),

  -- Validation: if opted_in is false and opted_out_at is set, they explicitly opted out
  CONSTRAINT sms_opt_status_opted_out_check CHECK (
    (opted_in = true) OR (opted_out_at IS NULL) OR (opted_in = false AND opted_out_at IS NOT NULL)
  )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sms_opt_status_phone ON sms_opt_status(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_opt_status_opted_in ON sms_opt_status(opted_in);
CREATE INDEX IF NOT EXISTS idx_sms_opt_status_created_at ON sms_opt_status(created_at);

-- Add table comment
COMMENT ON TABLE sms_opt_status IS 'TCPA compliance: Tracks SMS opt-in/opt-out status per phone number. MUST check before sending any SMS.';

-- Add column comments
COMMENT ON COLUMN sms_opt_status.phone_number IS 'Phone number in E.164 format (recommended) or national format';
COMMENT ON COLUMN sms_opt_status.opted_in IS 'Current opt-in status. MUST be true before sending SMS.';
COMMENT ON COLUMN sms_opt_status.source IS 'How the opt-in/opt-out was received';
COMMENT ON COLUMN sms_opt_status.ip_address IS 'IP address when user opted in (audit trail)';

-- Enable RLS
ALTER TABLE sms_opt_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can read all for TCPA checks
CREATE POLICY sms_opt_status_service_read ON sms_opt_status
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policy: Service role can insert/update for opt-in/opt-out management
CREATE POLICY sms_opt_status_service_all ON sms_opt_status
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policy: Authenticated users can see their own opt-in status
CREATE POLICY sms_opt_status_select_own ON sms_opt_status
  FOR SELECT
  USING (
    phone_number IN (
      SELECT phone FROM customer_profiles WHERE user_id = auth.uid()
    )
  );

-- Helper function: Check if phone number is opted in
CREATE OR REPLACE FUNCTION is_phone_opted_in(check_phone TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sms_opt_status
    WHERE phone_number = check_phone
    AND opted_in = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Record opt-in
CREATE OR REPLACE FUNCTION record_opt_in(
  check_phone TEXT,
  opt_source TEXT DEFAULT 'web_form',
  opt_ip TEXT DEFAULT NULL,
  opt_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  record_id UUID;
BEGIN
  INSERT INTO sms_opt_status (phone_number, opted_in, opted_in_at, source, ip_address, user_agent)
  VALUES (check_phone, true, NOW(), opt_source, opt_ip, opt_user_agent)
  ON CONFLICT (phone_number) DO UPDATE
  SET opted_in = true,
      opted_in_at = NOW(),
      opted_out_at = NULL,
      source = EXCLUDED.source,
      ip_address = EXCLUDED.ip_address,
      user_agent = EXCLUDED.user_agent,
      updated_at = NOW()
  RETURNING id INTO record_id;

  RETURN record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Record opt-out
CREATE OR REPLACE FUNCTION record_opt_out(
  check_phone TEXT,
  opt_source TEXT DEFAULT 'sms_reply'
)
RETURNS UUID AS $$
DECLARE
  record_id UUID;
BEGIN
  INSERT INTO sms_opt_status (phone_number, opted_in, opted_out_at, source)
  VALUES (check_phone, false, NOW(), opt_source)
  ON CONFLICT (phone_number) DO UPDATE
  SET opted_in = false,
      opted_out_at = NOW(),
      source = EXCLUDED.source,
      updated_at = NOW()
  RETURNING id INTO record_id;

  RETURN record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_phone_opted_in IS 'Check if a phone number has opted in to receive SMS';
COMMENT ON FUNCTION record_opt_in IS 'Record an SMS opt-in with audit trail (IP, user agent, source)';
COMMENT ON FUNCTION record_opt_out IS 'Record an SMS opt-out (STOP command compliance)';
