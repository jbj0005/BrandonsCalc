/**
 * Term Normalization Utility
 *
 * Maps non-standard loan terms to industry-standard terms (36/48/60/72/84 months)
 * for consistent rate matching across all lenders.
 *
 * @module normalize-terms
 */

/**
 * Industry-standard auto loan terms (in months)
 */
export const INDUSTRY_STANDARD_TERMS = [36, 48, 60, 72, 84];

/**
 * Normalize a loan term to the nearest industry standard
 *
 * @param {number} term - The original term in months
 * @returns {number} - The nearest industry-standard term
 *
 * @example
 * normalizeTermToStandard(66) // Returns 60
 * normalizeTermToStandard(75) // Returns 72
 * normalizeTermToStandard(48) // Returns 48 (exact match)
 */
export function normalizeTermToStandard(term) {
  // Handle edge case: 0 months maps to shortest standard term (36)
  if (term === 0) {
    return INDUSTRY_STANDARD_TERMS[0];
  }

  if (!term || term < 0) {
    throw new Error(`Invalid term: ${term}. Term must be a non-negative number.`);
  }

  // Find the nearest standard term
  let nearestTerm = INDUSTRY_STANDARD_TERMS[0];
  let minDistance = Math.abs(term - nearestTerm);

  for (const standardTerm of INDUSTRY_STANDARD_TERMS) {
    const distance = Math.abs(term - standardTerm);

    if (distance < minDistance) {
      minDistance = distance;
      nearestTerm = standardTerm;
    } else if (distance === minDistance) {
      // Tie-breaker: prefer shorter term (more conservative)
      nearestTerm = Math.min(nearestTerm, standardTerm);
    }
  }

  return nearestTerm;
}

/**
 * Normalize a term range to industry-standard boundaries
 *
 * @param {number} termMin - Minimum term in months
 * @param {number} termMax - Maximum term in months
 * @returns {{termMin: number, termMax: number}} - Normalized range
 *
 * @example
 * normalizeTermRange(37, 60) // Returns {termMin: 36, termMax: 60}
 * normalizeTermRange(61, 75) // Returns {termMin: 60, termMax: 72}
 */
export function normalizeTermRange(termMin, termMax) {
  if (termMin > termMax) {
    throw new Error(`Invalid range: min (${termMin}) > max (${termMax})`);
  }

  return {
    termMin: normalizeTermToStandard(termMin),
    termMax: normalizeTermToStandard(termMax),
  };
}

/**
 * Check if a term is already an industry standard
 *
 * @param {number} term - The term to check
 * @returns {boolean} - True if term is a standard value
 */
export function isStandardTerm(term) {
  return INDUSTRY_STANDARD_TERMS.includes(term);
}

/**
 * Get the distance between a term and its normalized value
 *
 * @param {number} term - The original term
 * @returns {{original: number, normalized: number, distance: number}} - Normalization details
 */
export function getTermNormalizationInfo(term) {
  const normalized = normalizeTermToStandard(term);
  return {
    original: term,
    normalized,
    distance: Math.abs(term - normalized),
    wasModified: term !== normalized,
  };
}

/**
 * Normalize rate data for database insertion
 * Handles both exact terms and term ranges
 *
 * @param {Object} rateData - Rate data from scraper
 * @param {number} [rateData.termMonths] - Single exact term
 * @param {number} [rateData.termMin] - Minimum term (for ranges)
 * @param {number} [rateData.termMax] - Maximum term (for ranges)
 * @returns {Object} - Normalized rate data with term_range_min and term_range_max
 */
export function normalizeRateTerms(rateData) {
  let termMin, termMax;

  // Handle exact term (single value)
  if (rateData.termMonths !== undefined) {
    const normalized = normalizeTermToStandard(rateData.termMonths);
    termMin = normalized;
    termMax = normalized;
  }
  // Handle term range
  else if (rateData.termMin !== undefined && rateData.termMax !== undefined) {
    const normalizedRange = normalizeTermRange(rateData.termMin, rateData.termMax);
    termMin = normalizedRange.termMin;
    termMax = normalizedRange.termMax;
  }
  // Missing term data
  else {
    throw new Error('Rate data must include either termMonths or termMin/termMax');
  }

  return {
    ...rateData,
    term_range_min: termMin,
    term_range_max: termMax,
    term_label: termMin === termMax ? `${termMin} Months` : `${termMin}-${termMax} Months`,
  };
}

// Export all for testing
export default {
  INDUSTRY_STANDARD_TERMS,
  normalizeTermToStandard,
  normalizeTermRange,
  isStandardTerm,
  getTermNormalizationInfo,
  normalizeRateTerms,
};
