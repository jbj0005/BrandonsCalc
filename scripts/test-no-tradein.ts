/**
 * Test No Trade-in Scenario
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

async function test() {
  console.log('🧪 Testing No Trade-in Scenario\n');

  const { FeeCalculator, CalculatorAdapter } = await import(
    '../packages/fee-engine/dist/index.js'
  );

  const { data: rules } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL');

  console.log(`✅ Loaded ${rules!.length} Florida rules\n`);

  // Scenario: No trade-in, but transferring plate from another vehicle
  const testState = {
    salePrice: 25000,
    cashDown: 5000,
    loanTerm: 60,
    apr: 5.99,
    selectedTradeInVehicles: [], // NO TRADE-IN
    userProfile: {
      state_code: 'FL',
      county_name: 'Brevard',
    },
    selectedVehicle: {
      year: 2020,
      condition: 'used',
    },
  };

  const adapter = new CalculatorAdapter();
  const calculator = new FeeCalculator();

  console.log('📋 Test Case 1: No Trade-in + Transfer Existing Plate\n');

  // Override to simulate transferring plate from another vehicle (not a trade-in)
  const scenarioInput = adapter.mapToScenarioInput(testState);
  scenarioInput.registration.plateScenario = 'transfer_existing_plate';
  scenarioInput.registration.firstTimeRegisteredInState = false;

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

  const result = await calculator.calculate(scenarioInput, rules!, dealerConfig);

  console.log('📊 RESULTS:');
  console.log('   Scenario:', result.detectedScenario.description);
  console.log('   Government Fees: $', result.totals.governmentFees.toFixed(2));
  console.log('\n💰 Government Fee Breakdown:');
  result.lineItems
    .filter((item) => item.category === 'government')
    .forEach((item) => {
      console.log(`   ${item.description.includes('Title') ? '📄' : '💵'} ${item.description}: $${item.amount.toFixed(2)}`);
    });

  const hasTitleFee = result.lineItems.some(
    (item) => item.description.includes('Title Fee (Electronic')
  );
  const hasTitleTransfer = result.lineItems.some(
    (item) => item.description.includes('Title Transfer')
  );

  console.log('\n✅ Validation:');
  console.log(`   Title Fee (Electronic) applied: ${hasTitleFee ? '✓ YES' : '✗ NO'}`);
  console.log(`   Title Transfer applied: ${hasTitleTransfer ? '✓ YES' : '✗ NO'}`);
  console.log(`   Mutually exclusive: ${hasTitleFee !== hasTitleTransfer ? '✓ PASS' : '✗ FAIL'}`);

  // Test Case 2: No trade-in + New Plate
  console.log('\n\n📋 Test Case 2: No Trade-in + New Plate\n');

  const scenarioInput2 = adapter.mapToScenarioInput(testState);
  scenarioInput2.registration.plateScenario = 'new_plate';
  scenarioInput2.registration.firstTimeRegisteredInState = false;

  const result2 = await calculator.calculate(scenarioInput2, rules!, dealerConfig);

  console.log('📊 RESULTS:');
  console.log('   Scenario:', result2.detectedScenario.description);
  console.log('   Government Fees: $', result2.totals.governmentFees.toFixed(2));
  console.log('\n💰 Government Fee Breakdown:');
  result2.lineItems
    .filter((item) => item.category === 'government')
    .forEach((item) => {
      console.log(`   ${item.description.includes('Title') || item.description.includes('Plate') ? '📄' : '💵'} ${item.description}: $${item.amount.toFixed(2)}`);
    });

  const hasTitleFee2 = result2.lineItems.some(
    (item) => item.description.includes('Title Fee (Electronic')
  );
  const hasTitleTransfer2 = result2.lineItems.some(
    (item) => item.description.includes('Title Transfer')
  );

  console.log('\n✅ Validation:');
  console.log(`   Title Fee (Electronic) applied: ${hasTitleFee2 ? '✓ YES' : '✗ NO'}`);
  console.log(`   Title Transfer applied: ${hasTitleTransfer2 ? '✓ YES' : '✗ NO'}`);
  console.log(`   Mutually exclusive: ${hasTitleFee2 !== hasTitleTransfer2 ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\n✨ Test Complete!');
}

test().catch(console.error);
