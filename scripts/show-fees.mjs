#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "output");

const EXCLUDED_FIELDS = new Set([
  "set_id",
  "set_label",
  "applies_county_fips",
  "sort_order",
  "uuid",
  "id",
]);

function loadEnv() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return {};
  const pairs = {};
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let [, key, value] = match;
    value = value.trim().replace(/\s+#.*$/, "");
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
    pairs[key] = value;
  }
  return pairs;
}

async function fetchFees(table, feeType, supabase) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, fee_type: feeType }));
}

function determineColumns(records) {
  const columns = new Set();
  for (const record of records) {
    Object.keys(record).forEach((key) => columns.add(key));
  }
  const base = [];
  const optional = [];
  for (const key of Array.from(columns).sort()) {
    const lower = key.toLowerCase();
    if (key === "fee_type") {
      base.unshift(key); // ensure fee_type is first
      continue;
    }
    if (EXCLUDED_FIELDS.has(lower)) {
      optional.push(key);
      continue;
    }
    base.push(key);
  }
  return { base, optional };
}

async function promptForFields(base, optional) {
  console.log("\nBase columns (always included):");
  console.log(base.join(", "));
  const filteredOptional = optional.filter(
    (field) => !base.includes(field)
  );
  if (!filteredOptional.length) return [];

  console.log("\nOptional columns you can add:");
  console.log(filteredOptional.join(", "));
  console.log(
    "\nEnter additional columns as a comma-separated list (press Enter to skip):"
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("> ")).trim();
    if (!answer) return [];
    const requested = answer
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    const invalid = requested.filter((field) => !filteredOptional.includes(field));
    if (invalid.length) {
      throw new Error(
        `Unknown column(s): ${invalid.join(", ")}. Allowed: ${filteredOptional.join(", ")}`
      );
    }
    return requested;
  } finally {
    rl.close();
  }
}

function buildReport(records, baseColumns, extraColumns) {
  const columns = [
    ...baseColumns,
    ...extraColumns.filter((col, idx, arr) => !baseColumns.includes(col) && arr.indexOf(col) === idx),
  ];

  const widths = new Map();
  const liveColumn = "live_in_supabase";

  const updateWidth = (column, value) => {
    const string = value == null ? "" : String(value);
    const current = widths.get(column) ?? 0;
    widths.set(column, Math.max(current, string.length));
  };

  for (const column of columns) updateWidth(column, column);
  updateWidth(liveColumn, liveColumn);

  for (const record of records) {
    for (const column of columns) {
      const value = record?.[column];
      const printable =
        value == null
          ? ""
          : typeof value === "object"
          ? JSON.stringify(value)
          : String(value).replace(/\s+/g, " ");
      updateWidth(column, printable);
    }
    updateWidth(liveColumn, record.fee_type ? "yes" : "no");
  }

  const pad = (value, column) => {
    const width = (widths.get(column) ?? 0) + 2;
    const string = value == null ? "" : String(value);
    return string.padEnd(width, " ");
  };

  const lines = [];
  lines.push(
    columns.map((column) => pad(column, column)).join("") + pad(liveColumn, liveColumn)
  );
  lines.push(
    columns
      .map((column) => "-".repeat((widths.get(column) ?? 0) + 2))
      .join("") +
      "-".repeat((widths.get(liveColumn) ?? 0) + 2)
  );

  for (const record of records) {
    const row = columns
      .map((column) => {
        const value = record?.[column];
        const printable =
          value == null
            ? ""
            : typeof value === "object"
            ? JSON.stringify(value)
            : String(value).replace(/\s+/g, " ");
        return pad(printable, column);
      })
      .join("");
    const live = record.fee_type ? "yes" : "no";
    lines.push(row + pad(live, liveColumn));
  }

  return lines.join("\n");
}

async function main() {
  try {
    const env = loadEnv();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env to use show:fees"
      );
    }

    const supabase = createClient(url, key);
    console.log("Fetching government fee items...");
    const govFees = await fetchFees("gov_fee_items_v", "gov", supabase);
    console.log(`  Found ${govFees.length} government fees`);

    console.log("Fetching dealer fee items...");
    const dealerFees = await fetchFees("dealer_fee_items_v", "dealer", supabase);
    console.log(`  Found ${dealerFees.length} dealer fees`);

    const combined = [...govFees, ...dealerFees];
    if (!combined.length) {
      console.log("No fees returned from Supabase.");
      return;
    }

    const { base, optional } = determineColumns(combined);
    const extra = await promptForFields(base, optional);
    const report = buildReport(combined, base, extra);

    await mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `fees-${timestamp}.txt`;
    const outPath = path.join(outputDir, filename);
    await writeFile(outPath, report, "utf8");
    console.log(`\n✅ Fee report written to ${outPath}`);
  } catch (error) {
    console.error("❌", error.message ?? error);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  }
}

main();
