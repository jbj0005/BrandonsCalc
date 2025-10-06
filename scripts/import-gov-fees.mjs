#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = { file: null, set: null, dryRun: false, backup: null };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--file' || current === '-f') {
      args.file = argv[i + 1];
      i += 1;
    } else if (current === '--set' || current === '-s') {
      args.set = argv[i + 1];
      i += 1;
    } else if (current === '--dry-run' || current === '--dryrun') {
      args.dryRun = true;
    } else if (current === '--backup') {
      args.backup = argv[i + 1] ?? '';
      i += 1;
    } else if (current === '--help' || current === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Update the active gov_fee_sets.items array from a JSON file.\n\n` +
    `Usage: node scripts/import-gov-fees.mjs [options]\n\n` +
    `Options:\n` +
    `  --file, -f   Path to the JSON file (default: assets/florida_govt_vehicle_fees.json)\n` +
    `  --set, -s    Explicit gov_fee_sets id to update (default: active set)\n` +
    `  --dry-run    Parse and preview without updating Supabase\n` +
    `  --backup     Write the currently stored items to the given file before updating\n` +
    `  --help       Show this message\n`);
}

function ensurePath(inputPath, fallback) {
  if (inputPath) {
    if (path.isAbsolute(inputPath)) return inputPath;
    return path.resolve(process.cwd(), inputPath);
  }
  return fallback;
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

async function ensureSupabaseClient() {
  const url = process.env.SUPABASE_URL ?? 'https://txndueuqljeujlccngbj.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_KEY ??
    'sb_publishable_iq_fkrkjHODeoaBOa3vvEA_p9Y3Yz8X';
  if (!key) {
    throw new Error('Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
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
  const outputPath = ensurePath(destination, path.resolve(process.cwd(), 'gov-fees-backup.json'));
  await fs.writeFile(outputPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const defaultFile = path.resolve(__dirname, '..', 'assets', 'florida_govt_vehicle_fees.json');
  const filePath = ensurePath(args.file, defaultFile);

  const [supabase, records] = await Promise.all([
    ensureSupabaseClient(),
    readJson(filePath),
  ]);

  const target = await resolveTargetSet(supabase, args.set);
  const mapped = mapFees(records);

  console.log(`Loaded ${records.length} fee entries from ${path.relative(process.cwd(), filePath)}`);
  console.log(`Target set: ${target.label ?? target.id}`);
  console.log('Preview of first 3 rows:');
  console.table(mapped.slice(0, 3));

  if (args.dryRun) {
    console.log('Dry run enabled — no changes written to Supabase.');
    return;
  }

  if (target.items) {
    const backupPath = await writeBackup(target.items, args.backup);
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
