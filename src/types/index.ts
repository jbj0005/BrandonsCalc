// src/types/index.ts

// ========================================
// User & Authentication Types
// ========================================
export interface User {
  id: string;
  email?: string;
  created_at?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  phone?: string;

  // Address fields
  street_address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  zip_code?: string;
  county?: string;
  county_name?: string;
  google_place_id?: string;

  // Preferences
  preferred_credit_score?: CreditScore;
  preferred_down_payment?: number;
  preferred_trade_value?: number;
  preferred_trade_payoff?: number;
  preferred_lender_id?: string;
  preferred_term?: number;
  credit_score_range?: string;

  created_at: string;
  updated_at: string;
  last_used_at?: string;
}

export type CreditScore = 'excellent' | 'good' | 'fair' | 'poor';

// ========================================
// Vehicle Types
// ========================================
export interface Vehicle {
  id?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  condition?: CreditScore;
  estimated_value?: number;
  payoff_amount?: number;
  photo_url?: string;
  notes?: string;
}

export interface GarageVehicle {
  id: string;
  user_id: string;
  nickname?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  condition?: CreditScore | string;
  estimated_value?: number;
  payoff_amount?: number;
  photo_url?: string;
  notes?: string;
  times_used?: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

// ========================================
// Offer Types
// ========================================
export interface CustomerOffer {
  id?: string;
  user_id?: string;
  
  // Vehicle Information
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_trim?: string;
  vehicle_price: number;
  
  // Financing Details
  down_payment: number;
  trade_value: number;
  trade_payoff: number;
  apr: number;
  term_months: number;
  monthly_payment: number;
  
  // Fees & Taxes
  dealer_fees: number;
  customer_addons: number;
  state_tax_rate: number;
  county_tax_rate: number;
  total_tax: number;
  
  // Calculated Totals
  amount_financed: number;
  finance_charge: number;
  total_of_payments: number;
  
  // Customer Info
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_location?: string;
  
  // Dealer Info
  dealer_name?: string;
  dealer_phone?: string;
  dealer_address?: string;
  
  // Status
  status: OfferStatus;
  share_token?: string;
  viewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type OfferStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected';

// ========================================
// SMS Types
// ========================================
export interface SMSLog {
  id: string;
  offer_id?: string;
  message_sid: string;
  to_phone: string;
  from_phone: string;
  dealer_name?: string;
  customer_name?: string;
  status: string;
  error_message?: string;
  sent_at: string;
  delivered_at?: string;
  created_at: string;
}

export interface SendSMSRequest {
  dealerPhone: string;
  dealerName: string;
  customerName: string;
  vehicle: string;
  monthlyPayment: number;
  downPayment: number;
  term: number;
  apr: number;
  totalPrice?: number;
  message?: string;
  offerUrl?: string;
}

// ========================================
// Calculator Types
// ========================================
export interface CalculatorState {
  salePrice: number;
  cashDown: number;
  tradeValue: number;
  tradePayoff: number;
  apr: number;
  term: number;
  
  // Fees
  dealerFees: number;
  customerAddons: number;
  stateTaxRate: number;
  countyTaxRate: number;
  
  // Calculated Values
  monthlyPayment: number;
  totalFinanced: number;
  financeCharge: number;
  totalOfPayments: number;
  totalTax: number;
}

// ========================================
// Slider Types
// ========================================
export interface SliderConfig {
  id: string;
  element?: HTMLInputElement;
  originalValue: number;
  currentValue: number;
  min: number;
  max: number;
  tooltip?: HTMLElement;
}

export interface SliderChangeEvent {
  id: string;
  value: number;
  delta: number;
  percentage: number;
}

// ========================================
// Rate Sheet Types
// ========================================
export interface RateSheet {
  id: string;
  lender_name: string;
  credit_tier: CreditScore;
  term_months: number;
  apr: number;
  effective_date: string;
  expiration_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ========================================
// Toast Types
// ========================================
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  icon?: string;
}

// ========================================
// API Response Types
// ========================================
export interface APIResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// ========================================
// Form Types
// ========================================
export interface SignUpData {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

// ========================================
// Event Types
// ========================================
export interface ProfileLoadedEvent extends CustomEvent {
  detail: {
    profile: UserProfile;
  };
}

export interface SliderChangedEvent extends CustomEvent {
  detail: SliderChangeEvent;
}

export interface AuthStateChangedEvent extends CustomEvent {
  detail: {
    user: User | null;
    session: any;
  };
}

// ========================================
// Wizard Data (for existing app.js integration)
// ========================================
export interface WizardData {
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  vehicle: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    price?: number;
    vin?: string;
  };
  financing: {
    salePrice?: number;
    cashDown?: number;
    apr?: number;
    term?: number;
  };
  tradein: {
    tradeValue?: number;
    tradePayoff?: number;
    vehicle?: Vehicle;
  };
  dealer: {
    name?: string;
    address?: string;
    phone?: string;
  };
}

// ========================================
// Global Window Interface Extensions
// ========================================
declare global {
  interface Window {
    wizardData: WizardData;
    showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  }
}

export {};
