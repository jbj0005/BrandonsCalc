#!/usr/bin/env node

/**
 * Parse tax tables from supported file formats (CSV, Excel, PDF, DOCX)
 * and optionally push the results into the Supabase county_surtax_windows table.
 *
 * Usage:
 *   node scripts/import-tax-rates.mjs --file ref_files/florida.pdf --state FL --effective 2024-01-01 --component total --output output/florida.json
 *   node scripts/import-tax-rates.mjs --file rates.xlsx --state FL --effective 2024-01-01 --push
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage(message) {
  console.error(`\n${message ?? ""}`);
  console.error(`
Usage: node scripts/import-tax-rates.mjs --file <path> --state <STATE> --effective <YYYY-MM-DD> [options]

Options:
  --file <path>           Required. Source file (CSV, XLSX/XLS, PDF, DOCX)
  --state <code>          Required. Two-letter state code (e.g. FL)
  --effective <date>      Required. Effective date for inserted rows (YYYY-MM-DD)
  --expiration <date>     Optional. Expiration date
  --component <label>     "total" (default) or "component"
  --output <path>         Where to write JSON (default ./output/tax-<STATE>.json)
  --push                  Push results to Supabase (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
  --source-version <str>  Optional metadata string stored in source_version column
  --format <type>         Force parser (csv,xlsx,pdf,docx)
  --dry-run               Print summary without writing JSON or pushing to Supabase
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    component: "total",
    push: false,
    dryRun: false,
    format: null,
    output: null,
    sourceVersion: null,
    expiration: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--file":
        args.file = argv[++i];
        break;
      case "--state":
        args.state = argv[++i];
        break;
      case "--effective":
        args.effective = argv[++i];
        break;
      case "--expiration":
        args.expiration = argv[++i];
        break;
      case "--component":
        args.component = argv[++i] ?? "total";
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--push":
        args.push = true;
        break;
      case "--source-version":
        args.sourceVersion = argv[++i];
        break;
      case "--format":
        args.format = (argv[++i] ?? "").toLowerCase();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        usage(`Unknown option: ${token}`);
    }
  }
  if (!args.file) usage("Missing --file");
  if (!args.state) usage("Missing --state");
  if (!args.effective) usage("Missing --effective");
  if (!/^[A-Z]{2}$/i.test(args.state)) usage("State must be 2-letter code");
  return args;
}

function normalizeRate(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1 ? value / 100 : value;
  }
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  const cleaned = stringValue.replace(/[^0-9.,-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeCounty(value) {
  if (!value) return "";
  return String(value)
    .replace(/County$/i, "")
    .replace(/Parish$/i, "")
    .trim();
}

function extractEntriesFromText(text, stateCode) {
  const entries = [];
  if (!text) return entries;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const regex = /^([A-Za-z'\-().\s]+?)\s+(\d+(?:\.\d+)?)\s*%/;
  lines.forEach((line) => {
    const match = line.match(regex);
    if (!match) return;
    const county = normalizeCounty(match[1]);
    const rateDecimal = normalizeRate(match[2]);
    if (!county || rateDecimal == null) return;
    entries.push({
      state_code: stateCode,
      county_name: county,
      rate_decimal: rateDecimal,
    });
  });
  return entries;
}

async function parsePdf(filePath, stateCode) {
  const { default: pdfParse } = await import("pdf-parse");
  const dataBuffer = await fs.readFile(filePath);
  const { text } = await pdfParse(dataBuffer);
  return extractEntriesFromText(text, stateCode);
}

async function parseDocx(filePath, stateCode) {
  const { extractRawText } = await import("mammoth");
  const { value } = await extractRawText({ path: filePath });
  return extractEntriesFromText(value, stateCode);
}

async function parseCsv(filePath, stateCode) {
  const { parse } = await import("csv-parse/sync");
  const content = await fs.readFile(filePath, "utf8");
  const records = parse(content, { columns: true, skip_empty_lines: true });
  return records
    .map((row) => normalizeStructuredRow(row, stateCode))
    .filter(Boolean);
}

async function parseExcel(filePath, stateCode) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => normalizeStructuredRow(row, stateCode))
    .filter(Boolean);
}

function normalizeStructuredRow(row, stateCode) {
  if (!row) return null;
  const headerMap = {};
  Object.keys(row).forEach((key) => {
    headerMap[key.toLowerCase().trim()] = key;
  });
  function getField(...names) {
    for (const name of names) {
      const key = headerMap[name.toLowerCase()];
      if (key != null) return row[key];
    }
    return undefined;
  }

  const countyRaw = getField("county", "county_name", "county/parish");
  const rateRaw = getField("rate", "surtax", "tax", "rate_percent", "rate_decimal");
  const effectiveRaw = getField("effective", "effective_date", "eff_date");
  const expirationRaw = getField("expiration", "expiration_date", "exp_date");
  const componentRaw = getField("component_label", "component");
  const fipsRaw = getField("fips", "county_fips");

  const county = normalizeCounty(countyRaw);
  const rateDecimal = normalizeRate(rateRaw);
  if (!county || rateDecimal == null) return null;

  return {
    state_code: stateCode,
    county_name: county,
    rate_decimal: rateDecimal,
    county_fips: fipsRaw ? String(fipsRaw).trim() : null,
    component_label: componentRaw ? String(componentRaw).trim().toLowerCase() : null,
    effective_date: effectiveRaw ? String(effectiveRaw).trim() : null,
    expiration_date: expirationRaw ? String(expirationRaw).trim() : null,
  };
}

async function parseFile(filePath, format, stateCode) {
  const ext = format ?? path.extname(filePath).toLowerCase();
  if (!ext) {
    throw new Error("Unable to determine file type; use --format to specify");
  }

  switch (ext.replace(/^[.]/, "")) {
    case "csv":
      return parseCsv(filePath, stateCode);
    case "xls":
    case "xlsx":
      return parseExcel(filePath, stateCode);
    case "pdf":
      return parsePdf(filePath, stateCode);
    case "doc":
    case "docx":
      return parseDocx(filePath, stateCode);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

function normalizeEntries(entries, { component, effective, expiration, file, sourceVersion }) {
  const componentLabel = component === "component" ? "component" : "total";
  const effectiveDate = effective;
  const expirationDate = expiration ?? null;
  const sourceFile = path.basename(file);

  return entries.map((entry) => ({
    state_code: String(entry.state_code ?? "").toUpperCase(),
    county_name: entry.county_name,
    county_fips: entry.county_fips ?? null,
    component_label: entry.component_label
      ? entry.component_label === "component"
        ? "component"
        : "total"
      : componentLabel,
    rate_decimal: Number(entry.rate_decimal ?? 0),
    effective_date: entry.effective_date ?? effectiveDate,
    expiration_date: entry.expiration_date ?? expirationDate,
    source_file: sourceFile,
    source_version: sourceVersion ?? null,
  }));
}

async function writeJsonFile(entries, outputPath) {
  const resolved = outputPath ?? path.resolve(__dirname, "../output", `tax-${Date.now()}.json`);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return resolved;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to push data");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function pushToSupabase(entries) {
  if (!entries.length) {
    console.warn("[tax-import] No entries to push");
    return;
  }
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("county_surtax_windows").insert(entries);
  if (error) {
    throw error;
  }
  console.log(`[tax-import] Inserted ${entries.length} rows into county_surtax_windows`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), args.file);
  const format = args.format;
  const stateCode = args.state.toUpperCase();

  const entriesRaw = await parseFile(filePath, format, stateCode);
  if (!entriesRaw.length) {
    console.warn("[tax-import] No entries extracted. Check source formatting.");
  }

  const normalizedEntries = normalizeEntries(entriesRaw, {
    component: args.component,
    effective: args.effective,
    expiration: args.expiration,
    file: filePath,
    sourceVersion: args.sourceVersion,
  }).filter((entry) => entry.rate_decimal != null);

  console.log(`[tax-import] Parsed ${normalizedEntries.length} entries.`);

  if (!args.dryRun) {
    const jsonPath = await writeJsonFile(
      normalizedEntries,
      args.output
        ? path.resolve(process.cwd(), args.output)
        : path.resolve(__dirname, "../output", `tax-${stateCode.toLowerCase()}.json`)
    );
    console.log(`[tax-import] JSON saved to ${jsonPath}`);

    if (args.push) {
      await pushToSupabase(normalizedEntries);
    }
  } else {
    console.log("[tax-import] Dry run complete. No files written.");
  }
}

main().catch((error) => {
  console.error("[tax-import] Failed", error);
  process.exitCode = 1;
});
