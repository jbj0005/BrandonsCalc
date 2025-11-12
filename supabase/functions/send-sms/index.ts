// supabase/functions/send-sms/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Twilio configuration from environment variables
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!;

// Supabase configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSOfferRequest {
  to: string;
  dealerName: string;
  customerName: string;
  vehicle?: string;
  offer?: {
    monthlyPayment: number;
    downPayment: number;
    term: number;
    apr: number;
    totalPrice?: number;
  };
  message?: string;
  offerUrl?: string;
  offerId?: string;
  isFollowUp?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const requestData = await req.json() as SMSOfferRequest;

    // Validate required fields
    if (!requestData.to || !requestData.dealerName) {
      throw new Error('Missing required fields: to and dealerName');
    }

    // ========================================================================
    // COMPLIANCE CHECK: Verify recipient has opted in
    // ========================================================================
    const normalizedPhone = requestData.to.replace(/[^\d+]/g, '');
    const phoneToCheck = normalizedPhone.startsWith('+') ? normalizedPhone : `+1${normalizedPhone}`;

    console.log(`[COMPLIANCE] Checking opt-in status for: ${phoneToCheck}`);

    // Check if phone number is opted in
    const { data: isOptedIn, error: optCheckError } = await supabase.rpc('is_phone_opted_in', {
      p_phone_number: phoneToCheck
    });

    if (optCheckError) {
      console.error('[COMPLIANCE] Error checking opt-in status:', optCheckError);
      // Allow sending on error (fail open) but log the issue
      console.warn('[COMPLIANCE] Proceeding with send despite check error');
    } else if (isOptedIn === false) {
      console.error(`[COMPLIANCE] Blocked: ${phoneToCheck} has opted out or never opted in`);
      throw new Error('Recipient has opted out of SMS messages or has not provided consent');
    }

    console.log(`[COMPLIANCE] ✓ Opt-in verified for: ${phoneToCheck}`);

    // Format SMS message
    let smsBody = '';
    
    if (requestData.isFollowUp) {
      // Follow-up message
      smsBody = requestData.message || 'Following up on the vehicle financing offer.';
    } else if (requestData.offer) {
      // Full offer message
      const { vehicle, customerName, offer, message, offerUrl } = requestData;
      
      smsBody = `Hi ${requestData.dealerName},\n\n`;
      
      if (customerName) {
        smsBody += `${customerName} is interested in financing`;
        if (vehicle) {
          smsBody += ` the ${vehicle}`;
        }
        smsBody += `.\n\n`;
      }
      
      smsBody += `Offer Details:\n`;
      smsBody += `• Monthly Payment: $${offer.monthlyPayment.toFixed(2)}\n`;
      smsBody += `• Down Payment: $${offer.downPayment.toFixed(2)}\n`;
      smsBody += `• Term: ${offer.term} months\n`;
      smsBody += `• APR: ${offer.apr.toFixed(2)}%\n`;
      
      if (offer.totalPrice) {
        smsBody += `• Total Price: $${offer.totalPrice.toFixed(2)}\n`;
      }
      
      if (message) {
        smsBody += `\nNotes: ${message}\n`;
      }
      
      if (offerUrl) {
        smsBody += `\nView full details: ${offerUrl}\n`;
      }
      
      smsBody += `\nReply ACCEPT or call ${customerName || 'the customer'} to proceed.`;
    } else {
      // Simple message
      smsBody = requestData.message || 'You have a new offer from ExcelCalc.';
    }

    // ========================================================================
    // COMPLIANCE: Add required opt-out instructions (REQUIRED by TCPA)
    // ========================================================================
    smsBody += '\n\nFrom Brandon\'s Calculator. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt-out.';

    // Send SMS via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: requestData.to,
        From: TWILIO_PHONE_NUMBER,
        Body: smsBody,
      }),
    });

    const twilioData = await twilioResponse.json();
    
    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioData);
      throw new Error(twilioData.message || 'Failed to send SMS');
    }


    // Log to database
    const logEntry = {
      offer_id: requestData.offerId || null,
      message_sid: twilioData.sid,
      to_phone: requestData.to,
      from_phone: TWILIO_PHONE_NUMBER,
      dealer_name: requestData.dealerName,
      customer_name: requestData.customerName || null,
      status: twilioData.status || 'sent',
      sent_at: new Date().toISOString(),
    };

    const { error: logError } = await supabase
      .from('sms_logs')
      .insert(logEntry);

    if (logError) {
      console.error('Failed to log SMS:', logError);
      // Don't throw - SMS was still sent successfully
    }

    // ========================================================================
    // COMPLIANCE: Record message sent (update opt-in status tracking)
    // ========================================================================
    const { error: recordError } = await supabase.rpc('record_message_sent', {
      p_phone_number: phoneToCheck
    });

    if (recordError) {
      console.error('[COMPLIANCE] Error recording message sent:', recordError);
      // Don't throw - SMS was still sent successfully
    }

    // Update offer status if offerId provided
    if (requestData.offerId) {
      const { error: offerError } = await supabase
        .from('customer_offers')
        .update({ 
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', requestData.offerId);

      if (offerError) {
        console.error('Failed to update offer status:', offerError);
        // Don't throw - SMS was still sent successfully
      }
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        messageId: twilioData.sid,
        status: twilioData.status,
        to: twilioData.to,
        from: twilioData.from,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error in send-sms function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to send SMS',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
