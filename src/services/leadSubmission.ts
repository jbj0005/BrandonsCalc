/**
 * Lead Submission Service
 * Submits customer offers to Supabase
 */

import { supabase } from '../lib/supabase';

export interface LeadData {
  // Vehicle details
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
  vehicleVIN?: string;
  vehicleMileage?: number;
  vehicleCondition?: 'new' | 'used';
  vehiclePrice?: number;

  // Dealer details
  dealerName?: string;
  dealerPhone?: string;
  dealerAddress?: string;

  // Financing details
  apr?: number;
  termMonths?: number;
  monthlyPayment?: number;
  downPayment?: number;

  // Trade-in details
  tradeValue?: number;
  tradePayoff?: number;

  // Fees and addons
  dealerFees?: number;
  customerAddons?: number;

  // Customer details
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;

  // Offer text for email
  offerText?: string;
  offerName?: string;
}

/**
 * Submit lead to Supabase customer_offers table
 */
export const submitLead = async (leadData: LeadData): Promise<{ ok: boolean; offerId?: string; error?: string }> => {
  try {
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return {
        ok: false,
        error: 'You must be signed in to submit an offer',
      };
    }

    // Generate offer name if not provided
    const offerName = leadData.offerName || `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''}`.trim() || 'Vehicle Offer';

    // Prepare data for insertion
    const offerData = {
      user_id: session.user.id,
      offer_name: offerName,
      status: 'active',

      // Vehicle details
      vehicle_year: leadData.vehicleYear || null,
      vehicle_make: leadData.vehicleMake || null,
      vehicle_model: leadData.vehicleModel || null,
      vehicle_trim: leadData.vehicleTrim || null,
      vehicle_vin: leadData.vehicleVIN || null,
      vehicle_mileage: leadData.vehicleMileage || null,
      vehicle_condition: leadData.vehicleCondition || null,
      vehicle_price: leadData.vehiclePrice || null,

      // Dealer details
      dealer_name: leadData.dealerName || null,
      dealer_phone: leadData.dealerPhone || null,
      dealer_address: leadData.dealerAddress || null,

      // Financing details
      apr: leadData.apr || null,
      term_months: leadData.termMonths || null,
      monthly_payment: leadData.monthlyPayment || null,
      down_payment: leadData.downPayment || null,

      // Trade-in
      trade_value: leadData.tradeValue || null,
      trade_payoff: leadData.tradePayoff || null,

      // Fees
      dealer_fees: leadData.dealerFees || null,
      customer_addons: leadData.customerAddons || null,

      // Customer info
      customer_name: leadData.customerName || null,
      customer_email: leadData.customerEmail || null,
      customer_phone: leadData.customerPhone || null,

      // Offer text
      offer_text: leadData.offerText || null,

      submitted_at: new Date().toISOString(),
    };

    console.log('[LeadSubmission] Submitting offer to Supabase:', offerName);

    const { data, error } = await supabase
      .from('customer_offers')
      .insert(offerData)
      .select('id')
      .single();

    if (error) {
      console.error('[LeadSubmission] Supabase error:', error);
      return {
        ok: false,
        error: error.message || 'Failed to submit offer',
      };
    }

    console.log('[LeadSubmission] Offer submitted successfully. ID:', data.id);

    return {
      ok: true,
      offerId: data.id,
    };
  } catch (error: any) {
    console.error('[LeadSubmission] Unexpected error:', error);
    return {
      ok: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
};

/**
 * Generate offer text summary for email/display
 */
export const generateOfferText = (leadData: LeadData): string => {
  const lines: string[] = [];

  // Title
  lines.push('VEHICLE OFFER SUMMARY');
  lines.push('═'.repeat(50));
  lines.push('');

  // Vehicle Info
  if (leadData.vehicleYear || leadData.vehicleMake || leadData.vehicleModel) {
    lines.push('VEHICLE DETAILS');
    lines.push('-'.repeat(50));
    const vehicle = `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''} ${leadData.vehicleTrim || ''}`.trim();
    lines.push(`Vehicle:           ${vehicle}`);
    if (leadData.vehicleVIN) lines.push(`VIN:               ${leadData.vehicleVIN}`);
    if (leadData.vehicleMileage) lines.push(`Mileage:           ${leadData.vehicleMileage.toLocaleString()} miles`);
    if (leadData.vehicleCondition) lines.push(`Condition:         ${leadData.vehicleCondition.charAt(0).toUpperCase() + leadData.vehicleCondition.slice(1)}`);
    if (leadData.vehiclePrice) lines.push(`Asking Price:      $${leadData.vehiclePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push('');
  }

  // Dealer Info
  if (leadData.dealerName) {
    lines.push('DEALER INFORMATION');
    lines.push('-'.repeat(50));
    lines.push(`Dealer:            ${leadData.dealerName}`);
    if (leadData.dealerPhone) lines.push(`Phone:             ${leadData.dealerPhone}`);
    if (leadData.dealerAddress) lines.push(`Address:           ${leadData.dealerAddress}`);
    lines.push('');
  }

  // Financing Details
  if (leadData.monthlyPayment || leadData.apr || leadData.termMonths) {
    lines.push('FINANCING DETAILS');
    lines.push('-'.repeat(50));
    if (leadData.monthlyPayment) lines.push(`Monthly Payment:   $${leadData.monthlyPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (leadData.apr) lines.push(`APR:               ${leadData.apr.toFixed(2)}%`);
    if (leadData.termMonths) lines.push(`Term:              ${leadData.termMonths} months (${(leadData.termMonths / 12).toFixed(1)} years)`);
    if (leadData.downPayment) lines.push(`Down Payment:      $${leadData.downPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push('');
  }

  // Trade-in
  if (leadData.tradeValue || leadData.tradePayoff) {
    lines.push('TRADE-IN DETAILS');
    lines.push('-'.repeat(50));
    if (leadData.tradeValue) lines.push(`Trade-in Value:    $${leadData.tradeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (leadData.tradePayoff) lines.push(`Trade Payoff:      $${leadData.tradePayoff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const tradeEquity = (leadData.tradeValue || 0) - (leadData.tradePayoff || 0);
    if (leadData.tradeValue || leadData.tradePayoff) {
      lines.push(`Trade Equity:      ${tradeEquity >= 0 ? '' : '-'}$${Math.abs(tradeEquity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    lines.push('');
  }

  // Fees & Addons
  if (leadData.dealerFees || leadData.customerAddons) {
    lines.push('FEES & ADDONS');
    lines.push('-'.repeat(50));
    if (leadData.dealerFees) lines.push(`Dealer Fees:       $${leadData.dealerFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (leadData.customerAddons) lines.push(`Customer Addons:   $${leadData.customerAddons.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push('');
  }

  // Customer Info
  if (leadData.customerName || leadData.customerEmail || leadData.customerPhone) {
    lines.push('CUSTOMER INFORMATION');
    lines.push('-'.repeat(50));
    if (leadData.customerName) lines.push(`Name:              ${leadData.customerName}`);
    if (leadData.customerEmail) lines.push(`Email:             ${leadData.customerEmail}`);
    if (leadData.customerPhone) lines.push(`Phone:             ${leadData.customerPhone}`);
    lines.push('');
  }

  lines.push('═'.repeat(50));
  lines.push(`Generated: ${new Date().toLocaleString()}`);

  return lines.join('\n');
};
