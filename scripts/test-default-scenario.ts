/**
 * Test Default Scenario Fee Calculation
 *
 * Runs the actual fee engine to see what fees it calculates
 * for a default/baseline scenario
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { FeeCalculator } from '../packages/fee-engine/dist/engine/fee-calculator.js';
import type { ScenarioInput } from '../packages/fee-engine/dist/types/scenario-input.js';
import type { JurisdictionRule } from '../packages/fee-engine/dist/types/jurisdiction-rules.js';
import type { DealerConfig } from '../packages/fee-engine/dist/types/dealer-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Default dealer config (no dealer fees for this test)
const defaultDealerConfig: DealerConfig = {
  id: 'test',
  dealerId: 'test',
  configVersion: 'v1',
  configData: {
    packages: [{
      packageId: 'none',
      packageName: 'No Dealer Fees',
      fees: []
    }],
    defaultPackageId: 'none'
  },
  isActive: true
};

async function runTest() {
  console.log('=== Testing Fee Engine Default Scenario ===\n');

  // Fetch Florida rules from database
  const { data: rules, error } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL');

  if (error) {
    console.error('Error fetching rules:', error);
    return;
  }

  const jurisdictionRules = rules as unknown as JurisdictionRule[];
  console.log(`Loaded ${jurisdictionRules.length} jurisdiction rules\n`);

  const calculator = new FeeCalculator();

  // Test scenarios
  const scenarios: { name: string; input: Partial<ScenarioInput> }[] = [
    {
      name: 'Standard Financed (no trade-in, NOT first-time)',
      input: {
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: false
        },
        deal: {
          dealType: 'retail',
          sellingPrice: 30000,
          termMonths: 60,
          apr: 5.99,
          lenderType: 'bank'
        }
      }
    },
    {
      name: 'Standard Cash (no trade-in, NOT first-time)',
      input: {
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: false
        },
        deal: {
          dealType: 'retail',
          sellingPrice: 30000,
          termMonths: 0,
          lenderType: 'other'
        }
      }
    },
    {
      name: 'First-Time Registration (financed)',
      input: {
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: true
        },
        deal: {
          dealType: 'retail',
          sellingPrice: 30000,
          termMonths: 60,
          apr: 5.99,
          lenderType: 'bank'
        }
      }
    },
    {
      name: 'Trade-In Tag Transfer (financed)',
      input: {
        tradeIns: [{
          estimatedValue: 10000,
          payoffAmount: 3000
        }],
        registration: {
          plateScenario: 'transfer_existing_plate',
          firstTimeRegisteredInState: false
        },
        deal: {
          dealType: 'retail',
          sellingPrice: 30000,
          termMonths: 60,
          apr: 5.99,
          lenderType: 'bank'
        }
      }
    }
  ];

  for (const scenario of scenarios) {
    const baseInput: ScenarioInput = {
      scenarioId: '00000000-0000-0000-0000-000000000000',
      timestampUtc: new Date().toISOString(),
      jurisdiction: {
        countryCode: 'US',
        stateCode: 'FL',
        countyName: 'Miami-Dade',
        postalCode: '33101'
      },
      dealerContext: {
        dealerId: 'test',
        configVersion: 'v1',
        feePackageId: 'none'
      },
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank'
      },
      vehicle: {
        vin: '1HGBH41JXMN109186',
        year: 2024,
        make: 'Honda',
        model: 'Accord',
        bodyType: 'Sedan',
        newOrUsed: 'new',
        useType: 'personal'
      },
      tradeIns: [],
      registration: {
        plateScenario: 'new_plate',
        firstTimeRegisteredInState: false
      },
      customer: {
        residentStatus: 'resident'
      },
      ...scenario.input
    };

    // Merge nested objects properly
    if (scenario.input.deal) {
      baseInput.deal = { ...baseInput.deal, ...scenario.input.deal };
    }
    if (scenario.input.registration) {
      baseInput.registration = { ...baseInput.registration, ...scenario.input.registration };
    }
    if (scenario.input.tradeIns) {
      baseInput.tradeIns = scenario.input.tradeIns;
    }

    try {
      const result = await calculator.calculate(baseInput, jurisdictionRules, defaultDealerConfig);

      console.log(`\n=== ${scenario.name} ===`);
      console.log(`Detected: ${result.detectedScenario.type}`);
      console.log(`\nGovernment Fees:`);

      const govFees = result.lineItems.filter(item => item.category === 'government');
      govFees.forEach(fee => {
        console.log(`  ${fee.code}: $${fee.amount.toFixed(2)}`);
      });

      console.log(`\n  TOTAL GOV FEES: $${result.totals.governmentFees.toFixed(2)}`);
    } catch (err) {
      console.error(`Error for ${scenario.name}:`, err);
    }
  }
}

runTest().catch(console.error);
