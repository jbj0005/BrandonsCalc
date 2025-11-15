#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('Reading migration file...');
const sql = readFileSync('./supabase/migrations/20251113000001_create_lenders_table.sql', 'utf-8');

console.log('Applying migration to Supabase...\n');

// Use the REST API directly
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
  method: 'POST',
  headers: {
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({ query: sql })
});

const text = await response.text();
console.log('Response status:', response.status);
console.log('Response:', text);

if (!response.ok) {
  console.error('\n❌ Migration failed');
  process.exit(1);
} else {
  console.log('\n✅ Migration applied successfully!');

  // Verify table was created
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.from('lenders').select('count');

  if (!error) {
    console.log('✅ Lenders table verified - table is accessible');
  }
}
