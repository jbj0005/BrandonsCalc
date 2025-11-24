/**
 * Simplified Fee Engine Test
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function test() {
  console.log('🧪 Testing Fee Engine\n');

  // Dynamic import to avoid module issues
  const { FeeCalculator, CalculatorAdapter } = await import(
    '../packages/fee-engine/dist/index.js'
  );

  console.log('✅ Fee engine modules loaded successfully');
  console.log('   - FeeCalculator:', typeof FeeCalculator);
  console.log('   - CalculatorAdapter:', typeof CalculatorAdapter);

  // Fetch rules from database
  console.log('\n📥 Fetching jurisdiction rules...');
  const { data: rules, error } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL');

  if (error) {
    console.error('❌ Error fetching rules:', error);
    return;
  }

  console.log(`✅ Loaded ${rules.length} Florida rules`);

  // Create test scenario
  const adapter = new CalculatorAdapter();
  const calculator = new FeeCalculator();

  const testState = {
    salePrice: 25000,
    cashDown: 3000,
    loanTerm: 60,
    apr: 5.99,
    selectedTradeInVehicles: [
      {
        estimated_value: 8000,
        payoff_amount: 5000,
      },
    ],
    userProfile: {
      state_code: 'FL',
      county_name: 'Brevard',
    },
    selectedVehicle: {
      year: 2020,
      condition: 'used',
    },
  };

  console.log('\n🎯 Converting calculator state to scenario input...');
  const scenarioInput = adapter.mapToScenarioInput(testState);
  console.log('✅ Scenario input created');
  console.log('   - Scenario ID:', scenarioInput.scenarioId);
  console.log('   - Has trade-in:', scenarioInput.tradeIns.length > 0);
  console.log('   - Plate scenario:', scenarioInput.registration.plateScenario);

  // Default dealer config
  const dealerConfig = {
    id: 'test',
    dealerId: 'default',
    configVersion: 'v1',
    configData: {
      packages: [
        {
          packageId: 'retail_default',
          packageName: 'Default',
          fees: [
            { code: 'DOC_FEE', description: 'Documentation Fee', amount: 699, taxable: false },
          ],
        },
      ],
      defaultPackageId: 'retail_default',
    },
    isActive: true,
  };

  console.log('\n⚙️  Calculating fees...');
  const result = await calculator.calculate(scenarioInput, rules, dealerConfig);

  console.log('✅ Calculation complete!\n');
  console.log('📊 RESULTS:');
  console.log('   Detected Scenario:', result.detectedScenario.description);
  console.log('   Government Fees: $', result.totals.governmentFees.toFixed(2));
  console.log('   Dealer Fees: $', result.totals.dealerFees.toFixed(2));
  console.log('   Sales Tax: $', result.totals.salesTax.toFixed(2));
  console.log('   Total Fees: $', result.totals.totalFees.toFixed(2));
  console.log('   Amount Financed: $', result.totals.amountFinanced?.toFixed(2));

  console.log('\n💰 Government Fee Breakdown:');
  result.lineItems
    .filter((item) => item.category === 'government')
    .forEach((item) => {
      console.log(`   ✓ ${item.description}: $${item.amount.toFixed(2)}`);
    });

  console.log('\n💵 Tax Breakdown:');
  console.log('   Taxable Base: $', result.taxBreakdown.taxableBase.toFixed(2));
  console.log('   State Tax (6%): $', result.taxBreakdown.stateTax.toFixed(2));
  console.log('   County Tax (1%): $', result.taxBreakdown.countyTax.toFixed(2));
  console.log('   County Capped:', result.taxBreakdown.countyTaxCapped ? 'YES' : 'NO');

  console.log('\n✨ Test Complete!');
}

test().catch(console.error);
