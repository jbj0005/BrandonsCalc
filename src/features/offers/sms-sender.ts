// src/features/offers/sms-sender.ts

import { supabase, formatPhoneForSMS } from '@/lib/supabase';
import { useOfferStore } from '@/core/state';
import type { SendSMSRequest, APIResponse } from '@/types';

/**
 * SMS Sender
 * Handles sending offers via SMS using Twilio through Supabase Edge Functions
 */
export class SMSSender {
  /**
   * Send offer via SMS
   */
  public static async sendOffer(request: SendSMSRequest): Promise<APIResponse<any>> {
    try {
      
      // Validate phone number
      if (!request.dealerPhone) {
        throw new Error('Dealer phone number is required');
      }
      
      // Format phone number
      const formattedPhone = formatPhoneForSMS(request.dealerPhone);
      
      // Prepare request data
      const smsData = {
        to: formattedPhone,
        dealerName: request.dealerName,
        customerName: request.customerName,
        vehicle: request.vehicle,
        offer: {
          monthlyPayment: request.monthlyPayment,
          downPayment: request.downPayment,
          term: request.term,
          apr: request.apr,
          totalPrice: request.totalPrice || 0
        },
        message: request.message,
        offerUrl: request.offerUrl || this.generateOfferUrl()
      };
      
      // Call Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: smsData
      });
      
      if (error) {
        throw error;
      }
      
      // Log success
      
      // Update offer status if we have a current offer
      const offerStore = useOfferStore.getState();
      if (offerStore.currentOffer?.id) {
        await this.updateOfferStatus(offerStore.currentOffer.id, 'sent');
      }
      
      return {
        success: true,
        data: data
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      };
    }
  }
  
  /**
   * Send bulk SMS to multiple dealers
   */
  public static async sendBulkOffers(
    dealers: Array<{ phone: string; name: string }>,
    request: Omit<SendSMSRequest, 'dealerPhone' | 'dealerName'>
  ): Promise<APIResponse<any>> {
    const results = {
      sent: [] as string[],
      failed: [] as { phone: string; error: string }[]
    };
    
    for (const dealer of dealers) {
      const result = await this.sendOffer({
        ...request,
        dealerPhone: dealer.phone,
        dealerName: dealer.name
      });
      
      if (result.success) {
        results.sent.push(dealer.phone);
      } else {
        results.failed.push({
          phone: dealer.phone,
          error: result.error || 'Unknown error'
        });
      }
      
      // Add delay to avoid rate limiting
      await this.delay(1000);
    }
    
    return {
      success: results.failed.length === 0,
      data: results,
      error: results.failed.length > 0 
        ? `Failed to send to ${results.failed.length} dealer(s)` 
        : undefined
    };
  }
  
  /**
   * Send follow-up SMS
   */
  public static async sendFollowUp(
    dealerPhone: string,
    dealerName: string,
    message: string
  ): Promise<APIResponse<any>> {
    try {
      const formattedPhone = formatPhoneForSMS(dealerPhone);
      
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          to: formattedPhone,
          dealerName,
          message,
          isFollowUp: true
        }
      });
      
      if (error) throw error;
      
      return {
        success: true,
        data
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send follow-up SMS'
      };
    }
  }
  
  /**
   * Get SMS status/delivery report
   */
  public static async getSMSStatus(messageSid: string): Promise<APIResponse<any>> {
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .eq('message_sid', messageSid)
        .single();
      
      if (error) throw error;
      
      return {
        success: true,
        data
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get SMS status'
      };
    }
  }
  
  /**
   * Get SMS history for an offer
   */
  public static async getSMSHistory(offerId: string): Promise<APIResponse<any>> {
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .eq('offer_id', offerId)
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      
      return {
        success: true,
        data
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get SMS history'
      };
    }
  }
  
  /**
   * Format SMS message content
   */
  public static formatSMSMessage(request: SendSMSRequest): string {
    const { 
      dealerName, 
      customerName, 
      vehicle, 
      monthlyPayment, 
      downPayment, 
      term, 
      apr,
      message 
    } = request;
    
    let smsBody = `Hi ${dealerName},\n\n`;
    smsBody += `${customerName} is interested in financing the ${vehicle}.\n\n`;
    smsBody += `Offer Details:\n`;
    smsBody += `• Monthly Payment: $${monthlyPayment.toFixed(2)}\n`;
    smsBody += `• Down Payment: $${downPayment.toFixed(2)}\n`;
    smsBody += `• Term: ${term} months\n`;
    smsBody += `• APR: ${apr.toFixed(2)}%\n`;
    
    if (message) {
      smsBody += `\nNotes: ${message}\n`;
    }
    
    smsBody += `\nReply ACCEPT or call ${customerName} to proceed.`;
    
    return smsBody;
  }
  
  /**
   * Validate phone number
   */
  public static validatePhoneNumber(phone: string): boolean {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Check if it's a valid US phone number (10 or 11 digits)
    return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
  }
  
  /**
   * Generate offer URL
   */
  private static generateOfferUrl(): string {
    const offerStore = useOfferStore.getState();
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    
    if (offerStore.currentOffer?.share_token) {
      return `${baseUrl}/offer/${offerStore.currentOffer.share_token}`;
    }
    
    return baseUrl;
  }
  
  /**
   * Update offer status
   */
  private static async updateOfferStatus(
    offerId: string, 
    status: 'sent' | 'viewed' | 'accepted' | 'rejected'
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('customer_offers')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', offerId);
      
      if (error) {
        // Failed to update offer status
      }
    } catch (error) {
      // Error updating offer status
    }
  }
  
  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Send test SMS (for development)
   */
  public static async sendTestSMS(phone: string): Promise<APIResponse<any>> {
    return this.sendOffer({
      dealerPhone: phone,
      dealerName: 'Test Dealer',
      customerName: 'Test Customer',
      vehicle: '2024 Test Vehicle',
      monthlyPayment: 599.99,
      downPayment: 5000,
      term: 72,
      apr: 4.99,
      message: 'This is a test SMS from ExcelCalc'
    });
  }
}

// Export for use in app.js
export default SMSSender;
