# Twilio A2P 10DLC Setup Guide

## Overview

This guide walks you through setting up A2P (Application-to-Person) 10DLC messaging with Twilio for ExcelCalc's compliant SMS workflow.

**A2P 10DLC** is Twilio's solution for sending application-generated messages to customers using standard 10-digit long code phone numbers. It provides better deliverability and higher throughput than regular long codes while maintaining TCPA compliance.

## Why A2P 10DLC?

- **Better Deliverability**: Carriers recognize your messages as legitimate business communication
- **Higher Throughput**: Send 60+ messages per second (vs. 1 msg/sec for unregistered numbers)
- **Carrier Approval**: Reduces filtering and blocking by mobile carriers
- **Compliance**: Meets CTIA and carrier requirements for application messaging

## Timeline

- **Business Registration**: Instant (if you have your EIN ready)
- **Brand Verification**: 1-3 business days
- **Campaign Approval**: 1-2 weeks (can take up to 4 weeks during high volume)
- **Total**: ~2-3 weeks from start to finish

## Costs

| Item | Cost | Frequency |
|------|------|-----------|
| Brand Registration | $4 | Monthly |
| Campaign Registration | $10 | One-time |
| Phone Number | $1.15 | Monthly |
| SMS Messages | $0.0079/msg | Per message |

**Monthly Cost Estimate**: ~$5-10/month + per-message fees

---

## Step 1: Gather Required Information

Before starting, collect the following:

### Business Information
- [ ] Legal business name
- [ ] EIN (Employer Identification Number) or Tax ID
- [ ] Business address
- [ ] Business phone number
- [ ] Business email
- [ ] Business website
- [ ] Business type (LLC, Corporation, Sole Proprietor, etc.)
- [ ] Industry/vertical

### Campaign Information
- [ ] Use case (e.g., "Customer Notifications", "Marketing", "Account Notifications")
- [ ] Sample message templates (2-3 examples of messages you'll send)
- [ ] Estimated monthly message volume
- [ ] Opt-in workflow description (how customers consent to receive messages)

---

## Step 2: Access Twilio Console

1. Log in to your Twilio account at https://console.twilio.com
2. Navigate to **Messaging** → **Regulatory Compliance** → **A2P 10DLC**
3. Click **Get Started** or **Register a Brand**

---

## Step 3: Register Your Business (Brand)

### 3.1 Create a Trust Bundle

A Trust Bundle is a collection of documents that verify your business identity.

1. Go to **Console** → **Account** → **Trust Hub** → **Create Trust Bundle**
2. Select **Primary Business Profile**
3. Fill in your business information:
   - Business name
   - Business type (LLC, Corporation, etc.)
   - EIN/Tax ID
   - Business address
   - Authorized representative name and title

4. Upload supporting documents (if required):
   - Business license
   - Articles of Incorporation
   - Tax documents

5. Click **Submit for Review**

**Timeline**: Instant approval for most businesses

### 3.2 Register Your Brand

1. Navigate to **Messaging** → **Regulatory Compliance** → **A2P 10DLC**
2. Click **Register a Brand**
3. Fill in the registration form:
   - **Business Name**: Legal name from your documents
   - **Tax ID/EIN**: Your business EIN
   - **Business Type**: Choose the appropriate type
   - **Industry**: Select your industry (e.g., "Financial Services", "Automotive")
   - **Website**: Your business website
   - **Regions of Operation**: US
   - **Stock Exchange**: Leave blank if not publicly traded

4. **Estimated Message Volume**:
   - For ExcelCalc: Select **Up to 10,000 messages/day**

5. **Use Case**:
   - Select **Mixed** (since you're sending both transactional and marketing messages)

6. **Opt-In Workflow**:
   - Describe how customers consent:
   ```
   Customers provide explicit consent via checkbox on our website when submitting
   financing inquiries. Consent includes agreement to receive SMS notifications
   about offers and financing information. All messages include opt-out instructions.
   ```

7. Click **Register Brand**

**Cost**: $4/month (auto-billed)

**Timeline**: 1-3 business days for approval

---

## Step 4: Create a Campaign

Once your brand is approved, create a campaign (also called a "use case").

1. Navigate to **A2P 10DLC** → **Campaigns**
2. Click **Create Campaign**
3. Select your registered brand
4. Fill in campaign details:

### Campaign Information

**Campaign Use Case**: Select the best fit (you can create multiple campaigns later)
- **Account Notifications**: For offer updates and transaction confirmations
- **Marketing**: For promotional messages

For ExcelCalc, use **Account Notifications**

**Campaign Description**:
```
Auto financing offer notifications sent to customers who have explicitly opted in
through our website. Messages contain personalized loan offers, payment details,
and links to view full financing terms. Customers can respond to accept/reject
offers or opt out anytime.
```

**Sample Messages** (provide 2-3 examples):

Example 1:
```
Hi [Dealer Name],

[Customer Name] is interested in financing the 2024 Toyota Camry.

Offer Details:
• Monthly Payment: $450.00
• Down Payment: $5,000.00
• Term: 60 months
• APR: 4.99%

View full details: https://excelcalc.com/offers/abc123

Reply ACCEPT or call [Customer Name] to proceed.

Reply STOP to unsubscribe.
```

Example 2:
```
Your financing offer for the 2024 Honda Accord has been updated. Monthly payment:
$425/mo for 72 months at 5.49% APR. View details: https://excelcalc.com/offers/xyz789

Reply STOP to unsubscribe.
```

Example 3:
```
Thank you for contacting ExcelCalc. For immediate assistance, please call us or
visit our website. Reply ACCEPT to accept an offer, REJECT to decline, or STOP
to unsubscribe.
```

**Opt-In Process**:
```
Users provide explicit consent via checkbox labeled "I agree to receive SMS
notifications about financing offers" when submitting contact information on our
website. Consent is recorded with timestamp and IP address in our database before
any messages are sent.
```

**Opt-Out Process**:
```
Every message includes "Reply STOP to unsubscribe" instruction. When users reply
with STOP, their number is immediately added to our opt-out list and no further
messages are sent. Users can also opt out via our website or by contacting support.
```

**Help Keywords**: START, STOP, HELP

**Estimated Message Volume**:
- **Daily**: 10-50 (select **Up to 100**)
- **Monthly**: 300-1,000 (select **Up to 10,000**)

5. Click **Submit Campaign**

**Cost**: $10 one-time fee

**Timeline**: 1-2 weeks for approval (can take up to 4 weeks)

---

## Step 5: Purchase a 10DLC-Capable Phone Number

Once your campaign is approved:

1. Navigate to **Phone Numbers** → **Buy a Number**
2. Filter by:
   - **Country**: United States
   - **Capabilities**: SMS
   - **Number Type**: Local

3. Optional: Search by area code if you want a specific region

4. Click **Buy** on your selected number

**Cost**: $1.15/month

---

## Step 6: Assign Campaign to Phone Number

1. Go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your newly purchased number
3. Scroll to **Messaging Configuration**
4. Under **A2P 10DLC**, click **Assign Campaign**
5. Select your approved campaign
6. Click **Save**

Your number is now registered for A2P 10DLC messaging!

---

## Step 7: Configure Webhook for Incoming Messages

1. In the same phone number configuration page, scroll to **Messaging**
2. Under **A Message Comes In**:
   - Select **Webhook**
   - Enter your webhook URL:
     ```
     https://[YOUR_SUPABASE_PROJECT_ID].supabase.co/functions/v1/sms-webhook
     ```
   - HTTP Method: **POST**

3. Under **Status Callbacks** (optional but recommended):
   - Check **Use GEOGRAPHIC_PERMISSIONS_WEBHOOK**
   - Enter the same webhook URL

4. Click **Save**

**Note**: For local testing, see [WEBHOOK_TESTING_GUIDE.md](./WEBHOOK_TESTING_GUIDE.md)

---

## Step 8: Update Environment Variables

Add your Twilio credentials to your `.env` file:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your new 10DLC number

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Security**: Never commit your `.env` file to git. Add it to `.gitignore`.

---

## Step 9: Deploy Database Migration

Run the migration to create the opt-in/opt-out tracking table:

```bash
# If using Supabase CLI
supabase db push

# Or apply the migration manually in Supabase Dashboard → SQL Editor
# Copy contents of: supabase/migrations/20251109_create_sms_opt_status.sql
```

---

## Step 10: Deploy Edge Functions

Deploy the SMS webhook and updated send-sms functions:

```bash
# Deploy sms-webhook function
supabase functions deploy sms-webhook --no-verify-jwt

# Deploy updated send-sms function
supabase functions deploy send-sms --no-verify-jwt

# Set environment secrets
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token_here
supabase secrets set TWILIO_PHONE_NUMBER=+1234567890
```

---

## Step 11: Test Your Setup

See [WEBHOOK_TESTING_GUIDE.md](./WEBHOOK_TESTING_GUIDE.md) for detailed testing instructions.

### Quick Test Checklist

1. **Test Opt-In**:
   - Manually insert a test phone number with opt-in status in database
   - Send a test SMS via your application
   - Verify message is received with "Reply STOP to unsubscribe"

2. **Test Opt-Out**:
   - Reply "STOP" to the test message
   - Verify opt-out confirmation is received
   - Try sending another message - should be blocked

3. **Test Opt-In**:
   - Reply "START" to re-subscribe
   - Verify confirmation is received
   - Send another test message - should go through

4. **Test Offer Response**:
   - Reply "ACCEPT" to a test offer
   - Verify database shows offer status updated to "accepted"

---

## Monitoring and Maintenance

### Check Campaign Status

1. Navigate to **Messaging** → **Regulatory Compliance** → **A2P 10DLC**
2. View your campaign status and any issues

### Monitor Message Delivery

1. Go to **Monitor** → **Logs** → **Messaging**
2. View all sent messages, delivery status, and errors

### View Opt-Out List

Query your database:

```sql
SELECT phone_number, opt_out_date, notes
FROM sms_opt_status
WHERE opt_in_status = false
ORDER BY opt_out_date DESC;
```

### Monthly Costs

- Track costs in **Console** → **Billing** → **Usage**
- Set up billing alerts to avoid surprises

---

## Troubleshooting

### Campaign Rejected

If your campaign is rejected:
1. Review the rejection reason in Twilio Console
2. Common issues:
   - Vague use case description (be specific!)
   - Missing sample messages
   - Unclear opt-in/opt-out process
3. Edit your campaign with more details and resubmit

### Messages Not Delivering

1. Check message logs in Twilio Console
2. Common issues:
   - Number not registered to campaign (assign in Step 6)
   - Recipient opted out (check `sms_opt_status` table)
   - Invalid phone number format (must be E.164: +1234567890)

### Webhook Not Receiving Messages

1. Verify webhook URL is correctly configured
2. Check Supabase function logs:
   ```bash
   supabase functions logs sms-webhook
   ```
3. Test with ngrok (see testing guide)

---

## Additional Resources

- **Twilio A2P 10DLC Overview**: https://www.twilio.com/docs/sms/a2p-10dlc
- **TCPA Compliance Guide**: https://www.twilio.com/docs/sms/compliance
- **Campaign Registration Best Practices**: https://www.twilio.com/docs/sms/a2p-10dlc/campaign-registration-best-practices
- **Twilio Messaging Policy**: https://www.twilio.com/legal/messaging-policy

---

## Need Help?

- **Twilio Support**: https://support.twilio.com
- **ExcelCalc Internal Docs**: See project documentation
- **Legal/Compliance Questions**: Consult with legal counsel for TCPA compliance advice
