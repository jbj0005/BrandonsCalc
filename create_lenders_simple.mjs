#!/usr/bin/env node
/**
 * Simple lenders table setup using Supabase client
 * This creates the table and populates it with initial data
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('📝 Note: The lenders table needs to be created in Supabase Dashboard first.');
console.log('Go to https://txndueuqljeujlccngbj.supabase.co/project/txndueuqljeujlccngbj/editor/sql\n');
console.log('Paste the SQL from: supabase/migrations/20251113000001_create_lenders_table.sql\n');
console.log('After creating the table, run this script again to insert data.\n');

// Try to insert lenders - this will verify table exists and populate it
const lenders = [
  { id: 'nfcu', source: 'nfcu', short_name: 'NFCU', long_name: 'Navy Federal Credit Union', display_order: 1, is_active: true },
  { id: 'sccu', source: 'sccu', short_name: 'SCCU', long_name: 'Space Coast Credit Union', display_order: 2, is_active: true },
  { id: 'penfed', source: 'penfed', short_name: 'PenFed', long_name: 'Pentagon Federal Credit Union', display_order: 3, is_active: true },
  { id: 'dcu', source: 'dcu', short_name: 'DCU', long_name: 'Digital Federal Credit Union', display_order: 4, is_active: true },
  { id: 'launchcu', source: 'launchcu', short_name: 'Launch CU', long_name: 'Launch Federal Credit Union', display_order: 5, is_active: true },
  { id: 'ngfcu', source: 'ngfcu', short_name: 'NGFCU', long_name: 'Nightingale Federal Credit Union', display_order: 6, is_active: true },
  { id: 'ccufl', source: 'ccufl', short_name: 'CCU FL', long_name: 'Community Credit Union of Florida', display_order: 7, is_active: true },
  { id: 'ccu_mi', source: 'ccu_mi', short_name: 'CCU MI', long_name: 'Community Credit Union Michigan', display_order: 8, is_active: false },
  { id: 'ccu_online', source: 'ccu_online', short_name: 'CCU Online', long_name: 'Community Credit Union (Online)', display_order: 9, is_active: false },
  { id: 'lcu', source: 'lcu', short_name: 'LCU', long_name: 'Launch Credit Union (Legacy)', display_order: 10, is_active: false }
];

console.log(`Attempting to insert ${lenders.length} lenders...`);

const { data, error } = await supabase
  .from('lenders')
  .upsert(lenders, { onConflict: 'id' })
  .select();

if (error) {
  if (error.message.includes('does not exist')) {
    console.log('\n❌ Table does not exist yet. Please create it first using the SQL editor.');
    console.log('SQL file location: supabase/migrations/20251113000001_create_lenders_table.sql');
  } else {
    console.error('\n❌ Error inserting lenders:', error.message);
  }
  process.exit(1);
} else {
  console.log(`\n✅ Successfully inserted/updated ${data.length} lenders!`);
  data.forEach(l => console.log(`  - ${l.long_name} (${l.id})`));
}
