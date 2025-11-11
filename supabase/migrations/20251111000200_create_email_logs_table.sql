-- Create email_logs table for tracking all email sends via SendGrid
-- Logs delivery status, message IDs, and errors for audit and debugging

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES customer_offers(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sendgrid_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status must be one of: pending, sent, delivered, failed, bounced
  CONSTRAINT email_logs_status_check CHECK (
    status = ANY (ARRAY[
      'pending'::text,
      'sent'::text,
      'delivered'::text,
      'failed'::text,
      'bounced'::text
    ])
  )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_logs_offer_id ON email_logs(offer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);

-- Add table comment
COMMENT ON TABLE email_logs IS 'Tracks all email sends via SendGrid for offer notifications and confirmations';

-- Add column comments
COMMENT ON COLUMN email_logs.offer_id IS 'Reference to the customer offer this email relates to';
COMMENT ON COLUMN email_logs.sendgrid_message_id IS 'SendGrid message ID for tracking delivery status';
COMMENT ON COLUMN email_logs.status IS 'Current status: pending/sent/delivered/failed/bounced';

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own email logs (via offer ownership)
CREATE POLICY email_logs_select_own ON email_logs
  FOR SELECT
  USING (
    offer_id IN (
      SELECT id FROM customer_offers WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/update (for edge function)
CREATE POLICY email_logs_service_all ON email_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
