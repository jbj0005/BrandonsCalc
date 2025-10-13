#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "output");

const BASE_COLUMNS = [
  "source",
  "loan_type",
  "vehicle_condition",
  "term_range_min",
  "term_range_max",
  "apr_percent",
  "effective_at",
];

const EXCLUDED_COLUMNS = new Set([
  "id",
  "uuid",
  "created_at",
  "updated_at",
]);

function loadEnv() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return;
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
  }
}

async function fetchRates(supabase) {
  const { data, error } = await supabase
    .from("auto_rates")
    .select("*")
    .order("source", { ascending: true })
    .order("loan_type", { ascending: true })
    .order("term_range_min", { ascending: true });
  if (error) throw error;
  return data || [];
}

function determineColumns(records) {
  const base = [...BASE_COLUMNS];
  const optional = new Set();
  for (const record of records) {
    Object.keys(record).forEach((key) => {
      if (BASE_COLUMNS.includes(key)) return;
      if (EXCLUDED_COLUMNS.has(key)) return;
      optional.add(key);
    });
  }
  return { base, optional: Array.from(optional).sort() };
}

async function promptForColumns(optional) {
  if (!optional.length) return [];
  console.log("Optional columns you can add:");
  console.log(optional.join(", "));
  console.log(
    "\nEnter additional columns as a comma-separated list (press Enter to skip):"
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("> ")).trim();
    if (!answer) return [];
    const requested = answer
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const invalid = requested.filter((column) => !optional.includes(column));
    if (invalid.length) {
      throw new Error(
        `Unknown column(s): ${invalid.join(", ")}. Allowed: ${optional.join(", ")}`
      );
    }
    return requested;
  } finally {
    rl.close();
  }
}

const PERCENT_COLUMNS = new Set([
  "apr_percent",
  "base_apr_percent",
  "apr_adjustment",
]);

function formatValue(column, value) {
  if (value == null) return "";
  if (PERCENT_COLUMNS.has(column) && typeof value === "number") {
    return value.toFixed(2);
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function buildReport(records, baseColumns, extraColumns) {
  const columns = [
    ...baseColumns,
    ...extraColumns.filter((col, idx, arr) => !baseColumns.includes(col) && arr.indexOf(col) === idx),
  ];

  const widths = new Map();
  const updateWidth = (column, value) => {
    const current = widths.get(column) ?? 0;
    widths.set(column, Math.max(current, value.length));
  };

  const formattedRecords = records.map((record) => {
    const row = {};
    for (const column of columns) {
      row[column] = formatValue(column, record?.[column]);
      updateWidth(column, row[column]);
    }
    return row;
  });

  columns.forEach((column) => updateWidth(column, column));

  const pad = (column, value) => {
    const width = (widths.get(column) ?? 0) + 2;
    return value.padEnd(width, " ");
  };

  const lines = [];
  lines.push(columns.map((column) => pad(column, column)).join(""));
  lines.push(
    columns
      .map((column) => "-".repeat((widths.get(column) ?? 0) + 2))
      .join("")
  );

  for (const record of formattedRecords) {
    const line = columns.map((column) => pad(column, record[column])).join("");
    lines.push(line);
  }

  return lines.join("\n");
}

async function main() {
  try {
    loadEnv();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env to use show:rates"
      );
    }

    const supabase = createClient(url, key);
    console.log("Fetching auto rate records...");
    const rates = await fetchRates(supabase);
    console.log(`  Retrieved ${rates.length} records`);
    if (!rates.length) {
      console.log("No rows found in auto_rates.");
      return;
    }

    const { base, optional } = determineColumns(rates);
    console.log("\nBase columns (always included):");
    console.log(base.join(", "));
    const extra = await promptForColumns(optional);

    const report = buildReport(rates, base, extra);
    await mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `rates-${timestamp}.txt`;
    const outPath = path.join(outputDir, filename);
    await writeFile(outPath, report, "utf8");
    console.log(`\n✅ Rate report written to ${outPath}`);
  } catch (error) {
    console.error("❌", error.message ?? error);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  }
}

main();
