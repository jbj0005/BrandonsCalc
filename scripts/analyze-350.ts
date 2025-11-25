/**
 * Analyze where $350.75 comes from
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

// Default scenario (standard financed - most common baseline)
const defaultScenario = {
  deal: {
    dealType: 'retail',
    sellingPrice: 30000,
    termMonths: 60,
    apr: 5.99
  },
  tradeIns: [], // No trade-in
  registration: {
    plateScenario: 'new_plate',
    firstTimeRegisteredInState: false // NOT first-time
  },
  vehicle: {
    salePrice: 30000
  },
  overrides: {}
};

async function analyze() {
  console.log('=== Analyzing Fee Breakdown for Default Scenario ===\n');
  console.log('Scenario: Standard Financed (no trade-in, NOT first-time registration)\n');

  const { data: rules, error } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee');

  if (error) {
    console.error('Error:', error);
    return;
  }

  let total = 0;
  const appliedFees: { code: string; amount: number; reason: string }[] = [];
  const skippedFees: { code: string; amount: number; reason: string }[] = [];

  for (const rule of rules) {
    const ruleData = rule.rule_data as any;
    const feeCode = ruleData.feeCode;
    const amount = ruleData.amount || 0;
    const conditions = ruleData.conditions;
    const autoApply = ruleData.autoApply !== false;

    // Check if this fee applies manually based on common conditions
    let applies = true;
    let reason = 'No conditions (always applies)';

    if (!autoApply) {
      applies = false;
      reason = 'autoApply is false (optional fee)';
    } else if (conditions && Object.keys(conditions).length > 0) {
      const condStr = JSON.stringify(conditions);

      // Manual condition evaluation for standard_financed scenario:
      // - No trade-in (tradeIns.length == 0)
      // - Financed (termMonths > 0)
      // - New plate (plateScenario == 'new_plate')
      // - NOT first-time registration

      if (condStr.includes('firstTimeRegisteredInState') && condStr.includes('true')) {
        applies = false;
        reason = 'Requires first-time registration (we have: false)';
      } else if (condStr.includes('transfer_existing_plate')) {
        applies = false;
        reason = 'Requires tag transfer (we have: new_plate)';
      } else if (condStr.includes('tradeIns.length') && condStr.includes('> 0') || condStr.includes('">",') && condStr.includes('tradeIns')) {
        applies = false;
        reason = 'Requires trade-in (we have: none)';
      } else if (condStr.includes('tradeIns.length') && condStr.includes('== 0') || condStr.includes('"==",') && condStr.includes('tradeIns') && condStr.includes('0')) {
        applies = true;
        reason = 'No trade-in condition met';
      } else if (condStr.includes('termMonths') && condStr.includes('> 0') || condStr.includes('">",') && condStr.includes('termMonths')) {
        applies = true;
        reason = 'Financed condition met (termMonths > 0)';
      } else if (condStr.includes('new_plate')) {
        applies = true;
        reason = 'New plate condition met';
      } else if (condStr.includes('isReplacementRegistration') || condStr.includes('isAdvancedRenewal')) {
        applies = false;
        reason = 'Requires replacement/advanced (we have: neither)';
      } else {
        // Check for null conditions
        if (conditions === null) {
          applies = true;
          reason = 'Null conditions (always applies)';
        } else {
          applies = true;
          reason = `Assuming applies: ${condStr.substring(0, 50)}...`;
        }
      }
    }

    if (applies) {
      total += amount;
      appliedFees.push({ code: feeCode, amount, reason });
    } else {
      skippedFees.push({ code: feeCode, amount, reason });
    }
  }

  console.log('APPLIED FEES:');
  console.log('-'.repeat(60));
  appliedFees.forEach(f => {
    console.log(`  ${f.code.padEnd(45)} $${f.amount.toFixed(2)}`);
    console.log(`    Reason: ${f.reason}\n`);
  });
  console.log('-'.repeat(60));
  console.log(`  TOTAL: $${total.toFixed(2)}\n`);

  console.log('\nSKIPPED FEES:');
  console.log('-'.repeat(60));
  skippedFees.forEach(f => {
    console.log(`  ${f.code.padEnd(45)} $${f.amount.toFixed(2)}`);
    console.log(`    Reason: ${f.reason}\n`);
  });

  // Check what combination equals $350.75
  console.log('\n=== Looking for combinations that equal $350.75 ===');

  const allFees = rules.map(r => ({
    code: (r.rule_data as any).feeCode,
    amount: (r.rule_data as any).amount || 0
  }));

  // Check if base fees + some first-time fees = $350.75
  const baseTotal = appliedFees.reduce((sum, f) => sum + f.amount, 0);
  console.log(`\nBase applied fees: $${baseTotal.toFixed(2)}`);

  // Find fees that would make it $350.75
  const needed = 350.75 - baseTotal;
  console.log(`Missing amount for $350.75: $${needed.toFixed(2)}`);

  skippedFees.forEach(f => {
    if (Math.abs(f.amount - needed) < 0.01) {
      console.log(`\n*** FOUND: Adding ${f.code} ($${f.amount}) would give $350.75 ***`);
    }
    const withThisFee = baseTotal + f.amount;
    if (Math.abs(withThisFee - 350.75) < 0.01) {
      console.log(`\n*** MATCH: Base + ${f.code} = $${withThisFee.toFixed(2)} ***`);
    }
  });
}

analyze().catch(console.error);
