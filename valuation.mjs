/**
 * Trade-in Valuation Module
 * Uses Marketcheck data to calculate fair market trade-in values
 */

import { mcSearch } from "./mc-client.mjs";

/**
 * Configuration constants for valuation logic
 */
const VALUATION_CONFIG = {
  // Year range for comparable vehicles
  YEAR_RANGE_OLDER: 1, // Allow 1 year older
  YEAR_RANGE_NEWER: 1, // Allow 1 year newer

  // Mileage tolerance (as percentage of subject vehicle mileage)
  MILEAGE_TOLERANCE_PCT: 0.25, // ±25% mileage range

  // Minimum/maximum comparable listings needed
  MIN_COMPARABLES: 5,
  IDEAL_COMPARABLES: 15,
  MAX_COMPARABLES: 50,

  // Search radius progression (miles)
  SEARCH_RADII: [50, 100, 200, 500],

  // Trade-in multiplier range (% of retail)
  TRADE_IN_MULTIPLIER_MIN: 0.70, // 70% of retail
  TRADE_IN_MULTIPLIER_MAX: 0.85, // 85% of retail
  TRADE_IN_MULTIPLIER_DEFAULT: 0.75, // 75% default

  // Mileage adjustment per 1000 miles difference
  MILEAGE_ADJUSTMENT_PER_1K: 0.001, // 0.1% per 1k miles
  MILEAGE_ADJUSTMENT_MAX: 0.10, // Max 10% adjustment

  // Confidence score thresholds
  CONFIDENCE_HIGH: 0.80,
  CONFIDENCE_MEDIUM: 0.60,
  CONFIDENCE_LOW: 0.40,
};

/**
 * Find comparable vehicles for trade-in valuation
 *
 * @param {Object} vehicle - Vehicle to value
 * @param {number} vehicle.year - Vehicle year
 * @param {string} vehicle.make - Vehicle make
 * @param {string} vehicle.model - Vehicle model
 * @param {string} [vehicle.trim] - Vehicle trim (optional)
 * @param {number} [vehicle.mileage] - Vehicle mileage (optional)
 * @param {string} [vehicle.zip] - Search location zip code
 *
 * @returns {Promise<Object>} Comparable vehicles result
 */
export async function getComparableVehicles(vehicle) {
  const { year, make, model, trim, mileage, zip } = vehicle;

  // Validate required fields
  if (!year || !make || !model) {
    throw new Error("Year, make, and model are required for valuation");
  }

  const results = {
    vehicle,
    comparables: [],
    searchAttempts: [],
    config: {},
  };

  // Calculate year range for comparables
  const yearMin = year - VALUATION_CONFIG.YEAR_RANGE_OLDER;
  const yearMax = year + VALUATION_CONFIG.YEAR_RANGE_NEWER;

  // Calculate mileage range if mileage provided
  let mileageMin = null;
  let mileageMax = null;
  if (mileage && mileage > 0) {
    const mileageTolerance = mileage * VALUATION_CONFIG.MILEAGE_TOLERANCE_PCT;
    mileageMin = Math.max(0, mileage - mileageTolerance);
    mileageMax = mileage + mileageTolerance;
  }

  results.config = {
    yearMin,
    yearMax,
    mileageMin,
    mileageMax,
    mileageTolerance: mileage
      ? VALUATION_CONFIG.MILEAGE_TOLERANCE_PCT * 100 + "%"
      : "N/A",
  };

  // Progressive radius search to find enough comparables
  for (const radius of VALUATION_CONFIG.SEARCH_RADII) {
    const attempt = {
      radius,
      timestamp: new Date().toISOString(),
      found: 0,
      filtered: 0,
    };

    try {
      // Search for vehicles with exact year match first
      const searchParams = {
        year: String(year),
        make: String(make),
        model: String(model),
        rows: VALUATION_CONFIG.MAX_COMPARABLES,
        start: 0,
      };

      // Add optional parameters
      if (trim) searchParams.trim = String(trim);
      if (zip) {
        searchParams.zip = String(zip);
        searchParams.radius = radius;
      }

      const searchResult = await mcSearch(searchParams);
      attempt.found = searchResult.count || 0;

      if (searchResult.ok && searchResult.listings?.length > 0) {
        // Filter and process listings
        const filtered = searchResult.listings
          .filter((listing) => {
            // Skip if missing critical data
            if (!listing.price || listing.price <= 0) return false;

            // Year range check
            const listingYear = listing.year || 0;
            if (listingYear < yearMin || listingYear > yearMax) return false;

            // Mileage range check (if specified)
            if (mileageMin !== null && mileageMax !== null) {
              const listingMileage = listing.miles || 0;
              if (
                listingMileage < mileageMin ||
                listingMileage > mileageMax
              ) {
                return false;
              }
            }

            // Exclude salvage/rebuilt titles if possible
            if (
              listing.vhr?.salvage === true ||
              /salvage|rebuilt|flood|lemon/i.test(listing.build?.title_status || "")
            ) {
              return false;
            }

            return true;
          })
          .map((listing) => ({
            id: listing.id,
            vin: listing.vin,
            year: listing.year,
            make: listing.make,
            model: listing.model,
            trim: listing.trim,
            price: listing.price,
            miles: listing.miles || 0,
            dealer: listing.dealer_name,
            city: listing.dealer_city,
            state: listing.dealer_state,
            distance: listing.dist,
            source: listing.source,
            url: listing.vdp_url,
          }));

        attempt.filtered = filtered.length;
        results.comparables.push(...filtered);
      }

      results.searchAttempts.push(attempt);

      // Stop if we have enough comparables
      if (results.comparables.length >= VALUATION_CONFIG.IDEAL_COMPARABLES) {
        break;
      }
    } catch (error) {
      attempt.error = error.message;
      results.searchAttempts.push(attempt);
      // Continue to next radius on error
      continue;
    }
  }

  // Sort comparables by price (ascending)
  results.comparables.sort((a, b) => a.price - b.price);

  // Limit to max comparables
  if (results.comparables.length > VALUATION_CONFIG.MAX_COMPARABLES) {
    results.comparables = results.comparables.slice(
      0,
      VALUATION_CONFIG.MAX_COMPARABLES
    );
  }

  return results;
}

/**
 * Calculate trade-in value from comparable vehicles
 *
 * @param {Object} comparablesResult - Result from getComparableVehicles()
 * @returns {Object} Valuation result with price, confidence, and breakdown
 */
export async function calculateTradeInValue(comparablesResult) {
  const { vehicle, comparables, config } = comparablesResult;

  if (!comparables || comparables.length === 0) {
    return {
      success: false,
      error: "No comparable vehicles found",
      vehicle,
      tradeInValue: null,
      confidence: 0,
      confidenceLabel: "none",
      breakdown: {},
    };
  }

  // Calculate retail price statistics
  const prices = comparables.map((c) => c.price);
  const median = calculateMedian(prices);
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Calculate base trade-in value (median retail * multiplier)
  let multiplier = VALUATION_CONFIG.TRADE_IN_MULTIPLIER_DEFAULT;

  // Adjust multiplier based on sample size (more data = higher confidence = higher value)
  if (comparables.length >= VALUATION_CONFIG.IDEAL_COMPARABLES) {
    multiplier = VALUATION_CONFIG.TRADE_IN_MULTIPLIER_MAX; // 85%
  } else if (comparables.length >= VALUATION_CONFIG.MIN_COMPARABLES) {
    // Interpolate between 75% and 85%
    const ratio =
      (comparables.length - VALUATION_CONFIG.MIN_COMPARABLES) /
      (VALUATION_CONFIG.IDEAL_COMPARABLES - VALUATION_CONFIG.MIN_COMPARABLES);
    multiplier =
      VALUATION_CONFIG.TRADE_IN_MULTIPLIER_DEFAULT +
      ratio *
        (VALUATION_CONFIG.TRADE_IN_MULTIPLIER_MAX -
          VALUATION_CONFIG.TRADE_IN_MULTIPLIER_DEFAULT);
  } else {
    multiplier = VALUATION_CONFIG.TRADE_IN_MULTIPLIER_MIN; // 70% for low sample
  }

  let baseTradeInValue = median * multiplier;

  // Mileage adjustment (if vehicle mileage provided)
  let mileageAdjustment = 0;
  if (vehicle.mileage && vehicle.mileage > 0) {
    // Calculate median mileage of comparables
    const comparableMileages = comparables.map((c) => c.miles);
    const medianMileage = calculateMedian(comparableMileages);

    // Calculate adjustment based on difference
    const mileageDiff = vehicle.mileage - medianMileage;
    const mileageDiffK = mileageDiff / 1000;

    // Apply adjustment (negative if higher mileage, positive if lower)
    const adjustmentPct = Math.min(
      Math.max(
        -VALUATION_CONFIG.MILEAGE_ADJUSTMENT_MAX,
        mileageDiffK * VALUATION_CONFIG.MILEAGE_ADJUSTMENT_PER_1K
      ),
      VALUATION_CONFIG.MILEAGE_ADJUSTMENT_MAX
    );

    mileageAdjustment = baseTradeInValue * adjustmentPct;
  }

  const adjustedTradeInValue = Math.round(baseTradeInValue + mileageAdjustment);

  // Calculate confidence score
  const sampleSizeScore = Math.min(
    comparables.length / VALUATION_CONFIG.IDEAL_COMPARABLES,
    1.0
  );
  const priceSpreadScore = 1.0 - Math.min((max - min) / median, 1.0);
  const confidence = (sampleSizeScore * 0.7 + priceSpreadScore * 0.3);

  let confidenceLabel = "low";
  if (confidence >= VALUATION_CONFIG.CONFIDENCE_HIGH) {
    confidenceLabel = "high";
  } else if (confidence >= VALUATION_CONFIG.CONFIDENCE_MEDIUM) {
    confidenceLabel = "medium";
  }

  return {
    success: true,
    vehicle,
    tradeInValue: adjustedTradeInValue,
    confidence: Math.round(confidence * 100) / 100,
    confidenceLabel,
    breakdown: {
      medianRetailPrice: Math.round(median),
      meanRetailPrice: Math.round(mean),
      retailPriceRange: { min: Math.round(min), max: Math.round(max) },
      tradeInMultiplier: Math.round(multiplier * 100) / 100,
      baseTradeInValue: Math.round(baseTradeInValue),
      mileageAdjustment: Math.round(mileageAdjustment),
      comparablesCount: comparables.length,
      sampleSizeScore: Math.round(sampleSizeScore * 100) / 100,
      priceSpreadScore: Math.round(priceSpreadScore * 100) / 100,
    },
    comparables,
  };
}

/**
 * Helper: Calculate median of an array of numbers
 */
function calculateMedian(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Main entry point: Get trade-in valuation for a vehicle
 *
 * @param {Object} vehicle - Vehicle to value (see getComparableVehicles for fields)
 * @returns {Promise<Object>} Complete valuation result
 */
export async function getTradeInValuation(vehicle) {
  try {
    // Step 1: Find comparable vehicles
    const comparables = await getComparableVehicles(vehicle);

    // Step 2: Calculate trade-in value
    const valuation = await calculateTradeInValue(comparables);

    // Add search metadata
    valuation.searchAttempts = comparables.searchAttempts;
    valuation.searchConfig = comparables.config;

    return valuation;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      vehicle,
      tradeInValue: null,
      confidence: 0,
      confidenceLabel: "error",
    };
  }
}
