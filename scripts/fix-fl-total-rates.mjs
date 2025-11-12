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

const FL_STATE_TAX = 0.06; // 6% state sales tax

async function main() {
  console.log('[fix-fl-total] Reading FL tax data...');

  const { data: counties, error } = await supabase
    .from('county_surtax_windows')
    .select('*')
    .eq('state_code', 'FL')
    .eq('component_label', 'total');

  if (error) {
    console.error('[fix-fl-total] Error:', error);
    return;
  }

  console.log(`[fix-fl-total] Found ${counties.length} FL counties with "total" rates`);
  console.log('[fix-fl-total] Current rates are county surtax only. Adding 6% state tax...');

  const updates = [];

  for (const county of counties) {
    const countySurtax = county.rate_decimal;
    const actualTotal = FL_STATE_TAX + countySurtax;

    updates.push({
      id: county.id,
      rate_decimal: actualTotal
    });

    console.log(`[fix-fl-total] ${county.county_name}: ${countySurtax} -> ${actualTotal} (${actualTotal * 100}%)`);
  }

  // Update each record
  console.log(`[fix-fl-total] Updating ${updates.length} records...`);

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('county_surtax_windows')
      .update({ rate_decimal: update.rate_decimal })
      .eq('id', update.id);

    if (updateError) {
      console.error(`[fix-fl-total] Error updating ${update.id}:`, updateError);
    }
  }

  console.log('[fix-fl-total] Done! Verifying Brevard...');

  const { data: brevard } = await supabase
    .from('county_surtax_windows')
    .select('*')
    .eq('state_code', 'FL')
    .eq('county_name', 'Brevard')
    .single();

  console.log('[fix-fl-total] Brevard:', {
    rate_decimal: brevard.rate_decimal,
    percentage: `${brevard.rate_decimal * 100}%`
  });
}

main();
