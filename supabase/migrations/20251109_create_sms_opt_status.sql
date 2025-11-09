-- ============================================================================
-- Migration: Create SMS Opt-In/Opt-Out Tracking Table
-- Date: 2025-11-09
-- Description: TCPA-compliant consent tracking for SMS communications
-- ============================================================================

-- ============================================================================
-- Table: sms_opt_status
-- Tracks opt-in/opt-out status per phone number for TCPA compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS sms_opt_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Phone Number (normalized to E.164 format)
  phone_number TEXT UNIQUE NOT NULL,

  -- Opt-In/Out Status
  opt_in_status BOOLEAN DEFAULT false NOT NULL,

  -- Consent Tracking (TCPA Compliance)
  opt_in_date TIMESTAMP WITH TIME ZONE,
  opt_out_date TIMESTAMP WITH TIME ZONE,
  consent_method TEXT, -- 'web_form', 'sms_reply_start', 'checkbox', 'phone_call', 'manual'
  consent_ip_address TEXT, -- IP address when consent was given (for audit trail)

  -- Message History
  last_message_sent_at TIMESTAMP WITH TIME ZONE,
  total_messages_sent INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT, -- Admin notes about opt-in/out reasons
  source TEXT -- Where this phone number came from (customer, dealer, etc.)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Fast lookup by phone number (most common query)
CREATE INDEX IF NOT EXISTS idx_sms_opt_status_phone ON sms_opt_status(phone_number);

-- Filter by opt-in status
CREATE INDEX IF NOT EXISTS idx_sms_opt_status_opt_in ON sms_opt_status(opt_in_status);

-- Find recently updated records
CREATE INDEX IF NOT EXISTS idx_sms_opt_status_updated ON sms_opt_status(updated_at DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE sms_opt_status ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (can be restricted to authenticated users later)
CREATE POLICY "Allow all on sms_opt_status"
  ON sms_opt_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Trigger for auto-updating updated_at
-- ============================================================================

CREATE TRIGGER update_sms_opt_status_updated_at
  BEFORE UPDATE ON sms_opt_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to check if a phone number is opted in
CREATE OR REPLACE FUNCTION is_phone_opted_in(p_phone_number TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_opted_in BOOLEAN;
BEGIN
  SELECT opt_in_status INTO v_opted_in
  FROM sms_opt_status
  WHERE phone_number = p_phone_number;

  -- If no record exists, default to false (must explicitly opt in)
  RETURN COALESCE(v_opted_in, false);
END;
$$;

-- Function to record opt-in
CREATE OR REPLACE FUNCTION record_opt_in(
  p_phone_number TEXT,
  p_consent_method TEXT,
  p_consent_ip TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_record_id UUID;
BEGIN
  INSERT INTO sms_opt_status (
    phone_number,
    opt_in_status,
    opt_in_date,
    consent_method,
    consent_ip_address,
    source
  )
  VALUES (
    p_phone_number,
    true,
    NOW(),
    p_consent_method,
    p_consent_ip,
    p_source
  )
  ON CONFLICT (phone_number)
  DO UPDATE SET
    opt_in_status = true,
    opt_in_date = NOW(),
    opt_out_date = NULL,
    consent_method = EXCLUDED.consent_method,
    consent_ip_address = EXCLUDED.consent_ip_address,
    updated_at = NOW()
  RETURNING id INTO v_record_id;

  RETURN v_record_id;
END;
$$;

-- Function to record opt-out
CREATE OR REPLACE FUNCTION record_opt_out(
  p_phone_number TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_record_id UUID;
BEGIN
  INSERT INTO sms_opt_status (
    phone_number,
    opt_in_status,
    opt_out_date,
    notes
  )
  VALUES (
    p_phone_number,
    false,
    NOW(),
    p_notes
  )
  ON CONFLICT (phone_number)
  DO UPDATE SET
    opt_in_status = false,
    opt_out_date = NOW(),
    notes = COALESCE(EXCLUDED.notes, sms_opt_status.notes),
    updated_at = NOW()
  RETURNING id INTO v_record_id;

  RETURN v_record_id;
END;
$$;

-- Function to record message sent (updates counter and timestamp)
CREATE OR REPLACE FUNCTION record_message_sent(p_phone_number TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE sms_opt_status
  SET
    last_message_sent_at = NOW(),
    total_messages_sent = total_messages_sent + 1,
    updated_at = NOW()
  WHERE phone_number = p_phone_number;
END;
$$;

-- ============================================================================
-- Update existing sms_logs table to link to opt_status
-- ============================================================================

-- Add foreign key reference (optional, but helps with data integrity)
ALTER TABLE sms_logs
ADD COLUMN IF NOT EXISTS opt_status_id UUID REFERENCES sms_opt_status(id) ON DELETE SET NULL;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE sms_opt_status IS 'TCPA-compliant tracking of SMS opt-in/opt-out consent per phone number';
COMMENT ON COLUMN sms_opt_status.phone_number IS 'Phone number in E.164 format (e.g., +12345678901)';
COMMENT ON COLUMN sms_opt_status.opt_in_status IS 'Current opt-in status: true = can send SMS, false = opted out';
COMMENT ON COLUMN sms_opt_status.consent_method IS 'How consent was obtained: web_form, sms_reply_start, checkbox, phone_call, manual';
COMMENT ON COLUMN sms_opt_status.consent_ip_address IS 'IP address when consent was given (audit trail for compliance)';
COMMENT ON FUNCTION is_phone_opted_in IS 'Check if a phone number has active opt-in consent';
COMMENT ON FUNCTION record_opt_in IS 'Record or update opt-in consent for a phone number';
COMMENT ON FUNCTION record_opt_out IS 'Record opt-out request for a phone number';
COMMENT ON FUNCTION record_message_sent IS 'Update message counter and timestamp when SMS is sent';
