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
  console.log('[verify] Checking county_surtax_windows table...');

  const { data, error } = await supabase
    .from('county_surtax_windows')
    .select('*')
    .eq('state_code', 'FL')
    .eq('county_name', 'Brevard')
    .limit(5);

  if (error) {
    console.error('[verify] Error:', error);
    return;
  }

  console.log('[verify] Found', data?.length || 0, 'Brevard entries');
  console.log('[verify] Data:', JSON.stringify(data, null, 2));

  // Check total count
  const { count, error: countError } = await supabase
    .from('county_surtax_windows')
    .select('*', { count: 'exact', head: true })
    .eq('state_code', 'FL');

  console.log('[verify] Total FL entries:', count);
}

main();
