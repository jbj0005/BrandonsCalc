#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('[fix-rls] Applying RLS policies...');

  // Use Supabase REST API to execute SQL
  const sql = `
-- Enable RLS
ALTER TABLE county_surtax_windows ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow public read access to tax rates" ON county_surtax_windows;
DROP POLICY IF EXISTS "Allow authenticated read access to tax rates" ON county_surtax_windows;

-- Create new policies
CREATE POLICY "Allow public read access to tax rates"
  ON county_surtax_windows
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to tax rates"
  ON county_surtax_windows
  FOR SELECT
  TO authenticated
  USING (true);
  `;

  console.log('[fix-rls] SQL to execute:');
  console.log(sql);
  console.log('\n[fix-rls] Please run this SQL in your Supabase SQL Editor:');
  console.log(`https://${SUPABASE_URL.split('//')[1].split('.')[0]}.supabase.co/project/_/sql/new`);
}

main();
