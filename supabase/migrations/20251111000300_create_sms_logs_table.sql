-- Create sms_logs table for tracking all SMS sends via Twilio
-- Logs delivery status, Twilio SIDs, and errors for TCPA compliance and debugging

CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES customer_offers(id) ON DELETE CASCADE,
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  twilio_sid TEXT,
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status must be one of: pending, queued, sent, delivered, failed, undelivered
  CONSTRAINT sms_logs_status_check CHECK (
    status = ANY (ARRAY[
      'pending'::text,
      'queued'::text,
      'sent'::text,
      'delivered'::text,
      'failed'::text,
      'undelivered'::text
    ])
  )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sms_logs_offer_id ON sms_logs(offer_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_to_phone ON sms_logs(to_phone);
CREATE INDEX IF NOT EXISTS idx_sms_logs_twilio_sid ON sms_logs(twilio_sid);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at);

-- Add table comment
COMMENT ON TABLE sms_logs IS 'Tracks all SMS sends via Twilio for TCPA compliance and delivery tracking';

-- Add column comments
COMMENT ON COLUMN sms_logs.offer_id IS 'Reference to the customer offer this SMS relates to';
COMMENT ON COLUMN sms_logs.twilio_sid IS 'Twilio message SID for tracking delivery status via webhooks';
COMMENT ON COLUMN sms_logs.status IS 'Current status: pending/queued/sent/delivered/failed/undelivered';
COMMENT ON COLUMN sms_logs.to_phone IS 'Recipient phone number (E.164 format recommended)';

-- Enable RLS
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own SMS logs (via offer ownership)
CREATE POLICY sms_logs_select_own ON sms_logs
  FOR SELECT
  USING (
    offer_id IN (
      SELECT id FROM customer_offers WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/update (for edge function)
CREATE POLICY sms_logs_service_all ON sms_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
