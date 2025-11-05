// run-migration.mjs
// Run this with: node run-migration.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Need: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read migration file
const sql = readFileSync('./supabase/migrations/20251105_create_garage_vehicles.sql', 'utf8');

console.log('🚀 Running migration: create_garage_vehicles');
console.log('📝 SQL:', sql.substring(0, 200) + '...');

// Execute SQL via RPC or raw query
try {
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    console.log('\n📤 Executing:', statement.substring(0, 100) + '...');

    const { data, error } = await supabase.rpc('exec', { sql: statement + ';' });

    if (error) {
      console.error('❌ Error:', error.message);
      // Continue with other statements
    } else {
      console.log('✅ Success');
    }
  }

  console.log('\n✅ Migration completed!');
  console.log('\n🔍 Checking if table exists...');

  const { data, error } = await supabase.from('garage_vehicles').select('count');

  if (error) {
    console.log('⚠️  Table may not exist yet. Run the SQL manually in Supabase SQL Editor.');
  } else {
    console.log('✅ garage_vehicles table exists!');
  }

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.log('\n📋 Run this SQL manually in Supabase SQL Editor:');
  console.log(sql);
  process.exit(1);
}
