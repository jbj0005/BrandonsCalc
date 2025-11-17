/**
 * Lead Submission Service
 * Submits customer offers to Supabase
 */

import { supabase } from '../lib/supabase';
import { formatEffectiveDate } from '../utils/formatters';

export type EmailFormat = 'customer' | 'dealer' | 'lender';

export interface LeadData {
  // Vehicle details
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
  vehicleVIN?: string;
  vehicleMileage?: number;
  vehicleCondition?: 'new' | 'used';
  vehiclePrice?: number; // Customer's offer price
  dealerAskingPrice?: number; // Dealer's original asking price
  stockNumber?: string; // NEW: Dealer stock number
  vehiclePhotoUrl?: string; // Vehicle photo URL

  // Dealer details
  dealerName?: string;
  dealerPhone?: string;
  dealerEmail?: string; // NEW: Dealer email for sending offers
  dealerAddress?: string;

  // Financing details
  apr?: number;
  termMonths?: number;
  monthlyPayment?: number;
  downPayment?: number;
  ratesEffectiveDate?: string;

  // Trade-in details (financial)
  tradeValue?: number;
  tradePayoff?: number;

  // Trade-in vehicle details
  tradeVehicleYear?: number;
  tradeVehicleMake?: string;
  tradeVehicleModel?: string;
  tradeVehicleTrim?: string;
  tradeVehicleVIN?: string;
  tradeVehicleMileage?: number;
  tradeVehicleCondition?: string; // e.g., "Excellent", "Good", "Fair"

  // Fees and addons
  dealerFees?: number;
  customerAddons?: number;
  govtFees?: number;

  // Fee items breakdown
  dealerFeeItems?: Array<{ description: string; amount: number }>;
  customerAddonItems?: Array<{ description: string; amount: number }>;
  govtFeeItems?: Array<{ description: string; amount: number }>;

  // Customer details
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string; // NEW: Customer address

  // Offer text for email
  offerText?: string;
  offerName?: string;

  // Dev mode flag - skips actual email/SMS sending
  devMode?: boolean;
}

export interface SubmissionProgress {
  stage: 'validating' | 'saving' | 'email' | 'sms' | 'complete' | 'error';
  progress: number;
  message: string;
  offerId?: string;
  error?: string;
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
      govt_fees: leadData.govtFees || null,

      // Fee items (stored as JSON)
      dealer_fee_items: leadData.dealerFeeItems ? JSON.stringify(leadData.dealerFeeItems) : null,
      customer_addon_items: leadData.customerAddonItems ? JSON.stringify(leadData.customerAddonItems) : null,
      govt_fee_items: leadData.govtFeeItems ? JSON.stringify(leadData.govtFeeItems) : null,

      // Customer info
      customer_name: leadData.customerName || null,
      customer_email: leadData.customerEmail || null,
      customer_phone: leadData.customerPhone || null,

      // Offer text
      offer_text: leadData.offerText || null,

      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('customer_offers')
      .insert(offerData)
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: error.message || 'Failed to submit offer',
      };
    }

    return {
      ok: true,
      offerId: data.id,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
};

/**
 * Delay helper for minimum stage duration
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const randomBetween = (min: number, max: number): number => {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

type SimulatedStage = 'validating' | 'saving' | 'email' | 'sms';

const STAGE_TIMING: Record<SimulatedStage, { duration: [number, number]; progress: [number, number] }> = {
  validating: { duration: [900, 2500], progress: [15, 35] },
  saving: { duration: [1500, 4200], progress: [40, 70] },
  email: { duration: [800, 2600], progress: [70, 85] },
  sms: { duration: [600, 2000], progress: [85, 96] },
};

const getStageDuration = (stage: SimulatedStage) => {
  const [min, max] = STAGE_TIMING[stage].duration;
  return randomBetween(min, max);
};

const createProgressTracker = () => {
  let lastProgress = 0;
  return (stage: SimulatedStage) => {
    const [min, max] = STAGE_TIMING[stage].progress;
    const target = randomBetween(min, max);
    const next = Math.max(lastProgress + 3, Math.min(99, target));
    lastProgress = next;
    return next;
  };
};

/**
 * Submit offer with progress tracking and email/SMS delivery
 *
 * This function provides a multi-stage submission flow:
 * 1. Validating - Check auth and TCPA opt-in status
 * 2. Saving - Create/link customer_profile and insert offer
 * 3. Email - Send email confirmation via SendGrid
 * 4. SMS - Send SMS notification if user opted in
 * 5. Complete - Show success
 *
 * @param leadData - Offer data to submit
 * @param onProgress - Callback for progress updates
 * @returns Promise with success status and offerId
 */
export const submitOfferWithProgress = async (
  leadData: LeadData,
  onProgress: (update: SubmissionProgress) => void
): Promise<{ ok: boolean; offerId?: string; error?: string }> => {

  try {
    const nextProgress = createProgressTracker();
    // Stage 1: Validating (0-2s, 25% progress)
    const stage1Start = Date.now();
    const validatingDuration = getStageDuration('validating');
    onProgress({
      stage: 'validating',
      progress: nextProgress('validating'),
      message: 'Validating offer details...'
    });

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('You must be signed in to submit an offer');
    }

    // Check TCPA opt-in status (only if phone provided)
    let isOptedIn = false;
    if (leadData.customerPhone) {
      const { data: optStatus } = await supabase
        .from('sms_opt_status')
        .select('opted_in')
        .eq('phone_number', leadData.customerPhone)
        .maybeSingle();

      isOptedIn = optStatus?.opted_in || false;
    }

    // Ensure stage takes minimum time
    await delay(Math.max(0, validatingDuration - (Date.now() - stage1Start)));

    // Stage 2: Saving (2-4s, 50% progress)
    const stage2Start = Date.now();
    const savingDuration = getStageDuration('saving');
    onProgress({
      stage: 'saving',
      progress: nextProgress('saving'),
      message: 'Saving your offer...'
    });

    // Get or create customer_profile
    let { data: profile } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    // Create profile if doesn't exist
    if (!profile) {
      const { data: newProfile, error: profileError } = await supabase
        .from('customer_profiles')
        .insert({
          user_id: session.user.id,
          email: leadData.customerEmail || session.user.email,
          full_name: leadData.customerName || null,
          phone: leadData.customerPhone || null,
          street_address: leadData.customerAddress || null
        })
        .select('id')
        .single();

      if (profileError) {
        throw new Error('Failed to create customer profile');
      }

      profile = newProfile;
    }

    // Generate offer name
    const offerName = leadData.offerName ||
      `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''}`.trim() ||
      'Vehicle Offer';

    // Insert offer
    const { data: offer, error: offerError } = await supabase
      .from('customer_offers')
      .insert({
        customer_profile_id: profile.id, // REQUIRED FK
        user_id: session.user.id, // Also set user_id for RLS
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
        vehicle_price: leadData.vehiclePrice || null, // Customer's offer
        dealer_asking_price: leadData.dealerAskingPrice || null, // Dealer's asking price
        vehicle_stock_number: leadData.stockNumber || null, // NEW
        vehicle_photo_url: leadData.vehiclePhotoUrl || null, // Vehicle photo

        // Dealer details
        dealer_name: leadData.dealerName || null,
        dealer_phone: leadData.dealerPhone || null,
        dealer_address: leadData.dealerAddress || null,

        // Pricing details
        offer_price: leadData.vehiclePrice || null,
        down_payment: leadData.downPayment || null,
        trade_value: leadData.tradeValue || null,
        trade_payoff: leadData.tradePayoff || null,
        dealer_fees: leadData.dealerFees || null,
        customer_addons: leadData.customerAddons || null,

        // Financing details
        apr: leadData.apr || null,
        term_months: leadData.termMonths || null,
        monthly_payment: leadData.monthlyPayment || null,

        // Customer snapshot
        customer_name: leadData.customerName || null,
        customer_email: leadData.customerEmail || null,
        customer_phone: leadData.customerPhone || null,
        customer_address: leadData.customerAddress || null,

        // Offer text
        offer_text: leadData.offerText || null,

        submitted_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (offerError) {
      throw new Error(offerError.message || 'Failed to save offer');
    }

    await delay(Math.max(0, savingDuration - (Date.now() - stage2Start)));

    // Stage 3: Email (4-6s, 75% progress)
    const stage3Start = Date.now();
    const emailDuration = getStageDuration('email');
    onProgress({
      stage: 'email',
      progress: nextProgress('email'),
      message: 'Sending email confirmation...',
      offerId: offer.id
    });

    // Send email via edge function (skip in dev mode)
    if (leadData.customerEmail && !leadData.devMode) {
      const vehicleInfo = `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''}`.trim();

      const { error: emailError } = await supabase.functions.invoke('send-email', {
        body: {
          offerId: offer.id,
          recipientEmail: leadData.customerEmail,
          recipientName: leadData.customerName,
          offerText: leadData.offerText || '',
          vehicleInfo: vehicleInfo || undefined
        }
      });

      if (emailError) {
        // Don't fail the whole submission if email fails
      }
    }

    await delay(Math.max(0, emailDuration - (Date.now() - stage3Start)));

    // Stage 4: SMS (6-7s, 90% progress) - Only if opted in (skip in dev mode)
    if (isOptedIn && leadData.customerPhone && !leadData.devMode) {
      const stage4Start = Date.now();
      const smsDuration = getStageDuration('sms');
      onProgress({
        stage: 'sms',
        progress: nextProgress('sms'),
        message: 'Sending SMS notification...',
        offerId: offer.id
      });

      const vehicleInfo = `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''}`.trim();

      const { error: smsError } = await supabase.functions.invoke('send-sms', {
        body: {
          to: leadData.customerPhone,
          dealerName: leadData.dealerName || 'Dealer',
          customerName: leadData.customerName || 'Customer',
          vehicleInfo: vehicleInfo || 'Vehicle',
          offerText: leadData.offerText || '',
          offerId: offer.id
        }
      });

      if (smsError) {
        // Don't fail the whole submission if SMS fails
      }

      await delay(Math.max(0, smsDuration - (Date.now() - stage4Start)));
    }

    // Stage 5: Complete
    onProgress({
      stage: 'complete',
      progress: 100,
      message: 'Offer submitted successfully!',
      offerId: offer.id
    });

    return {
      ok: true,
      offerId: offer.id
    };

  } catch (error: any) {
    onProgress({
      stage: 'error',
      progress: 0,
      message: error.message || 'An unexpected error occurred',
      error: error.message
    });

    return {
      ok: false,
      error: error.message || 'An unexpected error occurred'
    };
  }
};

/**
 * Generate offer text summary for email/display
 * @param leadData - Lead data
 * @param format - Email format: 'customer' (all details), 'dealer' (no financing/fees), 'lender' (TBD)
 */
export const generateOfferText = (leadData: LeadData, format: EmailFormat = 'customer'): string => {
  const lines: string[] = [];

  // Title - varies by format
  const title = format === 'dealer' ? 'DEALER OFFER SUMMARY' :
                format === 'lender' ? 'LENDER OFFER SUMMARY' :
                'VEHICLE OFFER SUMMARY';
  lines.push(title);
  lines.push('═'.repeat(50));
  lines.push('');

  // OFFER HERO - Customer's offer prominently at top
  if (leadData.vehiclePrice) {
    lines.push('CUSTOMER OFFER');
    lines.push('═'.repeat(50));
    lines.push('');
    lines.push(`    💰 $${leadData.vehiclePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push('');

    // Show savings ONLY for customer format
    if (format === 'customer' && leadData.dealerAskingPrice && leadData.dealerAskingPrice > leadData.vehiclePrice) {
      const savings = leadData.dealerAskingPrice - leadData.vehiclePrice;
      lines.push(`    💵 Savings: $${savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} below asking price`);
      lines.push('');
    }

    lines.push('═'.repeat(50));
    lines.push('');
  }

  // Vehicle Info
  if (leadData.vehicleYear || leadData.vehicleMake || leadData.vehicleModel) {
    lines.push('VEHICLE DETAILS');
    lines.push('-'.repeat(50));
    const vehicle = `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''} ${leadData.vehicleTrim || ''}`.trim();
    lines.push(`Vehicle:           ${vehicle}`);
    if (leadData.vehicleVIN) lines.push(`VIN:               ${leadData.vehicleVIN}`);
    if (leadData.vehicleMileage) lines.push(`Mileage:           ${leadData.vehicleMileage.toLocaleString()} miles`);
    if (leadData.vehicleCondition) lines.push(`Condition:         ${leadData.vehicleCondition.charAt(0).toUpperCase() + leadData.vehicleCondition.slice(1)}`);
    if (leadData.stockNumber) lines.push(`Stock #:           ${leadData.stockNumber}`);
    if (leadData.dealerAskingPrice) lines.push(`Dealer Asking:     $${leadData.dealerAskingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
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

  // Financing Details - EXCLUDE for dealer format
  if (format !== 'dealer' && (leadData.monthlyPayment || leadData.apr || leadData.termMonths)) {
    lines.push('FINANCING DETAILS');
    lines.push('-'.repeat(50));
    if (leadData.monthlyPayment) lines.push(`Monthly Payment:   $${leadData.monthlyPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (leadData.apr) lines.push(`APR:               ${leadData.apr.toFixed(2)}%`);
    if (leadData.ratesEffectiveDate) {
      const formattedDate = formatEffectiveDate(leadData.ratesEffectiveDate) || leadData.ratesEffectiveDate;
      lines.push(`Rates Effective:   ${formattedDate}`);
    }
    if (leadData.termMonths) lines.push(`Term:              ${leadData.termMonths} months (${(leadData.termMonths / 12).toFixed(1)} years)`);
    if (leadData.downPayment) lines.push(`Down Payment:      $${leadData.downPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push('');
  }

  // Trade-in - Different format for dealer vs customer
  const hasTradeVehicle = leadData.tradeVehicleYear || leadData.tradeVehicleMake || leadData.tradeVehicleModel;
  const hasTradeFinancials = leadData.tradeValue || leadData.tradePayoff;

  if (format === 'dealer' && hasTradeVehicle) {
    // Dealer format: Show trade-in vehicle details
    lines.push('TRADE-IN DETAILS');
    lines.push('-'.repeat(50));
    const tradeVehicle = `${leadData.tradeVehicleYear || ''} ${leadData.tradeVehicleMake || ''} ${leadData.tradeVehicleModel || ''} ${leadData.tradeVehicleTrim || ''}`.trim();
    if (tradeVehicle) lines.push(`Vehicle:           ${tradeVehicle}`);
    if (leadData.tradeVehicleVIN) lines.push(`VIN:               ${leadData.tradeVehicleVIN}`);
    if (leadData.tradeVehicleMileage) lines.push(`Mileage:           ${leadData.tradeVehicleMileage.toLocaleString()} miles`);
    if (leadData.tradeVehicleCondition) lines.push(`Trade-in Condition:${leadData.tradeVehicleCondition}`);
    lines.push('');
  } else if (format === 'customer' && hasTradeFinancials) {
    // Customer format: Show financial details
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

  // Fees & Addons - EXCLUDE for dealer format
  if (format !== 'dealer' && (leadData.dealerFees || leadData.customerAddons)) {
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
