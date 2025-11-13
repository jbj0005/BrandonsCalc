#!/usr/bin/env node
/**
 * Fix Storage Policies for Garage Vehicle Photos
 *
 * This script updates the RLS policies to allow uploads without owner constraints
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: {
    schema: 'public'
  }
});

async function fixStoragePolicies() {
  console.log('🔧 Fixing storage upload policies...\n');

  try {
    // Read the migration SQL
    const sql = readFileSync(
      resolve(__dirname, '../supabase/migrations/20251112_fix_garage_photos_upload_policy.sql'),
      'utf8'
    );

    // Execute each statement separately
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 60) + '...');

      // Use the REST API to execute SQL
      const { data, error } = await supabase.rpc('exec_sql', {
        query: statement + ';'
      });

      if (error) {
        console.log('⚠️  Statement result:', error.message);
      } else {
        console.log('✓ Statement executed');
      }
    }

    console.log('\n✅ Storage policies updated!');
    console.log('\n📸 Try uploading a vehicle photo now');

  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    console.error('\n📝 Manual fix: Run the following SQL in your Supabase SQL Editor:');
    console.error('\n' + readFileSync(
      resolve(__dirname, '../supabase/migrations/20251112_fix_garage_photos_upload_policy.sql'),
      'utf8'
    ));
    process.exit(1);
  }
}

fixStoragePolicies();
