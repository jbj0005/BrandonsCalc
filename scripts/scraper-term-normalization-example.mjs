/**
 * Scraper Term Normalization Example
 *
 * This file demonstrates how to integrate term normalization into rate scrapers
 * for the myLenders tool. It shows the SCCU scraper as an example.
 *
 * IMPORTANT: This is a REFERENCE IMPLEMENTATION for the external myLenders tool.
 * The actual scraping happens in myLenders (PyQt6 app), not in BrandonsCalc.
 */

import { normalizeRateTerms, getTermNormalizationInfo } from './normalize-terms.mjs';

/**
 * Example: SCCU scraper output BEFORE normalization
 *
 * SCCU publishes rates for non-standard terms: 48, 66, 75, 84 months
 */
const sccuScrapedRates = [
  {
    termMonths: 48,
    apr: 5.49,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    credit_score_min: 740,
    credit_score_max: 850,
    source: 'SCCU',
    effective_at: '2025-10-03'
  },
  {
    termMonths: 66,  // ← Non-standard term
    apr: 5.99,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    credit_score_min: 740,
    credit_score_max: 850,
    source: 'SCCU',
    effective_at: '2025-10-03'
  },
  {
    termMonths: 75,  // ← Non-standard term
    apr: 6.49,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    credit_score_min: 740,
    credit_score_max: 850,
    source: 'SCCU',
    effective_at: '2025-10-03'
  },
  {
    termMonths: 84,
    apr: 6.74,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    credit_score_min: 740,
    credit_score_max: 850,
    source: 'SCCU',
    effective_at: '2025-10-03'
  }
];

/**
 * Example: Normalizing scraped rates before database insertion
 */
function normalizeSccuRates(scrapedRates) {
  console.log('=== SCCU Rate Normalization ===\n');

  const normalizedRates = scrapedRates.map(rate => {
    // Get normalization details for logging
    const termInfo = getTermNormalizationInfo(rate.termMonths);

    // Normalize the rate data
    const normalized = normalizeRateTerms(rate);

    // Log what changed
    if (termInfo.wasModified) {
      console.log(`✓ Normalized ${termInfo.original} months → ${termInfo.normalized} months (distance: ${termInfo.distance})`);
    } else {
      console.log(`✓ Term ${termInfo.original} months already standard`);
    }

    return normalized;
  });

  console.log('\n=== Result ===');
  console.log('Database will store industry-standard terms:');
  normalizedRates.forEach(rate => {
    console.log(`  ${rate.term_label}: ${rate.apr_percent || rate.apr}% APR`);
  });

  return normalizedRates;
}

/**
 * Example: NFCU scraper output (already uses ranges)
 *
 * NFCU already uses term ranges, which also get normalized
 */
const nfcuScrapedRates = [
  {
    termMin: 0,
    termMax: 36,
    apr: 4.29,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    source: 'NFCU',
    effective_at: '2025-11-01'
  },
  {
    termMin: 37,  // ← Gets normalized to 36
    termMax: 60,
    apr: 4.79,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    source: 'NFCU',
    effective_at: '2025-11-01'
  },
  {
    termMin: 61,  // ← Gets normalized to 60
    termMax: 72,
    apr: 5.29,
    vehicle_condition: 'new',
    loan_type: 'purchase',
    credit_tier: 'excellent',
    source: 'NFCU',
    effective_at: '2025-11-01'
  }
];

/**
 * Example: Normalizing NFCU rates (term ranges)
 */
function normalizeNfcuRates(scrapedRates) {
  console.log('\n\n=== NFCU Rate Normalization (Term Ranges) ===\n');

  const normalizedRates = scrapedRates.map(rate => {
    const normalized = normalizeRateTerms(rate);

    console.log(`✓ Range ${rate.termMin}-${rate.termMax} → ${normalized.term_range_min}-${normalized.term_range_max} months`);

    return normalized;
  });

  console.log('\n=== Result ===');
  normalizedRates.forEach(rate => {
    console.log(`  ${rate.term_label}: ${rate.apr_percent || rate.apr}% APR`);
  });

  return normalizedRates;
}

/**
 * IMPLEMENTATION GUIDE FOR myLenders TOOL
 * ========================================
 *
 * Step 1: Import the Python normalization module
 * -----------------------------------------------
 * from normalize_terms import normalize_rate_terms
 *
 *
 * Step 2: After scraping, normalize each rate
 * --------------------------------------------
 * def scrape_sccu_rates():
 *     # ... scraping logic ...
 *     scraped_rates = [
 *         {"termMonths": 66, "apr": 5.99, ...},
 *         {"termMonths": 75, "apr": 6.49, ...},
 *     ]
 *
 *     # Normalize terms to industry standards
 *     normalized_rates = [
 *         normalize_rate_terms(rate)
 *         for rate in scraped_rates
 *     ]
 *
 *     return normalized_rates
 *
 *
 * Step 3: Insert normalized data into Supabase
 * ---------------------------------------------
 * def insert_rates_to_supabase(normalized_rates):
 *     for rate in normalized_rates:
 *         supabase.table('auto_rates').upsert({
 *             'source': rate['source'],
 *             'term_range_min': rate['term_range_min'],  # ← Normalized
 *             'term_range_max': rate['term_range_max'],  # ← Normalized
 *             'term_label': rate['term_label'],
 *             'apr_percent': rate['apr'],
 *             'vehicle_condition': rate['vehicle_condition'],
 *             'loan_type': rate['loan_type'],
 *             'credit_score_min': rate['credit_score_min'],
 *             'credit_score_max': rate['credit_score_max'],
 *             'effective_at': rate['effective_at'],
 *             'last_scraped_at': datetime.now().isoformat()
 *         }).execute()
 *
 *
 * BENEFITS
 * --------
 * 1. Users can select standard terms (36/48/60/72/84) and always get rates
 * 2. No changes needed to frontend rate matching logic
 * 3. Database stays clean with standard terms
 * 4. All lenders appear to support the same terms
 * 5. APR differences are preserved accurately
 *
 *
 * TESTING
 * -------
 * Run the Python module directly to see examples:
 *   python3 scripts/normalize_terms.py
 */

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  normalizeSccuRates(sccuScrapedRates);
  normalizeNfcuRates(nfcuScrapedRates);

  console.log('\n\n=== Database Insertion Example ===');
  console.log('After normalization, insert into Supabase with:');
  console.log(`
const normalized = normalizeRateTerms({
  termMonths: 66,
  apr: 5.99,
  source: 'SCCU',
  vehicle_condition: 'new',
  loan_type: 'purchase',
  credit_score_min: 740,
  credit_score_max: 850,
  effective_at: '2025-10-03'
});

// Insert to database
await supabase.from('auto_rates').upsert({
  source: normalized.source,
  term_range_min: normalized.term_range_min,    // 60 (normalized from 66)
  term_range_max: normalized.term_range_max,    // 60 (normalized from 66)
  term_label: normalized.term_label,            // "60 Months"
  apr_percent: normalized.apr,
  vehicle_condition: normalized.vehicle_condition,
  loan_type: normalized.loan_type,
  credit_score_min: normalized.credit_score_min,
  credit_score_max: normalized.credit_score_max,
  effective_at: normalized.effective_at,
  last_scraped_at: new Date().toISOString()
});
  `.trim());
}
