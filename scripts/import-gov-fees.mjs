#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

import { hydrateEnv } from './utils/env.mjs';
import { ensureSupabaseCredentials, createSupabaseAdminClient } from './utils/supabase.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

await hydrateEnv({ rootDir: PROJECT_ROOT });

let supabaseAdmin = null;

async function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const credentials = await ensureSupabaseCredentials({ projectRoot: PROJECT_ROOT });
  supabaseAdmin = createSupabaseAdminClient(createClient, credentials);
  return supabaseAdmin;
}

function resolveUserPath(inputPath, fallback = null) {
  if (!inputPath) return fallback;
  const expanded = inputPath.startsWith('~')
    ? path.join(process.env.HOME ?? '', inputPath.slice(1))
    : inputPath;
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(process.cwd(), expanded);
}

async function askQuestion(rl, prompt, { defaultValue = '' } = {}) {
  const hint = defaultValue ? ` (${defaultValue})` : '';
  const response = (await rl.question(`${prompt}${hint}: `)).trim();
  return response || defaultValue;
}

async function askYesNo(rl, prompt, defaultValue = true) {
  const suffix = defaultValue ? 'Y/n' : 'y/N';
  while (true) {
    const answer = (await rl.question(`${prompt} (${suffix}): `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    console.warn('[gov-fees] Please respond with y or n.');
  }
}

async function promptForConfig() {
  if (process.argv.length > 2) {
    console.warn('[gov-fees] Command-line flags detected but are no longer required. Interactive prompts will be used.');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.info('[gov-fees] Ready to import government fee data.');
    const defaultFile = path.resolve(__dirname, '..', 'assets', 'florida_govt_vehicle_fees.json');
    const sourceFileInput = await askQuestion(rl, 'Source JSON file', { defaultValue: defaultFile });
    const filePath = resolveUserPath(sourceFileInput, defaultFile);
    const setId = await askQuestion(rl, 'Target gov_fee_sets ID (leave blank for active)');
    const backupWanted = await askYesNo(rl, 'Create a backup of current items before updating?', false);
    let backupPath = null;
    if (backupWanted) {
      const defaultBackup = path.resolve(process.cwd(), 'gov-fees-backup.json');
      const backupInput = await askQuestion(rl, 'Backup file destination', { defaultValue: defaultBackup });
      backupPath = resolveUserPath(backupInput, defaultBackup);
    }
    const dryRun = await askYesNo(rl, 'Run in dry-run mode (skip Supabase update)?', false);
    const applyUpdate = dryRun ? false : await askYesNo(rl, 'Apply mapped fees to Supabase?', true);

    return {
      filePath,
      setId: setId || null,
      backupPath,
      dryRun,
      applyUpdate,
    };
  } finally {
    rl.close();
  }
}

function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,\s]/g, '').replace(/\u2013|\u2014/g, '-');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function toSentence(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s+/g, ' ');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`Expected an array in ${filePath}`);
  }
  return data;
}

function mapFees(records) {
  return records.map((record, index) => {
    const name = toSentence(record?.Description ?? record?.name ?? '').replaceAll('\n', ' ').trim();
    if (!name) {
      throw new Error(`Missing Description for record at index ${index}`);
    }
    const categoryRaw = record?.['Fee Type'] ?? record?.category ?? "Gov't";
    const category = toSentence(categoryRaw) || "Gov't";
    const amountRaw = record?.Amount ?? null;
    const parsedAmount = parseAmount(amountRaw);
    const notes = toSentence(record?.Notes ?? record?.notes ?? '');
    const amountDisplay = typeof amountRaw === 'string' ? amountRaw.trim() : null;

    const item = {
      name,
      category,
      amount: parsedAmount ?? 0,
      sort: index + 1,
    };

    if (amountDisplay && amountDisplay !== String(parsedAmount ?? '')) {
      item.amount_display = amountDisplay;
    }
    if (notes) {
      item.notes = notes;
    }
    if (parsedAmount == null && typeof amountRaw === 'number') {
      item.amount = Math.round(amountRaw * 100) / 100;
    }
    if (parsedAmount == null) {
      item.is_variable = true;
    }
    return item;
  });
}

async function resolveTargetSet(supabase, explicitId) {
  if (explicitId) {
    const { data, error } = await supabase
      .from('gov_fee_sets')
      .select('id, label, items, updated_at')
      .eq('id', explicitId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(`No gov_fee_sets row found for id ${explicitId}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from('gov_fee_sets')
    .select('id, label, items, updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('No active gov_fee_sets row found.');
  }
  return data;
}

async function writeBackup(items, destination) {
  if (!destination) return null;
  const outputPath = resolveUserPath(destination, path.resolve(process.cwd(), 'gov-fees-backup.json'));
  await fs.writeFile(outputPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function main() {
  const config = await promptForConfig();

  console.info('[gov-fees] Starting import with configuration:', {
    file: config.filePath,
    setId: config.setId ?? 'active',
    backup: config.backupPath ?? false,
    dryRun: config.dryRun,
    applyUpdate: config.applyUpdate,
  });

  const filePath = config.filePath;
  if (!filePath) {
    throw new Error('A source file path is required.');
  }

  const supabase = await getSupabaseAdmin();
  const records = await readJson(filePath);

  const target = await resolveTargetSet(supabase, config.setId);
  const mapped = mapFees(records);

  console.log(`Loaded ${records.length} fee entries from ${path.relative(process.cwd(), filePath)}`);
  console.log(`Target set: ${target.label ?? target.id}`);
  console.log('Preview of first 3 rows:');
  console.table(mapped.slice(0, 3));

  if (config.dryRun || !config.applyUpdate) {
    console.log('No changes will be written to Supabase (dry run or update skipped).');
    return;
  }

  console.info(`[gov-fees] Replacing all existing items for set ${target.id}.`);

  if (target.items) {
    const backupPath = await writeBackup(target.items, config.backupPath);
    if (backupPath) {
      console.log(`Previous items saved to ${path.relative(process.cwd(), backupPath)}`);
    }
  }

  const { error } = await supabase
    .from('gov_fee_sets')
    .update({ items: mapped })
    .eq('id', target.id);
  if (error) throw error;

  console.log(`Updated gov_fee_sets ${target.id} with ${mapped.length} items.`);
}

main().catch((error) => {
  console.error('Failed to import gov fees:', error.message ?? error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
