/**
 * Analyze Fee Application Logic
 *
 * Show which fees apply for different scenarios
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

async function analyzeFeeLogic() {
  console.log('🔍 Analyzing Fee Application Logic\n');

  const { data: rules, error } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee');

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  // Group fees by category
  const titleFees = rules.filter((r) => {
    const rd = r.rule_data as any;
    return rd.description.toLowerCase().includes('title');
  });

  const registrationFees = rules.filter((r) => {
    const rd = r.rule_data as any;
    return (
      rd.description.toLowerCase().includes('registration') ||
      rd.description.toLowerCase().includes('plate')
    );
  });

  const otherFees = rules.filter((r) => {
    const rd = r.rule_data as any;
    return (
      !rd.description.toLowerCase().includes('title') &&
      !rd.description.toLowerCase().includes('registration') &&
      !rd.description.toLowerCase().includes('plate')
    );
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TITLE FEES (Mutually Exclusive)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  titleFees.forEach((rule) => {
    const rd = rule.rule_data as any;
    console.log(`📄 ${rd.description}: $${rd.amount}`);
    console.log(`   Optional: ${rd.optional || false}`);
    console.log(`   Auto-Apply: ${rd.autoApply !== false}`);

    if (rd.conditions) {
      console.log(`   Conditions:`);
      console.log(`   ${JSON.stringify(rd.conditions, null, 6)}`);
    } else {
      console.log(`   Conditions: ALWAYS APPLIES (unless optional)`);
    }
    console.log('');
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('REGISTRATION/PLATE FEES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  registrationFees.forEach((rule) => {
    const rd = rule.rule_data as any;
    console.log(`🏷️  ${rd.description}: $${rd.amount}`);
    console.log(`   Optional: ${rd.optional || false}`);
    console.log(`   Auto-Apply: ${rd.autoApply !== false}`);

    if (rd.conditions) {
      console.log(`   Conditions:`);
      console.log(`   ${JSON.stringify(rd.conditions, null, 6)}`);
    } else {
      console.log(`   Conditions: ALWAYS APPLIES`);
    }
    console.log('');
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('OTHER FEES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  otherFees.forEach((rule) => {
    const rd = rule.rule_data as any;
    console.log(`💰 ${rd.description}: $${rd.amount}`);
    console.log(`   Optional: ${rd.optional || false}`);
    console.log(`   Auto-Apply: ${rd.autoApply !== false}`);

    if (rd.conditions) {
      console.log(`   Conditions:`);
      console.log(`   ${JSON.stringify(rd.conditions, null, 6)}`);
    } else {
      console.log(`   Conditions: ALWAYS APPLIES`);
    }
    console.log('');
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SCENARIO DECISION TREE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`
SCENARIO 1: Trade-in with Tag Transfer + Financing
├─ Title Fees:
│  └─ ✅ Title Transfer ($75.25)
│     └─ Why: Has trade-in (tradeIns.length > 0)
├─ Registration Fees:
│  ├─ ✅ Registration Transfer Fee ($4.60)
│  │  └─ Why: plateScenario = 'transfer_existing_plate'
│  └─ ✅ Base Registration Fee ($14.50)
│     └─ Why: Always applies
├─ Other Fees:
│  ├─ ✅ Lien Filing Fee ($2.00)
│  │  └─ Why: Financed (termMonths > 0)
│  ├─ ✅ Branch Processing ($0.50)
│  ├─ ✅ Air Pollution Control ($1.00)
│  ├─ ✅ Initial Additional Fee ($1.50)
│  └─ ✅ Decal Fee ($1.00)
│     └─ Why: Always apply
└─ Total Government Fees: ~$100.35

SCENARIO 2: New Purchase + New Tag + Cash
├─ Title Fees:
│  └─ ✅ Title Fee (Electronic) ($77.25)
│     └─ Why: NO trade-in AND plateScenario = 'new_plate'
├─ Registration Fees:
│  ├─ ✅ New License Plate Fee ($28.00)
│  │  └─ Why: plateScenario = 'new_plate'
│  └─ ✅ Base Registration Fee ($14.50)
│     └─ Why: Always applies
├─ Other Fees:
│  ├─ ❌ Lien Filing Fee
│  │  └─ Why: NOT financed (termMonths = 0)
│  ├─ ✅ Branch Processing ($0.50)
│  ├─ ✅ Air Pollution Control ($1.00)
│  ├─ ✅ Initial Additional Fee ($1.50)
│  └─ ✅ Decal Fee ($1.00)
│     └─ Why: Always apply
└─ Total Government Fees: ~$123.75

SCENARIO 3: First-Time FL Registration (Out-of-State)
├─ Title Fees:
│  └─ ✅ Title Fee (Electronic) ($77.25)
│     └─ Why: NO trade-in AND plateScenario = 'new_plate'
├─ Registration Fees:
│  ├─ ✅ Initial Registration Fee ($225.00)
│  │  └─ Why: firstTimeRegisteredInState = true AND new_plate/temp_tag
│  ├─ ✅ New License Plate Fee ($28.00)
│  │  └─ Why: plateScenario = 'new_plate'
│  └─ ✅ Base Registration Fee ($14.50)
│     └─ Why: Always applies
├─ Other Fees:
│  ├─ ✅ Branch Processing ($0.50)
│  ├─ ✅ Air Pollution Control ($1.00)
│  ├─ ✅ Initial Additional Fee ($1.50)
│  └─ ✅ Decal Fee ($1.00)
│     └─ Why: Always apply
└─ Total Government Fees: ~$348.75
  `);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('KEY QUESTIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('❓ Title Transfer vs. Title Fee (Electronic):');
  console.log('   These are MUTUALLY EXCLUSIVE based on trade-in:');
  console.log('   • Title Transfer = Has trade-in (tradeIns.length > 0)');
  console.log('   • Title Fee (Electronic) = NO trade-in (tradeIns.length = 0)');
  console.log('   ⚠️  Only ONE of these should ever apply!\n');

  console.log('❓ What fees ALWAYS apply?');
  console.log('   • Base Registration Fee ($14.50)');
  console.log('   • Branch Processing Fee ($0.50)');
  console.log('   • Air Pollution Control Fee ($1.00)');
  console.log('   • Initial Additional Fee ($1.50)');
  console.log('   • Decal Fee ($1.00)');
  console.log('   → These have NO conditions (conditions = null)\n');

  console.log('❓ What about "Electronic Filing Fee"?');
  console.log('   • We have "Lien Filing / Recording Fee" ($2.00)');
  console.log('   • This only applies if FINANCED (termMonths > 0)');
  console.log('   • Is this the fee you mean? Or is there a separate electronic filing fee?\n');
}

analyzeFeeLogic().catch(console.error);
