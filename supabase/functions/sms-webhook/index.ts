// supabase/functions/sms-webhook/index.ts
//
// Twilio Incoming SMS Webhook Handler
// Receives HTTP POST requests from Twilio when SMS messages are sent to your number
// Handles: STOP/UNSUBSCRIBE, START/SUBSCRIBE, offer responses (ACCEPT/REJECT), and general inquiries

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ============================================================================
// Environment Configuration
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Supabase client with service role (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Twilio Request Interface
// Twilio sends these parameters in the POST body (application/x-www-form-urlencoded)
// ============================================================================

interface TwilioIncomingMessage {
  MessageSid: string;       // Unique message identifier
  From: string;             // Sender's phone number (E.164 format)
  To: string;               // Your Twilio number
  Body: string;             // Message content
  NumMedia: string;         // Number of media attachments
  FromCity?: string;
  FromState?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToCountry?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize phone number to E.164 format
 * Removes all non-digit characters except leading +
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all characters except digits and leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If no +, assume US number and add +1
  if (!normalized.startsWith('+')) {
    normalized = '+1' + normalized;
  }

  return normalized;
}

/**
 * Generate TwiML response (XML format Twilio expects)
 * @param message - Optional reply message to send back to user
 */
function generateTwiMLResponse(message?: string): string {
  if (message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
  }

  // Empty response (no auto-reply)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;
}

/**
 * Escape XML special characters for TwiML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse Twilio form data from request
 */
async function parseTwilioRequest(req: Request): Promise<TwilioIncomingMessage> {
  const formData = await req.formData();

  return {
    MessageSid: formData.get('MessageSid') as string,
    From: formData.get('From') as string,
    To: formData.get('To') as string,
    Body: formData.get('Body') as string,
    NumMedia: formData.get('NumMedia') as string || '0',
    FromCity: formData.get('FromCity') as string || undefined,
    FromState: formData.get('FromState') as string || undefined,
    FromCountry: formData.get('FromCountry') as string || undefined,
    ToCity: formData.get('ToCity') as string || undefined,
    ToState: formData.get('ToState') as string || undefined,
    ToCountry: formData.get('ToCountry') as string || undefined,
  };
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle STOP/UNSUBSCRIBE requests (REQUIRED by TCPA)
 * Updates opt-out status in database
 */
async function handleOptOut(phoneNumber: string): Promise<string> {
  console.log(`[OPT-OUT] Processing opt-out request from: ${phoneNumber}`);

  try {
    // Call database function to record opt-out
    const { data, error } = await supabase.rpc('record_opt_out', {
      p_phone_number: phoneNumber,
      p_notes: 'Opted out via SMS reply'
    });

    if (error) {
      console.error('[OPT-OUT] Database error:', error);
      throw error;
    }

    console.log(`[OPT-OUT] Successfully opted out: ${phoneNumber}`);

    // Return confirmation message (required by Twilio)
    return 'You have been unsubscribed from ExcelCalc messages. Reply START to resubscribe.';
  } catch (error) {
    console.error('[OPT-OUT] Error processing opt-out:', error);
    return 'Error processing your request. Please contact support.';
  }
}

/**
 * Handle START/SUBSCRIBE requests
 * Re-enables messaging for previously opted-out numbers
 */
async function handleOptIn(phoneNumber: string): Promise<string> {
  console.log(`[OPT-IN] Processing opt-in request from: ${phoneNumber}`);

  try {
    // Call database function to record opt-in
    const { data, error } = await supabase.rpc('record_opt_in', {
      p_phone_number: phoneNumber,
      p_consent_method: 'sms_reply_start',
      p_consent_ip: null,
      p_source: 'sms_webhook'
    });

    if (error) {
      console.error('[OPT-IN] Database error:', error);
      throw error;
    }

    console.log(`[OPT-IN] Successfully opted in: ${phoneNumber}`);

    return 'You are now subscribed to ExcelCalc messages. Reply STOP to unsubscribe.';
  } catch (error) {
    console.error('[OPT-IN] Error processing opt-in:', error);
    return 'Error processing your request. Please contact support.';
  }
}

/**
 * Handle offer response (ACCEPT/REJECT/INTERESTED)
 * Updates offer status in database
 */
async function handleOfferResponse(phoneNumber: string, response: string): Promise<string> {
  const normalizedResponse = response.toUpperCase().trim();
  console.log(`[OFFER-RESPONSE] Processing response from ${phoneNumber}: ${normalizedResponse}`);

  try {
    // Determine new offer status based on response
    let newStatus: string;
    let replyMessage: string;

    if (normalizedResponse.includes('ACCEPT')) {
      newStatus = 'accepted';
      replyMessage = 'Thank you! Your acceptance has been recorded. A representative will contact you shortly.';
    } else if (normalizedResponse.includes('REJECT')) {
      newStatus = 'rejected';
      replyMessage = 'Thank you for your response. Your decision has been recorded.';
    } else if (normalizedResponse.includes('INTEREST')) {
      newStatus = 'viewed'; // Mark as interested/viewed
      replyMessage = 'Thank you for your interest! A representative will reach out with more details.';
    } else {
      return 'Thank you for your message. Please reply with ACCEPT, REJECT, or INTERESTED.';
    }

    // Find most recent offer sent to this phone number
    const { data: recentOffer, error: findError } = await supabase
      .from('customer_offers')
      .select('id, status, vehicle_make, vehicle_model')
      .or(`customer_phone.eq.${phoneNumber},dealer_phone.eq.${phoneNumber}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (findError || !recentOffer) {
      console.log(`[OFFER-RESPONSE] No recent offer found for: ${phoneNumber}`);
      return 'No recent offer found. Please contact us directly for assistance.';
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from('customer_offers')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', recentOffer.id);

    if (updateError) {
      console.error('[OFFER-RESPONSE] Error updating offer:', updateError);
      throw updateError;
    }

    console.log(`[OFFER-RESPONSE] Updated offer ${recentOffer.id} to status: ${newStatus}`);

    return replyMessage;
  } catch (error) {
    console.error('[OFFER-RESPONSE] Error processing offer response:', error);
    return 'Error processing your response. Please contact support.';
  }
}

/**
 * Handle general inquiries and unknown messages
 * Provides helpful auto-response
 */
async function handleGeneralInquiry(phoneNumber: string, messageBody: string): Promise<string> {
  console.log(`[GENERAL] Inquiry from ${phoneNumber}: ${messageBody.substring(0, 50)}...`);

  // Log the inquiry for manual follow-up
  const { error } = await supabase
    .from('sms_logs')
    .insert({
      to_phone: Deno.env.get('TWILIO_PHONE_NUMBER') || '',
      from_phone: phoneNumber,
      status: 'received',
      error_message: `General inquiry: ${messageBody}`,
      sent_at: new Date().toISOString()
    });

  if (error) {
    console.error('[GENERAL] Error logging inquiry:', error);
  }

  // Auto-response with helpful information
  return `Thank you for contacting ExcelCalc. For immediate assistance, please call us or visit our website. Reply with:
• ACCEPT - to accept an offer
• REJECT - to decline an offer
• STOP - to unsubscribe`;
}

// ============================================================================
// Main Request Handler
// ============================================================================

serve(async (req) => {
  console.log('[WEBHOOK] Received incoming SMS webhook request');

  // Only accept POST requests from Twilio
  if (req.method !== 'POST') {
    console.log('[WEBHOOK] Invalid method:', req.method);
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Parse Twilio request
    const twilioData = await parseTwilioRequest(req);

    console.log('[WEBHOOK] Incoming message:', {
      from: twilioData.From,
      to: twilioData.To,
      body: twilioData.Body,
      sid: twilioData.MessageSid
    });

    // Normalize phone number
    const phoneNumber = normalizePhoneNumber(twilioData.From);
    const messageBody = twilioData.Body.trim();
    const messageUpper = messageBody.toUpperCase();

    // Route message based on content
    let replyMessage: string;

    // Priority 1: Handle opt-out requests (REQUIRED by law)
    if (
      messageUpper === 'STOP' ||
      messageUpper === 'STOPALL' ||
      messageUpper === 'UNSUBSCRIBE' ||
      messageUpper === 'CANCEL' ||
      messageUpper === 'END' ||
      messageUpper === 'QUIT'
    ) {
      replyMessage = await handleOptOut(phoneNumber);
    }
    // Priority 2: Handle opt-in requests
    else if (
      messageUpper === 'START' ||
      messageUpper === 'SUBSCRIBE' ||
      messageUpper === 'UNSTOP'
    ) {
      replyMessage = await handleOptIn(phoneNumber);
    }
    // Priority 3: Handle offer responses
    else if (
      messageUpper.includes('ACCEPT') ||
      messageUpper.includes('REJECT') ||
      messageUpper.includes('INTEREST')
    ) {
      replyMessage = await handleOfferResponse(phoneNumber, messageBody);
    }
    // Priority 4: Handle general inquiries
    else {
      replyMessage = await handleGeneralInquiry(phoneNumber, messageBody);
    }

    // Generate TwiML response
    const twimlResponse = generateTwiMLResponse(replyMessage);

    console.log('[WEBHOOK] Sending TwiML response');

    // Return TwiML response to Twilio
    return new Response(twimlResponse, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });

  } catch (error: any) {
    console.error('[WEBHOOK] Error processing incoming message:', error);

    // Return error TwiML response
    const errorTwiML = generateTwiMLResponse(
      'We encountered an error processing your message. Please try again or contact support.'
    );

    return new Response(errorTwiML, {
      status: 200, // Still return 200 to Twilio
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
});
