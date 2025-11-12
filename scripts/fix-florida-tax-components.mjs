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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('[fix-fl-tax] Reading current FL tax data...');

  // Get all FL counties
  const { data: counties, error } = await supabase
    .from('county_surtax_windows')
    .select('*')
    .eq('state_code', 'FL')
    .eq('component_label', 'total');

  if (error) {
    console.error('[fix-fl-tax] Error:', error);
    return;
  }

  console.log(`[fix-fl-tax] Found ${counties.length} FL counties`);

  // Create new entries with proper components
  const newEntries = [];

  for (const county of counties) {
    // State component (6% for all FL counties)
    newEntries.push({
      state_code: 'FL',
      county_name: county.county_name,
      county_fips: county.county_fips,
      component_label: 'state',
      rate_decimal: 0.06, // 6% state sales tax
      effective_date: county.effective_date,
      expiration_date: county.expiration_date,
      source_file: county.source_file,
      source_version: 'corrected_components'
    });

    // County component (the existing rate_decimal is the county surtax)
    newEntries.push({
      state_code: 'FL',
      county_name: county.county_name,
      county_fips: county.county_fips,
      component_label: 'county',
      rate_decimal: county.rate_decimal, // County surtax (0.01 for Brevard, etc.)
      effective_date: county.effective_date,
      expiration_date: county.expiration_date,
      source_file: county.source_file,
      source_version: 'corrected_components'
    });
  }

  console.log(`[fix-fl-tax] Created ${newEntries.length} component entries`);

  // Delete old "total" entries
  console.log('[fix-fl-tax] Deleting old total entries...');
  const { error: deleteError } = await supabase
    .from('county_surtax_windows')
    .delete()
    .eq('state_code', 'FL')
    .eq('component_label', 'total');

  if (deleteError) {
    console.error('[fix-fl-tax] Delete error:', deleteError);
    return;
  }

  // Insert new component entries
  console.log('[fix-fl-tax] Inserting new component entries...');
  const { error: insertError } = await supabase
    .from('county_surtax_windows')
    .insert(newEntries);

  if (insertError) {
    console.error('[fix-fl-tax] Insert error:', insertError);
    return;
  }

  console.log('[fix-fl-tax] Success! Tax components fixed.');
  console.log('[fix-fl-tax] Example for Brevard:');

  const { data: brevard } = await supabase
    .from('county_surtax_windows')
    .select('*')
    .eq('state_code', 'FL')
    .eq('county_name', 'Brevard');

  console.log(JSON.stringify(brevard, null, 2));
}

main();
