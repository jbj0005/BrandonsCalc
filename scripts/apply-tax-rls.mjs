#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: {
    schema: 'public'
  }
});

async function main() {
  console.log('[apply-rls] Applying RLS policies for county_surtax_windows...');

  // Enable RLS
  const enableRls = `ALTER TABLE county_surtax_windows ENABLE ROW LEVEL SECURITY;`;

  // Create anon policy (ignore error if exists)
  const anonPolicy = `
    DO $$
    BEGIN
      CREATE POLICY "Allow public read access to tax rates"
        ON county_surtax_windows
        FOR SELECT
        TO anon
        USING (true);
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'Policy already exists, skipping';
    END $$;
  `;

  // Create authenticated policy (ignore error if exists)
  const authPolicy = `
    DO $$
    BEGIN
      CREATE POLICY "Allow authenticated read access to tax rates"
        ON county_surtax_windows
        FOR SELECT
        TO authenticated
        USING (true);
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'Policy already exists, skipping';
    END $$;
  `;

  try {
    // Execute SQL directly via RPC
    const { error: rlsError } = await supabase.rpc('exec_sql', {
      sql: enableRls
    }).single();

    if (rlsError && !rlsError.message.includes('already')) {
      console.log('[apply-rls] RLS enable result:', rlsError);
    }

    const { error: anonError } = await supabase.rpc('exec_sql', {
      sql: anonPolicy
    }).single();

    if (anonError && !anonError.message.includes('already')) {
      console.log('[apply-rls] Anon policy result:', anonError);
    }

    const { error: authError } = await supabase.rpc('exec_sql', {
      sql: authPolicy
    }).single();

    if (authError && !authError.message.includes('already')) {
      console.log('[apply-rls] Auth policy result:', authError);
    }

    console.log('[apply-rls] RLS policies applied successfully!');
  } catch (err) {
    console.error('[apply-rls] Error:', err);
    console.log('[apply-rls] Trying alternative method with raw SQL...');

    // Alternative: use postgres client
    const { createPool } = await import('@neondatabase/serverless');
    const connectionString = `${SUPABASE_URL.replace('https://', 'postgresql://postgres:')}@${SUPABASE_URL.split('//')[1]}/postgres`;

    console.log('[apply-rls] Note: exec_sql RPC function may not exist. You may need to run the SQL manually.');
    console.log('[apply-rls] Run these commands in the Supabase SQL Editor:');
    console.log('\n--- START SQL ---');
    console.log(enableRls);
    console.log(anonPolicy);
    console.log(authPolicy);
    console.log('--- END SQL ---\n');
  }
}

main();
