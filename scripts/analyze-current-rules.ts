/**
 * Analyze Current Florida Rules
 *
 * Query database to see what rules exist and identify which should be optional
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
  console.log('🔍 Analyzing current Florida rules...\n');

  const { data: rules, error } = await supabase
    .from('jurisdiction_rules')
    .select('*')
    .eq('state_code', 'FL')
    .eq('rule_type', 'government_fee');

  if (error) {
    console.error('❌ Error fetching rules:', error);
    return;
  }

  console.log(`Found ${rules.length} government fee rules:\n`);

  rules.forEach((rule, index) => {
    const ruleData = rule.rule_data as any;
    console.log(`${index + 1}. ${ruleData.description}`);
    console.log(`   Amount: $${ruleData.amount || 'variable'}`);
    console.log(`   Has Conditions: ${ruleData.conditions ? 'YES' : 'NO'}`);
    console.log(`   Fee Code: ${ruleData.feeCode}`);
    console.log('');
  });
}

analyze().catch(console.error);
