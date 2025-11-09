# Twilio SMS Webhook Testing Guide

## Overview

This guide explains how to test the Twilio SMS webhook that handles incoming messages (STOP, START, ACCEPT, REJECT, etc.) both locally during development and in production.

---

## Testing Approaches

There are three main ways to test your webhook:

1. **Production Testing**: Use the deployed Supabase Edge Function URL
2. **Local Testing with ngrok**: Tunnel to your local Supabase function
3. **Manual Testing**: Use curl or Postman to simulate Twilio requests

---

## Method 1: Production Testing (Deployed Edge Function)

### Prerequisites
- Twilio A2P 10DLC number configured (see [TWILIO_A2P_10DLC_SETUP.md](./TWILIO_A2P_10DLC_SETUP.md))
- Edge Function deployed to Supabase
- Database migration applied

### Setup

1. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy sms-webhook --no-verify-jwt
   ```

2. **Get your webhook URL**:
   ```
   https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook
   ```

   Replace `[YOUR_PROJECT_ID]` with your Supabase project ID (found in Supabase Dashboard → Settings → API)

3. **Configure Twilio Phone Number**:
   - Log in to Twilio Console
   - Go to **Phone Numbers** → **Manage** → **Active Numbers**
   - Click your 10DLC number
   - Scroll to **Messaging Configuration**
   - Under **A Message Comes In**:
     - **Webhook**: `https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook`
     - **HTTP Method**: POST
   - Click **Save**

### Testing Steps

1. **Prepare Test Data**:
   ```sql
   -- Add your test phone number with opt-in status
   INSERT INTO sms_opt_status (phone_number, opt_in_status, consent_method, source)
   VALUES ('+1234567890', true, 'manual_test', 'test');
   ```

2. **Send a test SMS to your Twilio number**:
   - From your mobile phone, send: `Hello`
   - Expected response: Auto-reply with help instructions

3. **Test Opt-Out (STOP)**:
   - Send: `STOP`
   - Expected response: "You have been unsubscribed from ExcelCalc messages. Reply START to resubscribe."
   - Verify in database:
     ```sql
     SELECT opt_in_status, opt_out_date FROM sms_opt_status WHERE phone_number = '+1234567890';
     -- Should show: opt_in_status = false, opt_out_date = NOW()
     ```

4. **Test Opt-In (START)**:
   - Send: `START`
   - Expected response: "You are now subscribed to ExcelCalc messages. Reply STOP to unsubscribe."
   - Verify in database:
     ```sql
     SELECT opt_in_status, opt_in_date FROM sms_opt_status WHERE phone_number = '+1234567890';
     -- Should show: opt_in_status = true, opt_in_date = NOW()
     ```

5. **Test Offer Response (ACCEPT)**:
   - First, create a test offer:
     ```sql
     INSERT INTO customer_offers (
       vehicle_year, vehicle_make, vehicle_model,
       vehicle_price, apr, term_months, monthly_payment,
       customer_phone, dealer_phone, status,
       amount_financed, finance_charge, total_of_payments
     )
     VALUES (
       2024, 'Toyota', 'Camry',
       35000, 4.99, 60, 650.00,
       '+1234567890', '+10987654321', 'sent',
       30000, 3500, 39000
     );
     ```
   - Send: `ACCEPT`
   - Expected response: "Thank you! Your acceptance has been recorded. A representative will contact you shortly."
   - Verify in database:
     ```sql
     SELECT status FROM customer_offers WHERE customer_phone = '+1234567890' ORDER BY created_at DESC LIMIT 1;
     -- Should show: status = 'accepted'
     ```

6. **View Logs**:
   ```bash
   supabase functions logs sms-webhook --tail
   ```

---

## Method 2: Local Testing with ngrok

**Use this method when:**
- Developing and debugging webhook logic locally
- Testing changes before deploying to production
- Need to inspect requests in real-time

### Prerequisites

1. **Install ngrok**:
   ```bash
   # macOS with Homebrew
   brew install ngrok

   # Or download from https://ngrok.com/download
   ```

2. **Sign up for ngrok account** (free):
   - Visit https://dashboard.ngrok.com/signup
   - Get your auth token

3. **Configure ngrok**:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

### Setup

**Important**: Supabase Edge Functions run on Deno, not Node.js. For local testing, you need to run them via Supabase CLI.

1. **Start Supabase locally**:
   ```bash
   supabase start
   ```

2. **Run the Edge Function locally**:
   ```bash
   supabase functions serve sms-webhook --no-verify-jwt
   ```

   This starts the function on `http://localhost:54321/functions/v1/sms-webhook`

3. **Start ngrok tunnel**:
   ```bash
   ngrok http 54321
   ```

   You'll see output like:
   ```
   Forwarding  https://abc123.ngrok.io -> http://localhost:54321
   ```

4. **Update Twilio webhook URL**:
   - Go to Twilio Console → Phone Numbers → Your Number
   - Set webhook to: `https://abc123.ngrok.io/functions/v1/sms-webhook`
   - Save

### Testing Steps

1. **Monitor ngrok traffic**:
   - Open http://127.0.0.1:4040 in your browser
   - This shows all HTTP requests in real-time

2. **Monitor function logs**:
   ```bash
   # In a separate terminal
   supabase functions logs sms-webhook --tail
   ```

3. **Send test SMS to your Twilio number**:
   - Send: `TEST`
   - Watch the request appear in ngrok dashboard
   - See function logs in terminal

4. **Inspect request/response**:
   - In ngrok dashboard, click on the request
   - View full request body, headers, and response
   - Replay requests to test changes

5. **Debug issues**:
   - Set breakpoints or add `console.log()` statements
   - Restart function: `supabase functions serve sms-webhook --no-verify-jwt`
   - Replay request from ngrok dashboard

### Common Issues

**Function not starting**:
```bash
# Check if Supabase is running
supabase status

# Restart if needed
supabase stop && supabase start
```

**ngrok tunnel closed**:
- Free ngrok tunnels expire after 8 hours
- Restart ngrok to get a new URL
- Update Twilio webhook with new URL

**Port conflicts**:
```bash
# Check if port 54321 is in use
lsof -i :54321

# Kill the process if needed
kill -9 [PID]
```

---

## Method 3: Manual Testing with curl

Test webhook without sending actual SMS messages.

### Basic Test

```bash
curl -X POST https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM12345678901234567890123456789012" \
  -d "From=+1234567890" \
  -d "To=+10987654321" \
  -d "Body=TEST"
```

### Test Opt-Out

```bash
curl -X POST https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM12345678901234567890123456789012" \
  -d "From=+1234567890" \
  -d "To=+10987654321" \
  -d "Body=STOP"
```

Expected response (TwiML):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed from ExcelCalc messages. Reply START to resubscribe.</Message>
</Response>
```

### Test Opt-In

```bash
curl -X POST https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM98765432109876543210987654321098" \
  -d "From=+1234567890" \
  -d "To=+10987654321" \
  -d "Body=START"
```

### Test Offer Response

```bash
curl -X POST https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM11111111111111111111111111111111" \
  -d "From=+1234567890" \
  -d "To=+10987654321" \
  -d "Body=ACCEPT"
```

---

## Testing Checklist

Use this checklist to verify complete webhook functionality:

### Core Functionality
- [ ] Webhook receives POST requests from Twilio
- [ ] Parses form data correctly
- [ ] Normalizes phone numbers to E.164 format
- [ ] Generates valid TwiML responses

### Opt-Out (STOP)
- [ ] Recognizes STOP keyword (case-insensitive)
- [ ] Recognizes variations: STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
- [ ] Updates database opt_in_status to false
- [ ] Records opt_out_date timestamp
- [ ] Sends confirmation message
- [ ] Blocks future messages to opted-out number

### Opt-In (START)
- [ ] Recognizes START keyword
- [ ] Recognizes variations: SUBSCRIBE, UNSTOP
- [ ] Updates database opt_in_status to true
- [ ] Records opt_in_date and consent_method
- [ ] Sends confirmation message
- [ ] Allows messages to re-opted-in number

### Offer Responses
- [ ] Recognizes ACCEPT keyword
- [ ] Recognizes REJECT keyword
- [ ] Recognizes INTERESTED keyword
- [ ] Finds most recent offer for phone number
- [ ] Updates offer status correctly
- [ ] Sends appropriate confirmation
- [ ] Handles "no offer found" gracefully

### General Inquiries
- [ ] Logs unknown messages to sms_logs
- [ ] Sends helpful auto-response
- [ ] Doesn't crash on unexpected input

### Error Handling
- [ ] Returns valid TwiML on database errors
- [ ] Logs errors for debugging
- [ ] Doesn't expose sensitive information
- [ ] Always returns HTTP 200 to Twilio

### Security
- [ ] Doesn't require authentication (Twilio can't send auth headers)
- [ ] Validates Twilio request signature (optional, see below)
- [ ] Prevents SQL injection (using parameterized queries)

---

## Advanced: Validating Twilio Requests

For production, validate that requests actually come from Twilio:

### Add Signature Validation

```typescript
// Add to sms-webhook/index.ts

import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;

function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  // Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort();

  // Concatenate URL and parameters
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  // Compute HMAC-SHA1
  const hmac = createHmac('sha1', TWILIO_AUTH_TOKEN);
  hmac.update(data);
  const expectedSignature = hmac.digest('base64');

  return signature === expectedSignature;
}

// In serve() function, before processing:
const twilioSignature = req.headers.get('X-Twilio-Signature');
const url = `https://[YOUR_PROJECT_ID].supabase.co/functions/v1/sms-webhook`;

if (!validateTwilioSignature(twilioSignature, url, paramsObject)) {
  console.error('[SECURITY] Invalid Twilio signature');
  return new Response('Unauthorized', { status: 403 });
}
```

**Note**: Signature validation makes local testing harder (ngrok changes URLs). Enable in production only.

---

## Monitoring Production Webhooks

### View Logs

```bash
# Tail live logs
supabase functions logs sms-webhook --tail

# View last 100 lines
supabase functions logs sms-webhook --limit 100
```

### Check Database Records

```sql
-- Recent incoming messages
SELECT from_phone, Body, created_at
FROM sms_logs
WHERE to_phone = '+10987654321'  -- Your Twilio number
ORDER BY created_at DESC
LIMIT 20;

-- Opt-out history
SELECT phone_number, opt_out_date, notes
FROM sms_opt_status
WHERE opt_in_status = false
ORDER BY opt_out_date DESC;

-- Recent offer responses
SELECT id, customer_phone, status, updated_at
FROM customer_offers
WHERE status IN ('accepted', 'rejected')
ORDER BY updated_at DESC
LIMIT 20;
```

### Twilio Console

- Go to **Monitor** → **Logs** → **Messaging**
- View all inbound/outbound messages
- Check for delivery failures
- See webhook response times

---

## Troubleshooting

### Webhook Not Receiving Messages

1. **Verify webhook URL in Twilio**:
   - Correct format: `https://[PROJECT_ID].supabase.co/functions/v1/sms-webhook`
   - No trailing slash
   - HTTP method: POST

2. **Check Edge Function deployment**:
   ```bash
   supabase functions list
   ```

3. **Test manually with curl**:
   ```bash
   curl -X POST https://[PROJECT_ID].supabase.co/functions/v1/sms-webhook \
     -d "MessageSid=TEST123" -d "From=+1234567890" -d "To=+10987654321" -d "Body=TEST"
   ```

4. **Check Twilio error logs**:
   - Console → Monitor → Logs → Errors
   - Look for webhook timeout or 500 errors

### Database Errors

```bash
# Check migration applied
supabase migration list

# Apply if needed
supabase db push

# Verify tables exist
# Run in Supabase SQL Editor:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'sms_opt_status';
```

### TwiML Format Errors

If Twilio shows "Invalid TwiML":
- Ensure XML is well-formed
- Escape special characters: `&`, `<`, `>`, `"`, `'`
- Return `Content-Type: text/xml` header

---

## Performance Benchmarks

Expected response times:

- **Opt-out/Opt-in**: < 500ms
- **Offer response**: < 800ms (includes database queries)
- **General inquiry**: < 400ms

If responses take > 2 seconds, Twilio may timeout. Optimize database queries or use async processing.

---

## Next Steps

After testing is complete:

1. ✅ Deploy to production
2. ✅ Configure Twilio webhook with production URL
3. ✅ Test all message types with real phone
4. ✅ Monitor logs for errors
5. ✅ Set up alerts for failed webhooks
6. ✅ Document any custom workflows

---

## Resources

- **Twilio Webhook Guide**: https://www.twilio.com/docs/usage/webhooks
- **TwiML Reference**: https://www.twilio.com/docs/messaging/twiml
- **ngrok Documentation**: https://ngrok.com/docs
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions

---

## Support

If you encounter issues:
1. Check function logs: `supabase functions logs sms-webhook`
2. Review Twilio debugger: Console → Monitor → Debugger
3. Test with curl to isolate the issue
4. Check this guide's troubleshooting section
