import { supabase } from '../lib/supabase';
import { TaxLocation } from '../types';

interface TaxRateCache {
  data: TaxLocation;
  timestamp: number;
}

const CACHE_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
const CACHE_KEY_PREFIX = 'tax_rates_';

/**
 * Get cache key for a specific state/county combination
 */
function getCacheKey(stateCode: string, countyName: string): string {
  return `${CACHE_KEY_PREFIX}${stateCode}_${countyName}`.toLowerCase();
}

/**
 * Retrieve cached tax rates from localStorage
 */
function getCachedTaxRates(stateCode: string, countyName: string): TaxLocation | null {
  try {
    const cacheKey = getCacheKey(stateCode, countyName);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const parsedCache: TaxRateCache = JSON.parse(cached);
    const age = Date.now() - parsedCache.timestamp;

    // Check if cache is still valid (within 90 days)
    if (age < CACHE_DURATION_MS) {
      console.log(`[TaxRatesService] Cache hit for ${stateCode}/${countyName} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`);
      return parsedCache.data;
    }

    // Cache expired, remove it
    console.log(`[TaxRatesService] Cache expired for ${stateCode}/${countyName}`);
    localStorage.removeItem(cacheKey);
    return null;
  } catch (error) {
    console.error('[TaxRatesService] Error reading cache:', error);
    return null;
  }
}

/**
 * Store tax rates in localStorage cache
 */
function cacheTaxRates(stateCode: string, countyName: string, data: TaxLocation): void {
  try {
    const cacheKey = getCacheKey(stateCode, countyName);
    const cacheData: TaxRateCache = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`[TaxRatesService] Cached tax rates for ${stateCode}/${countyName}`);
  } catch (error) {
    console.error('[TaxRatesService] Error writing cache:', error);
  }
}

/**
 * Lookup tax rates from Supabase county_surtax_windows table
 * @param stateCode Two-letter state code (e.g., "FL", "WA")
 * @param countyName Normalized county name without "County" suffix (e.g., "Miami-Dade", "King")
 * @param stateName Full state name (e.g., "Florida", "Washington")
 * @returns TaxLocation object or null if not found
 */
export async function lookupTaxRates(
  stateCode: string,
  countyName: string,
  stateName: string
): Promise<TaxLocation | null> {
  // Check cache first
  const cached = getCachedTaxRates(stateCode, countyName);
  if (cached) {
    return cached;
  }

  // No cache hit, query Supabase
  console.log(`[TaxRatesService] Looking up tax rates for ${stateCode}/${countyName}`);

  try {
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Query for total tax rate (includes both state and county)
    const { data, error } = await supabase
      .from('county_surtax_windows')
      .select('*')
      .eq('state_code', stateCode)
      .eq('county_name', countyName)
      .eq('component_label', 'total')
      .lte('effective_date', currentDate)
      .or(`expiration_date.is.null,expiration_date.gte.${currentDate}`)
      .order('effective_date', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[TaxRatesService] Supabase query error:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.warn(`[TaxRatesService] No tax rates found for ${stateCode}/${countyName}`);
      return null;
    }

    const taxRecord = data[0];

    // Convert decimal rate to percentage (0.075 -> 7.5%)
    const totalTaxRate = taxRecord.rate_decimal * 100;

    // For "total" component_label, we assume the rate includes both state and county
    // We'll need to split this intelligently or query for separate components
    // For now, we'll assume a 70/30 split (state/county) as a reasonable default
    // This should be customized based on actual state tax structures
    const stateTaxRate = totalTaxRate * 0.7;
    const countyTaxRate = totalTaxRate * 0.3;

    // Format county name for display (add "County" suffix if not present)
    const displayCountyName = countyName.endsWith('County') || countyName.endsWith('Parish')
      ? countyName
      : `${countyName} County`;

    const result: TaxLocation = {
      stateName,
      stateCode,
      countyName: displayCountyName,
      stateTaxRate,
      countyTaxRate,
    };

    // Cache the result
    cacheTaxRates(stateCode, countyName, result);

    return result;
  } catch (error) {
    console.error('[TaxRatesService] Error looking up tax rates:', error);
    return null;
  }
}

/**
 * Lookup tax rates with separate state and county components
 * This function queries for both "component" entries (state + county separately)
 * Falls back to "total" if components aren't available
 */
export async function lookupTaxRatesDetailed(
  stateCode: string,
  countyName: string,
  stateName: string
): Promise<TaxLocation | null> {
  // Check cache first
  const cached = getCachedTaxRates(stateCode, countyName);
  if (cached) {
    return cached;
  }

  console.log(`[TaxRatesService] Looking up detailed tax rates for ${stateCode}/${countyName}`);

  try {
    const currentDate = new Date().toISOString().split('T')[0];

    // Query for component rates (separate state and county)
    const { data: componentData, error: componentError } = await supabase
      .from('county_surtax_windows')
      .select('*')
      .eq('state_code', stateCode)
      .eq('county_name', countyName)
      .eq('component_label', 'component')
      .lte('effective_date', currentDate)
      .or(`expiration_date.is.null,expiration_date.gte.${currentDate}`)
      .order('effective_date', { ascending: false });

    if (componentError) {
      console.error('[TaxRatesService] Component query error:', componentError);
      // Fall back to simple lookup
      return lookupTaxRates(stateCode, countyName, stateName);
    }

    if (componentData && componentData.length > 0) {
      // TODO: Parse component data and separate state vs county rates
      // This requires additional metadata in the county_surtax_windows table
      // to distinguish between state and county components
      // For now, fall back to the simple lookup
      console.warn('[TaxRatesService] Component parsing not yet implemented, falling back to total');
    }

    // Fall back to total lookup
    return lookupTaxRates(stateCode, countyName, stateName);
  } catch (error) {
    console.error('[TaxRatesService] Error in detailed lookup:', error);
    return null;
  }
}

/**
 * Clear all cached tax rates from localStorage
 */
export function clearTaxRatesCache(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    console.log(`[TaxRatesService] Cleared ${keysToRemove.length} cached tax rate entries`);
  } catch (error) {
    console.error('[TaxRatesService] Error clearing cache:', error);
  }
}
