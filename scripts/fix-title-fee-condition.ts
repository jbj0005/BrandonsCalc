/**
 * Fix Title Fee (Electronic) Condition
 *
 * Update to apply whenever there's NO trade-in,
 * regardless of plate scenario
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

async function fixTitleFeeCondition() {
  console.log('🔧 Fixing Title Fee (Electronic) condition...\n');

  // Find the Title Fee (Electronic) rule
  const { data: rule } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee')
    .eq('rule_data->>feeCode', 'FL_TITLE_FEE_ELECTRONIC_TITLE')
    .single();

  if (!rule) {
    console.error('❌ Title Fee (Electronic) rule not found!');
    return;
  }

  console.log('📄 Current Title Fee (Electronic) rule:');
  const ruleData = rule.rule_data as any;
  console.log(`   Description: ${ruleData.description}`);
  console.log(`   Amount: $${ruleData.amount}`);
  console.log(`   Current Condition:`);
  console.log(`   ${JSON.stringify(ruleData.conditions, null, 3)}\n`);

  // Update to simplified condition
  ruleData.conditions = {
    '==': [{ var: 'tradeIns.length' }, 0],
  };

  const { error } = await supabase
    .from('jurisdiction_rules')
    .update({ rule_data: ruleData })
    .eq('id', rule.id);

  if (error) {
    console.error('❌ Error updating rule:', error);
    return;
  }

  console.log('✅ Updated Title Fee (Electronic) condition to:');
  console.log(`   ${JSON.stringify(ruleData.conditions, null, 3)}\n`);

  console.log('📋 Logic Summary:');
  console.log('   Title Transfer ($75.25):');
  console.log('   └─ Applies when: tradeIns.length > 0');
  console.log('');
  console.log('   Title Fee Electronic ($77.25):');
  console.log('   └─ Applies when: tradeIns.length = 0');
  console.log('');
  console.log('   These are now MUTUALLY EXCLUSIVE based solely on trade-in!');
  console.log('   Plate scenario (new vs transfer) is separate from title fees.\n');

  console.log('✨ Fix complete!');
}

fixTitleFeeCondition().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
