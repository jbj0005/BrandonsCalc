/**
 * Fee item with description and amount
 */
export interface FeeItem {
  description: string;
  amount: number;
}

/**
 * Fee category types
 */
export type FeeCategory = 'dealer' | 'customer' | 'gov';

/**
 * Fee items organized by category
 */
export interface FeeItems {
  dealer: FeeItem[];
  customer: FeeItem[];
  gov: FeeItem[];
}

/**
 * Fee totals by category
 */
export interface FeeTotals {
  dealerFees: number;
  customerAddons: number;
  govtFees: number;
}

/**
 * Fee suggestion from Supabase
 */
export interface FeeSuggestion {
  description: string;
  amount: number;
  category: FeeCategory;
  id?: string; // `${setId}:${index}` for editing/deleting
  setId?: string | null;
  index?: number;
}

/**
 * Fee modal state
 */
export interface FeeModalState {
  isOpen: boolean;
  items: FeeItems;
  stateTaxRate: number;
  countyTaxRate: number;
  userTaxOverride: boolean;
}

/**
 * Fee template for editing
 */
export interface FeeTemplate {
  id?: string;
  description: string;
  amount: number;
  category: FeeCategory;
  created_at?: string;
  updated_at?: string;
}
