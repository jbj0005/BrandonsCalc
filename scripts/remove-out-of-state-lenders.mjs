#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file manually
const envPath = resolve(__dirname, '../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
} catch (err) {
  // .env file not found, use existing env vars
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const lendersToRemove = ['alliant', 'ccu_il', 'ccu_online', 'ccu_mi'];

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('Removing Out-of-State Lenders from Supabase');
  console.log('='.repeat(80) + '\n');

  for (const lender of lendersToRemove) {
    console.log(`\nRemoving: ${lender.toUpperCase()}`);

    // Delete from auto_rates table
    const { data, error, count } = await supabase
      .from('auto_rates')
      .delete({ count: 'exact' })
      .eq('source', lender);

    if (error) {
      console.error(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  ✅ Deleted ${count || 0} rate records`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Cleanup Complete');
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
