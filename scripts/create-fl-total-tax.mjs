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
  const outputPath = path.resolve(__dirname, '../output/tax-fl-total.json');

  const content = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(content);

  console.log(`[create-total] Processing ${data.length} counties...`);

  // Add state tax to each county surtax to get total
  for (const entry of data) {
    const countySurtax = entry.rate_decimal;
    const total = FL_STATE_TAX + countySurtax;
    entry.rate_decimal = total;

    if (entry.county_name === 'Brevard') {
      console.log(`[create-total] Brevard: ${countySurtax} (county) + ${FL_STATE_TAX} (state) = ${total} (${total * 100}%)`);
    }
  }

  // Write the updated data
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

  console.log(`[create-total] Written to ${outputPath}`);
}

main();
