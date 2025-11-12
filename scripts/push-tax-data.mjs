#!/usr/bin/env node

/**
 * Push tax-fl-fixed.json to Supabase
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[push-tax-data] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('[push-tax-data] Please set these environment variables in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const jsonPath = path.resolve(__dirname, '../output/tax-fl-components.json');
  console.log('[push-tax-data] Reading', jsonPath);

  const content = await fs.readFile(jsonPath, 'utf8');
  const entries = JSON.parse(content);

  console.log(`[push-tax-data] Found ${entries.length} tax entries`);

  // Delete existing FL data
  console.log('[push-tax-data] Deleting existing FL tax data...');
  const { error: deleteError } = await supabase
    .from('county_surtax_windows')
    .delete()
    .eq('state_code', 'FL');

  if (deleteError) {
    console.error('[push-tax-data] Delete error:', deleteError);
    process.exit(1);
  }

  console.log('[push-tax-data] Inserting new data...');
  const { error: insertError } = await supabase
    .from('county_surtax_windows')
    .insert(entries);

  if (insertError) {
    console.error('[push-tax-data] Insert error:', insertError);
    process.exit(1);
  }

  console.log(`[push-tax-data] Successfully imported ${entries.length} tax entries!`);
}

main().catch((err) => {
  console.error('[push-tax-data] Fatal error:', err);
  process.exit(1);
});
