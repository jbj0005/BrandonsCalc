/**
 * Refine Florida Fee Rules
 *
 * Updates the jurisdiction_rules to mark optional fees and exclude
 * fees that should never auto-apply
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

/**
 * Fees that should NEVER auto-apply
 */
const EXCLUDE_FEES = [
  'FL_FAST_/_SAME-DAY_TITLE_PRINT_FEE', // User must opt-in for fast title
  'FL_AUTHENTICATION_/_HISTORICAL_PLATE_FEE', // Optional specialty plate
  'FL_DELINQUENT_/_LATE_FEES', // Should never auto-apply
  'FL_REPLACEMENT_PLATE_/_DECAL_/_DUPLICATE_REGISTRATION_FEE', // Only for replacements
  'FL_COMMERCIAL_MOTOR_VEHICLE_/_HEAVY_VEHICLE_SURCHARGE', // Commercial only
];

/**
 * Fees that should be marked as optional (require user confirmation)
 */
const OPTIONAL_FEES = [
  'FL_PAPER_TITLE_PRINT_FEE_/_SERVICE_&_HANDLING', // Optional - electronic is default
  'FL_LICENSE_PLATE_MAILING_/_DECAL_MAILING_FEE', // Optional - can pick up
];

/**
 * Always-mandatory fees (no conditions, always apply)
 */
const ALWAYS_MANDATORY = [
  'FL_BASE_REGISTRATION_/_LICENSE_PLATE_/_TAG_FEE',
  'FL_BRANCH_/_ISSUING_AGENCY_/_PROCESSING_FEE',
  'FL_AIR_POLLUTION_CONTROL_FEE',
  'FL_INITIAL_ADDITIONAL_FEE_/_ANNUAL_ADDITIONAL_FEE',
  'FL_DECAL_FEE',
];

/**
 * Fees with specific conditions (already configured)
 */
const CONDITIONAL_FEES = [
  'FL_INITIAL_REGISTRATION_FEE',
  'FL_TITLE_FEE_ELECTRONIC_TITLE',
  'FL_TITLE_TRANSFER_/_DUPLICATE_TITLE',
  'FL_LIEN_FILING_/_RECORDING_FEE',
  'FL_NEW_LICENSE_PLATE_/_PLATE_ISSUANCE_FEE',
  'FL_REGISTRATION_TRANSFER_FEE',
];

/**
 * Fee that needs additional condition (Advanced/Replacement)
 */
const NEEDS_CONDITIONS = {
  'FL_ADVANCED_/_REPLACEMENT_FEE': {
    // Only if replacing or advancing registration
    or: [
      { '==': [{ var: 'overrides.isReplacementRegistration' }, true] },
      { '==': [{ var: 'overrides.isAdvancedRenewal' }, true] },
    ],
  },
};

async function refineRules() {
  console.log('🔧 Refining Florida fee rules...\n');

  // 1. Delete fees that should never auto-apply
  console.log('🗑️  Removing fees that should never auto-apply...');
  for (const feeCode of EXCLUDE_FEES) {
    const { error } = await supabase
      .from('jurisdiction_rules')
      .delete()
      .eq('state_code', 'FL')
      .eq('rule_type', 'government_fee')
      .eq('rule_data->>feeCode', feeCode);

    if (error) {
      console.error(`   ❌ Error deleting ${feeCode}:`, error);
    } else {
      console.log(`   ✓ Removed ${feeCode}`);
    }
  }

  // 2. Mark optional fees
  console.log('\n📋 Marking optional fees...');
  for (const feeCode of OPTIONAL_FEES) {
    const { data: rules } = await supabase
      .from('jurisdiction_rules')
      .select('*')
      .eq('state_code', 'FL')
      .eq('rule_type', 'government_fee')
      .eq('rule_data->>feeCode', feeCode)
      .single();

    if (rules) {
      const ruleData = rules.rule_data as any;
      ruleData.optional = true;
      ruleData.autoApply = false;

      const { error } = await supabase
        .from('jurisdiction_rules')
        .update({ rule_data: ruleData })
        .eq('id', rules.id);

      if (error) {
        console.error(`   ❌ Error updating ${feeCode}:`, error);
      } else {
        console.log(`   ✓ Marked ${feeCode} as optional`);
      }
    }
  }

  // 3. Ensure always-mandatory fees have no conditions
  console.log('\n✅ Ensuring always-mandatory fees are configured...');
  for (const feeCode of ALWAYS_MANDATORY) {
    const { data: rules } = await supabase
      .from('jurisdiction_rules')
      .select('*')
      .eq('state_code', 'FL')
      .eq('rule_type', 'government_fee')
      .eq('rule_data->>feeCode', feeCode)
      .single();

    if (rules) {
      const ruleData = rules.rule_data as any;
      ruleData.conditions = null; // No conditions = always applies
      ruleData.optional = false;
      ruleData.autoApply = true;

      const { error } = await supabase
        .from('jurisdiction_rules')
        .update({ rule_data: ruleData })
        .eq('id', rules.id);

      if (error) {
        console.error(`   ❌ Error updating ${feeCode}:`, error);
      } else {
        console.log(`   ✓ Confirmed ${feeCode} as always mandatory`);
      }
    }
  }

  // 4. Add conditions to fees that need them
  console.log('\n🎯 Adding conditions to specific fees...');
  for (const [feeCode, conditions] of Object.entries(NEEDS_CONDITIONS)) {
    const { data: rules } = await supabase
      .from('jurisdiction_rules')
      .select('*')
      .eq('state_code', 'FL')
      .eq('rule_type', 'government_fee')
      .eq('rule_data->>feeCode', feeCode)
      .single();

    if (rules) {
      const ruleData = rules.rule_data as any;
      ruleData.conditions = conditions;
      ruleData.optional = false;
      ruleData.autoApply = true;

      const { error } = await supabase
        .from('jurisdiction_rules')
        .update({ rule_data: ruleData })
        .eq('id', rules.id);

      if (error) {
        console.error(`   ❌ Error updating ${feeCode}:`, error);
      } else {
        console.log(`   ✓ Added conditions to ${feeCode}`);
      }
    }
  }

  // 5. Summary
  console.log('\n📊 Summary of changes:');
  const { data: allRules } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee');

  const mandatory = allRules?.filter((r) => {
    const rd = r.rule_data as any;
    return !rd.optional && rd.autoApply !== false;
  });

  const optional = allRules?.filter((r) => {
    const rd = r.rule_data as any;
    return rd.optional || rd.autoApply === false;
  });

  console.log(`   Total government fee rules: ${allRules?.length}`);
  console.log(`   Mandatory (auto-apply): ${mandatory?.length}`);
  console.log(`   Optional (require user action): ${optional?.length}`);
  console.log(`   Removed (excluded): ${EXCLUDE_FEES.length}`);

  console.log('\n✅ Mandatory fees that will auto-apply:');
  mandatory?.forEach((rule) => {
    const rd = rule.rule_data as any;
    console.log(`   • ${rd.description}: $${rd.amount || 'variable'}`);
  });

  console.log('\n⚠️  Optional fees (will NOT auto-apply):');
  optional?.forEach((rule) => {
    const rd = rule.rule_data as any;
    console.log(`   • ${rd.description}: $${rd.amount || 'variable'}`);
  });

  console.log('\n✨ Refinement complete!');
}

refineRules().catch((error) => {
  console.error('❌ Refinement failed:', error);
  process.exit(1);
});
