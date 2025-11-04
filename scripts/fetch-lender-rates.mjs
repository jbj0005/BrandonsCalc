#!/usr/bin/env node

/**
 * Helper script to fetch rates for a specific lender using the lender-urls.json config
 * Usage: node scripts/fetch-lender-rates.mjs <lender_id>
 * Example: node scripts/fetch-lender-rates.mjs nfcu
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const lenderId = process.argv[2];

  if (!lenderId) {
    console.error('❌ Error: Lender ID required');
    console.log('\nUsage: node scripts/fetch-lender-rates.mjs <lender_id>');
    console.log('\nAvailable lenders:');

    // Load config to show available lenders
    try {
      const configPath = resolve(__dirname, '../config/lender-urls.json');
      const configData = await readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);

      console.log('\nPriority order:');
      for (const id of config.priority) {
        const lender = config.lenders[id];
        const status = lender.enabled ? '✓' : '✗';
        const hasUrl = lender.rateUrl ? '🔗' : '⚠️ ';
        console.log(`  ${status} ${hasUrl} ${id.padEnd(15)} - ${lender.name}`);
      }
    } catch (err) {
      console.error('Failed to load lender config:', err.message);
    }

    process.exit(1);
  }

  try {
    // Load lender URLs config
    const configPath = resolve(__dirname, '../config/lender-urls.json');
    const configData = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    const lender = config.lenders[lenderId];

    if (!lender) {
      console.error(`❌ Lender '${lenderId}' not found in config`);
      console.log('\nAvailable lenders:', Object.keys(config.lenders).join(', '));
      process.exit(1);
    }

    if (!lender.enabled) {
      console.warn(`⚠️  Warning: Lender '${lenderId}' is disabled in config`);
    }

    if (!lender.rateUrl) {
      console.error(`❌ No rate URL configured for ${lender.name}`);
      console.log(`\n📝 Please add a URL to config/lender-urls.json for lender '${lenderId}'`);
      process.exit(1);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Fetching rates for: ${lender.name}`);
    console.log(`URL: ${lender.rateUrl}`);
    console.log(`${'='.repeat(80)}\n`);

    if (lender.notes) {
      console.log(`📝 Notes: ${lender.notes}\n`);
    }

    // Build fetch-rates command
    const cmd = `npm run fetch:rates -- --lender ${lenderId} --url "${lender.rateUrl}"`;

    console.log(`Running: ${cmd}\n`);

    // Execute the fetch-rates script
    execSync(cmd, { stdio: 'inherit', cwd: resolve(__dirname, '..') });

    console.log(`\n✅ Rate fetch completed for ${lender.name}`);

  } catch (err) {
    console.error(`\n❌ Error fetching rates:`, err.message);
    process.exit(1);
  }
}

main();
