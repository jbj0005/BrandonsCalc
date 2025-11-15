#!/usr/bin/env node
/**
 * Database Cleanup Script: Normalize SCCU Terms
 *
 * This script updates existing SCCU rates in the database to use
 * industry-standard terms instead of their non-standard terms.
 *
 * Changes:
 * - 66 months → 60 months
 * - 75 months → 72 months
 * - 48 and 84 months remain unchanged (already standard)
 *
 * IMPORTANT: Run this ONCE after implementing term normalization in scrapers.
 * Future scraper runs will insert normalized data automatically.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { normalizeTermToStandard } from './normalize-terms.mjs';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Main cleanup function
 */
async function cleanupSccuTerms() {
  console.log('=== SCCU Term Normalization Cleanup ===\n');

  // Step 1: Fetch all SCCU rates
  console.log('1. Fetching SCCU rates from database...');
  const { data: sccuRates, error: fetchError } = await supabase
    .from('auto_rates')
    .select('*')
    .ilike('source', '%sccu%')
    .order('term_range_min');

  if (fetchError) {
    console.error('❌ Error fetching rates:', fetchError);
    process.exit(1);
  }

  console.log(`   Found ${sccuRates.length} SCCU rates\n`);

  // Step 2: Identify rates that need normalization
  const ratesToUpdate = [];
  const ratesAlreadyStandard = [];

  for (const rate of sccuRates) {
    const originalTerm = rate.term_range_min;
    const normalizedTerm = normalizeTermToStandard(originalTerm);

    if (originalTerm !== normalizedTerm) {
      ratesToUpdate.push({
        id: rate.id,
        originalTerm,
        normalizedTerm,
        apr: rate.apr_percent,
        vehicleCondition: rate.vehicle_condition,
        loanType: rate.loan_type,
        creditScoreMin: rate.credit_score_min,
        creditScoreMax: rate.credit_score_max,
      });
    } else {
      ratesAlreadyStandard.push(rate);
    }
  }

  console.log('2. Analysis:');
  console.log(`   Rates needing update: ${ratesToUpdate.length}`);
  console.log(`   Rates already standard: ${ratesAlreadyStandard.length}\n`);

  if (ratesToUpdate.length === 0) {
    console.log('✅ All SCCU rates already use standard terms. No cleanup needed.');
    return;
  }

  // Step 3: Show what will change
  console.log('3. Changes to be made:\n');
  for (const rate of ratesToUpdate) {
    console.log(`   ${rate.originalTerm} months → ${rate.normalizedTerm} months (APR: ${rate.apr}%)`);
  }

  console.log('\n4. Confirming changes...');
  console.log('   This will UPDATE the database. Proceed? (Press Ctrl+C to cancel)');
  console.log('   Waiting 3 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Step 4: Update each rate
  console.log('5. Updating database...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const rate of ratesToUpdate) {
    const newTermLabel = rate.originalTerm === rate.normalizedTerm
      ? `${rate.normalizedTerm} Months`
      : `${rate.normalizedTerm} Months`;

    const { error: updateError } = await supabase
      .from('auto_rates')
      .update({
        term_range_min: rate.normalizedTerm,
        term_range_max: rate.normalizedTerm,
        term_months_min: rate.normalizedTerm,
        term_months_max: rate.normalizedTerm,
        term_label: newTermLabel,
      })
      .eq('id', rate.id);

    if (updateError) {
      console.error(`   ❌ Failed to update ${rate.originalTerm} → ${rate.normalizedTerm}:`, updateError.message);
      errorCount++;
    } else {
      console.log(`   ✅ Updated ${rate.originalTerm} → ${rate.normalizedTerm} months`);
      successCount++;
    }
  }

  // Step 5: Verify changes
  console.log('\n6. Verification...\n');

  const { data: updatedRates, error: verifyError } = await supabase
    .from('auto_rates')
    .select('term_range_min, term_range_max, apr_percent')
    .ilike('source', '%sccu%')
    .order('term_range_min');

  if (verifyError) {
    console.error('❌ Error verifying changes:', verifyError);
  } else {
    console.log('   Current SCCU rates in database:');
    updatedRates.forEach(rate => {
      const termLabel = rate.term_range_min === rate.term_range_max
        ? `${rate.term_range_min} months`
        : `${rate.term_range_min}-${rate.term_range_max} months`;
      console.log(`     ${termLabel}: ${rate.apr_percent}% APR`);
    });
  }

  // Step 6: Summary
  console.log('\n=== Summary ===');
  console.log(`✅ Successfully updated: ${successCount} rates`);
  if (errorCount > 0) {
    console.log(`❌ Failed to update: ${errorCount} rates`);
  }
  console.log('\n✨ Cleanup complete!\n');
  console.log('Next steps:');
  console.log('1. Verify rates in the app by selecting SCCU and different terms');
  console.log('2. Update your myLenders scrapers to use term normalization');
  console.log('3. Run scrapers to confirm new rates insert with normalized terms\n');
}

/**
 * Rollback function (in case something goes wrong)
 */
async function rollbackSccuTerms() {
  console.log('=== SCCU Term Rollback (RESTORE ORIGINAL VALUES) ===\n');
  console.log('This will restore SCCU terms to their original non-standard values.\n');

  const rollbackMappings = [
    { current: 60, original: 66 },
    { current: 72, original: 75 },
  ];

  console.log('Mappings to restore:');
  rollbackMappings.forEach(({ current, original }) => {
    console.log(`  ${current} months → ${original} months`);
  });

  console.log('\nProceed with rollback? (Press Ctrl+C to cancel)');
  console.log('Waiting 3 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  for (const { current, original } of rollbackMappings) {
    const { error } = await supabase
      .from('auto_rates')
      .update({
        term_range_min: original,
        term_range_max: original,
        term_months_min: original,
        term_months_max: original,
        term_label: `${original} Months`,
      })
      .ilike('source', '%sccu%')
      .eq('term_range_min', current);

    if (error) {
      console.error(`❌ Failed to rollback ${current} → ${original}:`, error.message);
    } else {
      console.log(`✅ Rolled back ${current} → ${original} months`);
    }
  }

  console.log('\n✅ Rollback complete!\n');
}

// Run the appropriate function based on command line argument
const command = process.argv[2];

if (command === 'rollback') {
  rollbackSccuTerms().catch(error => {
    console.error('Fatal error during rollback:', error);
    process.exit(1);
  });
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`
SCCU Term Normalization Cleanup Script

Usage:
  node scripts/cleanup-sccu-terms.mjs          # Run cleanup (normalize terms)
  node scripts/cleanup-sccu-terms.mjs rollback # Restore original terms
  node scripts/cleanup-sccu-terms.mjs help     # Show this help

What it does:
  - Normalizes SCCU's non-standard terms to industry standards
  - 66 months → 60 months
  - 75 months → 72 months
  - 48 and 84 months remain unchanged

Prerequisites:
  - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file
  - Supabase connection working

Safety:
  - Shows a preview before making changes
  - 3-second countdown before execution
  - Includes rollback functionality
  - Verifies changes after completion
  `);
} else {
  cleanupSccuTerms().catch(error => {
    console.error('Fatal error during cleanup:', error);
    process.exit(1);
  });
}
