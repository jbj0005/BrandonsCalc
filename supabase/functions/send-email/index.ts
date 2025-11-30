import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mailtrap Configuration (consistent with server/server.js)
const MAILTRAP_TOKEN = Deno.env.get('MAILTRAP_TOKEN') || Deno.env.get('MAILTRAP_DEMO_TOKEN') || '';
const EMAIL_FROM = Deno.env.get('MAILTRAP_FROM_EMAIL') || Deno.env.get('EMAIL_FROM') || 'sandbox@mailtrap.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  offerId?: string;
  recipientEmail: string;
  recipientName?: string;
  offerText?: string;
  vehicleInfo?: string;
  shareUrl?: string;
  listingUrl?: string;
  photoUrl?: string;
  share?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Validate required environment variables
    if (!MAILTRAP_TOKEN) {
      throw new Error('MAILTRAP_TOKEN environment variable not set');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase environment variables not set');
    }

    // Parse request body
    const {
      offerId,
      recipientEmail,
      recipientName,
      offerText,
      vehicleInfo,
      shareUrl,
      listingUrl,
      photoUrl,
      share,
    }: EmailRequest = await req.json();

    const isShare = Boolean(shareUrl || share);

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: recipientEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isShare && !offerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: offerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Provide defaults
    const finalOfferText = offerText && offerText.trim()
      ? offerText
      : isShare
        ? `Shared vehicle link: ${shareUrl || ''}${listingUrl ? `\nListing URL: ${listingUrl}` : ''}`
        : 'Thank you for your vehicle offer submission. A dealer representative will review your offer and contact you shortly.';

    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build email subject and body (share vs offer)
    const subject = isShare
      ? vehicleInfo
        ? `Vehicle shared with you: ${vehicleInfo}`
        : "A vehicle was shared with you"
      : vehicleInfo
      ? `Your Vehicle Offer - ${vehicleInfo}`
      : "Your Vehicle Offer";

    const greeting = `Hello ${recipientName || "there"},`;

    const htmlContent = isShare
      ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #e5e7eb; background:#0b1221; max-width: 640px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%); padding: 28px; border-radius: 16px 16px 0 0; text-align: left; color: #0b1221;">
    <div style="font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700;">Shared Vehicle</div>
    <div style="font-size: 26px; font-weight: 800; margin-top: 6px;">${vehicleInfo || "Vehicle shared with you"}</div>
  </div>

  <div style="background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-top: none; border-radius: 0 0 16px 16px; padding: 24px;">
    <p style="margin: 0 0 12px 0; color: #cbd5e1; font-size: 15px;">${greeting}</p>
    <p style="margin: 0 0 16px 0; color: #94a3b8; font-size: 15px;">A vehicle was shared with you. Open it below:</p>

    ${photoUrl ? `<div style="margin: 12px 0 16px 0;"><img src="${photoUrl}" alt="${vehicleInfo || "Shared vehicle"}" style="width:100%; border-radius:12px; box-shadow:0 12px 30px rgba(0,0,0,0.35);"></div>` : ""}

    <div style="margin: 12px 0 16px 0;">
      <a href="${shareUrl}" style="display:inline-block; padding:12px 18px; background:#22c55e; color:#0b1221; text-decoration:none; border-radius:10px; font-weight:700;">Open in Brandon's Calculator</a>
    </div>

    <div style="background:#0b1221; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:14px; color:#cbd5e1; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap;">${shareUrl}</div>

    ${
      listingUrl
        ? `<div style="margin-top:16px;">
            <div style="color:#cbd5e1; font-weight:700; margin-bottom:6px;">Full listing & photos</div>
            <div style="background:#0b1221; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px; color:#38bdf8; font-size:13px; word-break:break-all; font-family:'Courier New', monospace;">${listingUrl}</div>
          </div>`
        : ""
    }

    <p style="color:#64748b; font-size:13px; margin-top:20px;">Shared via Brandon's Calculator</p>
  </div>
</body>
</html>
      `.trim()
      : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Your Vehicle Offer</h1>
    ${vehicleInfo ? `<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${vehicleInfo}</p>` : ''}
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Hello ${recipientName || 'there'},</h2>

    <p style="color: #4b5563; font-size: 16px;">
      Thank you for submitting your vehicle offer through Brandon's Calculator. Here are the details:
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; overflow-x: auto;">${finalOfferText}</div>

    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #1e40af; font-size: 14px;">
        <strong>What happens next?</strong><br>
        A dealer will review your offer and typically responds within the hour. They may contact you via phone or email to discuss next steps.
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have any questions or need to make changes to your offer, please reply to this email.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
      Generated by <strong>Brandon's Calculator</strong><br>
      Your trusted auto financing calculator
    </p>
  </div>
</body>
</html>
      `.trim();

    const textContent = isShare
      ? `
${greeting}

${vehicleInfo ? `${vehicleInfo}\n` : ""}Shared vehicle link:
${shareUrl || ""}

${listingUrl ? `Listing URL:\n${listingUrl}\n` : ""}${photoUrl ? `Photo: ${photoUrl}\n` : ""}`.trim()
      : `
Hello ${recipientName || 'there'},

Thank you for submitting your vehicle offer through Brandon's Calculator.

${vehicleInfo ? `Vehicle: ${vehicleInfo}\n` : ''}
Your Offer Details:
${finalOfferText}

What happens next?
A dealer will review your offer and typically responds within the hour. They may contact you via phone or email to discuss next steps.

If you have any questions or need to make changes to your offer, please reply to this email.

---
Generated by Brandon's Calculator
Your trusted auto financing calculator
    `.trim();

    // Send email via Mailtrap API (consistent with server/server.js)
    const mailtrapResponse = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAILTRAP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: {
          email: EMAIL_FROM,
          name: "Brandon's Calculator"
        },
        to: [{ email: recipientEmail, name: recipientName || recipientEmail }],
        subject: subject,
        text: textContent,
        html: htmlContent,
        category: isShare ? 'shared-vehicle' : 'offer-confirmation'
      })
    });

    // Extract Mailtrap response
    let messageId = null;
    let errorMessage = null;
    const mailtrapStatus = mailtrapResponse.ok;

    if (mailtrapStatus) {
      const responseData = await mailtrapResponse.json();
      messageId = responseData?.message_ids?.[0] || null;
    } else {
      errorMessage = await mailtrapResponse.text();
      console.error('Mailtrap API error:', errorMessage);
    }

    // Log to email_logs table
    const { error: logError } = await supabase.from('email_logs').insert({
      offer_id: offerId || null,
      recipient_email: recipientEmail,
      recipient_name: recipientName || null,
      subject: subject,
      status: mailtrapStatus ? 'sent' : 'failed',
      mailtrap_message_id: messageId,
      error_message: errorMessage,
      sent_at: mailtrapStatus ? new Date().toISOString() : null,
    });

    if (logError) {
      console.error('Error logging email send:', logError);
      // Don't fail the request if logging fails
    }

    // Update offer status to 'sent' if email succeeded
    if (mailtrapStatus && !isShare && offerId) {
      const { error: updateError } = await supabase
        .from('customer_offers')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', offerId);

      if (updateError) {
        console.error('Error updating offer status:', updateError);
        // Don't fail the request if status update fails
      }
    }

    // Return success/failure response
    return new Response(
      JSON.stringify({
        success: mailtrapStatus,
        messageId: messageId,
        error: errorMessage
      }),
      {
        status: mailtrapStatus ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Unexpected error in send-email function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
