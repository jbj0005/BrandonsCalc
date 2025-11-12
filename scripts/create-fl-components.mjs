#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FL_STATE_TAX = 0.06; // 6%

async function main() {
  // Read the original fixed file (county surtax only)
  const inputPath = path.resolve(__dirname, '../output/tax-fl-fixed.json');
  const outputPath = path.resolve(__dirname, '../output/tax-fl-components.json');

  const content = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(content);

  console.log(`[create-components] Processing ${data.length} counties...`);

  const componentEntries = [];

  for (const entry of data) {
    const countySurtax = entry.rate_decimal;

    // State component entry
    componentEntries.push({
      state_code: 'FL',
      county_name: entry.county_name,
      county_fips: entry.county_fips,
      component_label: 'component',
      rate_decimal: FL_STATE_TAX,
      effective_date: entry.effective_date,
      expiration_date: entry.expiration_date,
      source_file: entry.source_file,
      source_version: 'state'
    });

    // County component entry
    componentEntries.push({
      state_code: 'FL',
      county_name: entry.county_name,
      county_fips: entry.county_fips,
      component_label: 'component',
      rate_decimal: countySurtax,
      effective_date: entry.effective_date,
      expiration_date: entry.expiration_date,
      source_file: entry.source_file,
      source_version: 'county'
    });

    if (entry.county_name === 'Brevard') {
      console.log(`[create-components] Brevard:`);
      console.log(`  State: ${FL_STATE_TAX} (6%)`);
      console.log(`  County: ${countySurtax} (${countySurtax * 100}%)`);
      console.log(`  Total: ${FL_STATE_TAX + countySurtax} (${(FL_STATE_TAX + countySurtax) * 100}%)`);
    }
  }

  await fs.writeFile(outputPath, JSON.stringify(componentEntries, null, 2) + '\n', 'utf8');

  console.log(`[create-components] Created ${componentEntries.length} component entries`);
  console.log(`[create-components] Written to ${outputPath}`);
}

main();
