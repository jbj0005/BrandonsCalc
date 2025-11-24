/**
 * Migrate Florida Government Fees to Jurisdiction Rules
 *
 * Converts florida_govt_vehicle_fees.json to jurisdiction_rules format
 * and inserts into Supabase database.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

// Supabase config from .env
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface FloridaFee {
  'Fee Type': string;
  Description: string;
  Amount: number | string;
  Notes: string;
}

/**
 * Map Florida fee to jurisdiction rule with JSONLogic conditions
 */
function mapFeeToRule(fee: FloridaFee, index: number): any {
  const feeCode = fee.Description.replace(/\s+/g, '_')
    .replace(/[()]/g, '')
    .toUpperCase();

  // Determine conditions based on fee description/notes
  let conditions: any = null;

  if (fee.Description.includes('Initial Registration')) {
    // Initial Registration: only if first-time registration
    conditions = {
      and: [
        { '==': [{ var: 'registration.firstTimeRegisteredInState' }, true] },
        { in: [{ var: 'registration.plateScenario' }, ['new_plate', 'temp_tag']] },
      ],
    };
  } else if (fee.Description.includes('Title Transfer')) {
    // Title Transfer: when there's a trade-in
    conditions = {
      '>': [{ var: 'tradeIns.length' }, 0],
    };
  } else if (fee.Description.includes('Title Fee (Electronic Title)')) {
    // New Title: no trade-in
    conditions = {
      and: [
        { '==': [{ var: 'tradeIns.length' }, 0] },
        { '==': [{ var: 'registration.plateScenario' }, 'new_plate'] },
      ],
    };
  } else if (fee.Description.includes('Lien Filing')) {
    // Lien Filing: only if financed
    conditions = {
      '>': [{ var: 'deal.termMonths' }, 0],
    };
  } else if (fee.Description.includes('New License Plate')) {
    // New Plate: only if new_plate scenario
    conditions = {
      '==': [{ var: 'registration.plateScenario' }, 'new_plate'],
    };
  } else if (fee.Description.includes('Registration Transfer')) {
    // Tag Transfer: only if transfer_existing_plate
    conditions = {
      '==': [{ var: 'registration.plateScenario' }, 'transfer_existing_plate'],
    };
  }

  // Parse amount (handle ranges like "14.50–32.50")
  let amount: number | null = null;
  if (typeof fee.Amount === 'number') {
    amount = fee.Amount;
  } else if (typeof fee.Amount === 'string') {
    // Extract first number from range
    const match = fee.Amount.match(/[\d.]+/);
    amount = match ? parseFloat(match[0]) : null;
  }

  return {
    state_code: 'FL',
    county_name: null, // State-wide rule
    rule_type: 'government_fee',
    rule_data: {
      feeCode: `FL_${feeCode}`,
      description: fee.Description,
      amount: amount,
      conditions: conditions,
      taxable: false,
      priority: 100 - index, // Higher index = lower priority
      explanation: fee.Notes,
    },
    version: 'v1',
    effective_date: new Date().toISOString(),
    expiration_date: null,
  };
}

/**
 * Insert Florida tax rates
 */
function createFloridaTaxRules(): any[] {
  return [
    // State tax rate (6%)
    {
      state_code: 'FL',
      county_name: null,
      rule_type: 'tax_calculation',
      rule_data: {
        rateType: 'state',
        ratePercent: 6.0,
        capAmount: null,
        conditions: null, // Always applies
        effectiveDate: new Date().toISOString(),
        expirationDate: null,
      },
      version: 'v1',
      effective_date: new Date().toISOString(),
      expiration_date: null,
    },
    // Default county tax rate (1% with $5k cap)
    {
      state_code: 'FL',
      county_name: null, // Default for all FL counties
      rule_type: 'tax_calculation',
      rule_data: {
        rateType: 'county',
        ratePercent: 1.0,
        capAmount: 5000,
        conditions: null,
        effectiveDate: new Date().toISOString(),
        expirationDate: null,
      },
      version: 'v1',
      effective_date: new Date().toISOString(),
      expiration_date: null,
    },
  ];
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting Florida fees migration...\n');

  // 1. Load Florida fees JSON
  const floridaFeesPath = path.join(__dirname, '../assets/florida_govt_vehicle_fees.json');
  const floridaFees: FloridaFee[] = JSON.parse(fs.readFileSync(floridaFeesPath, 'utf-8'));

  console.log(`📄 Loaded ${floridaFees.length} Florida government fees`);

  // 2. Convert to jurisdiction rules
  const feeRules = floridaFees.map((fee, index) => mapFeeToRule(fee, index));
  const taxRules = createFloridaTaxRules();
  const allRules = [...feeRules, ...taxRules];

  console.log(`✅ Converted to ${allRules.length} jurisdiction rules\n`);

  // 3. Clear existing FL rules (optional - comment out if you want to keep existing)
  console.log('🗑️  Clearing existing FL rules...');
  const { error: deleteError } = await supabase
    .from('jurisdiction_rules')
    .delete()
    .eq('state_code', 'FL');

  if (deleteError) {
    console.error('❌ Error clearing existing rules:', deleteError);
  } else {
    console.log('✅ Cleared existing FL rules\n');
  }

  // 4. Insert new rules
  console.log('📝 Inserting new jurisdiction rules...');
  const { data, error } = await supabase.from('jurisdiction_rules').insert(allRules).select();

  if (error) {
    console.error('❌ Error inserting rules:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully inserted ${data?.length} jurisdiction rules\n`);

  // 5. Verify insertion
  const { count } = await supabase
    .from('jurisdiction_rules')
    .select('*', { count: 'exact', head: true })
    .eq('state_code', 'FL');

  console.log(`📊 Total FL rules in database: ${count}\n`);

  // 6. Show sample rules
  const { data: sampleRules } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee')
    .limit(5);

  console.log('📋 Sample rules:');
  sampleRules?.forEach((rule) => {
    const ruleData = rule.rule_data as any;
    console.log(`  - ${ruleData.description}: $${ruleData.amount || 'variable'}`);
  });

  console.log('\n✨ Migration complete!');
}

// Run migration
migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
