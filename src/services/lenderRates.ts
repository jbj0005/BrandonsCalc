/**
 * Lender Rates Service
 * Fetches and caches lender APR rates from the backend
 */

export interface LenderRate {
  source: string;
  vehicle_condition: 'new' | 'used';
  loan_type: 'purchase' | 'refinance';
  term_min: number;
  term_max: number;
  base_apr: number;
  credit_score_min: number;
  credit_score_max: number;
  effective_date: string;
}

export interface RatesResponse {
  ok: boolean;
  source: string;
  lenderId: string;
  lenderName: string;
  rates: LenderRate[];
  dataSource: 'supabase' | 'stub';
}

// Simple in-memory cache
const ratesCache: Map<string, { data: RatesResponse; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch rates for a specific lender
 */
export const fetchLenderRates = async (lenderSource: string): Promise<RatesResponse> => {
  const cacheKey = lenderSource.toUpperCase();

  // Check cache
  const cached = ratesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Fetch from API
  const response = await fetch(`/api/rates?source=${encodeURIComponent(lenderSource)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Failed to fetch rates for ${lenderSource}`);
  }

  const data: RatesResponse = await response.json();

  // Cache the response
  ratesCache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
};

/**
 * Calculate APR based on credit score, term, and vehicle condition
 */
export const calculateAPR = (
  rates: LenderRate[],
  creditScore: number,
  term: number,
  vehicleCondition: 'new' | 'used' = 'used'
): number | null => {
  // Filter rates that match the criteria
  const matchingRates = rates.filter((rate) => {
    const termMatches = term >= rate.term_min && term <= rate.term_max;
    const scoreMatches = creditScore >= rate.credit_score_min && creditScore <= rate.credit_score_max;
    const conditionMatches = rate.vehicle_condition === vehicleCondition;

    return termMatches && scoreMatches && conditionMatches;
  });

  if (matchingRates.length === 0) {
    return null;
  }

  // Return the lowest APR if multiple matches
  const lowest = matchingRates.reduce((min, rate) =>
    rate.base_apr < min.base_apr ? rate : min
  );

  return lowest.base_apr;
};

/**
 * Map credit score range to numeric value for calculations
 */
export const creditScoreToValue = (creditRange: string): number => {
  switch (creditRange) {
    case 'excellent':
      return 780; // Mid-point of 750+
    case 'good':
      return 725; // Mid-point of 700-749
    case 'fair':
      return 675; // Mid-point of 650-699
    case 'poor':
      return 600; // Mid-point of < 650
    default:
      return 700; // Default to good
  }
};

/**
 * Clear the rates cache (useful for testing or forcing refresh)
 */
export const clearRatesCache = (): void => {
  ratesCache.clear();
};
