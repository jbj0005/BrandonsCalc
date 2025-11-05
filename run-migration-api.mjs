#!/usr/bin/env node
// Run migration via Supabase API
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

// Read the fix migration
const sql = readFileSync('./supabase/migrations/20251105_fix_garage_vehicles.sql', 'utf8');

console.log('🚀 Running migration via Supabase API...');
console.log('📝 SQL length:', sql.length, 'characters');

try {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    console.error('❌ API Error:', response.status, response.statusText);
    const text = await response.text();
    console.error(text);
    process.exit(1);
  }

  const result = await response.json();
  console.log('✅ Migration successful!');
  console.log('Result:', result);

  // Verify the table
  console.log('\n🔍 Verifying garage_vehicles table...');
  const verifyResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/garage_vehicles?select=count`,
    {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    }
  );

  if (verifyResponse.ok) {
    console.log('✅ Table exists and is accessible!');
  } else {
    console.log('⚠️  Table might need manual creation via dashboard');
  }

} catch (error) {
  console.error('❌ Error running migration:', error.message);
  console.log('\n📋 Manual option: Copy SQL from:');
  console.log('   supabase/migrations/20251105_fix_garage_vehicles.sql');
  console.log('   And run it in Supabase Dashboard SQL Editor');
  process.exit(1);
}
