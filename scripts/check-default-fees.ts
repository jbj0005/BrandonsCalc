/**
 * Check Default Fees
 *
 * Analyze what fees apply to a default "standard_financed" scenario
 * to understand where $350.75 comes from
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function analyze() {
  const { data: rules, error } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== All Florida Government Fees ===\n');

  let totalNoCondition = 0;
  const noConditionFees: { code: string; amount: number }[] = [];
  const conditionalFees: { code: string; amount: number; conditions: any }[] = [];

  rules.forEach((rule) => {
    const ruleData = rule.rule_data as any;
    const hasConditions = ruleData.conditions && Object.keys(ruleData.conditions).length > 0;
    const autoApply = ruleData.autoApply !== false;
    const amount = ruleData.amount || 0;

    if (!hasConditions && autoApply) {
      totalNoCondition += amount;
      noConditionFees.push({ code: ruleData.feeCode, amount });
    } else {
      conditionalFees.push({
        code: ruleData.feeCode,
        amount,
        conditions: ruleData.conditions
      });
    }
  });

  console.log('UNCONDITIONAL FEES (always apply):');
  noConditionFees.forEach(f => console.log(`  ${f.code}: $${f.amount}`));
  console.log(`  SUBTOTAL: $${totalNoCondition.toFixed(2)}\n`);

  console.log('CONDITIONAL FEES (depend on scenario):');
  conditionalFees.forEach(f => {
    console.log(`  ${f.code}: $${f.amount}`);
    console.log(`    Conditions: ${JSON.stringify(f.conditions)}`);
  });

  // Calculate for standard_financed scenario
  // (new_plate, not first-time, financed, retail)
  console.log('\n=== STANDARD FINANCED SCENARIO ===');
  console.log('(new_plate, NOT first-time registration, financed, retail)\n');

  let standardTotal = totalNoCondition;
  const appliedFees = [...noConditionFees];

  conditionalFees.forEach(f => {
    const cond = f.conditions;

    // Check if fee applies to standard_financed
    // Title Transfer: dealType == retail
    if (f.code.includes('TITLE_TRANSFER') || f.code.includes('TITLE_FEE')) {
      // Likely applies
      standardTotal += f.amount;
      appliedFees.push(f);
    }
    // Lien Filing: termMonths > 0
    else if (f.code.includes('LIEN')) {
      standardTotal += f.amount;
      appliedFees.push(f);
    }
    // New License Plate: plateScenario == new_plate
    else if (f.code.includes('NEW_LICENSE_PLATE') || f.code.includes('PLATE_ISSUANCE')) {
      standardTotal += f.amount;
      appliedFees.push(f);
    }
    // Initial Registration: firstTimeRegisteredInState == true (NOT for standard)
    else if (f.code.includes('INITIAL_REGISTRATION') || f.code.includes('FIRST_TIME')) {
      console.log(`  SKIPPED (first-time only): ${f.code} $${f.amount}`);
    }
    // Registration Transfer: plateScenario == transfer_existing_plate (NOT for new_plate)
    else if (f.code.includes('REGISTRATION_TRANSFER')) {
      console.log(`  SKIPPED (tag transfer only): ${f.code} $${f.amount}`);
    }
    // Impact Fee: first-time only
    else if (f.code.includes('IMPACT')) {
      console.log(`  SKIPPED (first-time only): ${f.code} $${f.amount}`);
    }
    // Advanced/Replacement: likely conditional
    else if (f.code.includes('ADVANCED') || f.code.includes('REPLACEMENT')) {
      // Check condition
      console.log(`  CONDITIONAL: ${f.code} $${f.amount} - ${JSON.stringify(cond)}`);
    }
  });

  console.log('\nAPPLIED FEES:');
  appliedFees.forEach(f => console.log(`  ${f.code}: $${f.amount}`));
  console.log(`\nTOTAL: $${standardTotal.toFixed(2)}`);

  // Also show first-time registration total
  console.log('\n=== NEW TAG FINANCED SCENARIO ===');
  console.log('(new_plate, FIRST-TIME registration, financed, retail)\n');

  let firstTimeTotal = totalNoCondition;

  conditionalFees.forEach(f => {
    // Include first-time fees
    if (f.code.includes('TITLE_TRANSFER') || f.code.includes('TITLE_FEE') ||
        f.code.includes('LIEN') ||
        f.code.includes('NEW_LICENSE_PLATE') || f.code.includes('PLATE_ISSUANCE') ||
        f.code.includes('INITIAL_REGISTRATION') || f.code.includes('FIRST_TIME') ||
        f.code.includes('IMPACT')) {
      firstTimeTotal += f.amount;
    }
  });

  console.log(`TOTAL (first-time): $${firstTimeTotal.toFixed(2)}`);
}

analyze().catch(console.error);
