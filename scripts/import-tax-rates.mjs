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
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { hydrateEnv } from "./utils/env.mjs";
import {
  ensureSupabaseCredentials,
  confirmSupabasePush,
  createSupabaseAdminClient,
} from "./utils/supabase.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

await hydrateEnv({ rootDir: PROJECT_ROOT });

let supabaseAdmin = null;

async function getSupabaseAdminClient() {
  if (supabaseAdmin) return supabaseAdmin;
  const credentials = await ensureSupabaseCredentials({
    projectRoot: PROJECT_ROOT,
  });
  supabaseAdmin = createSupabaseAdminClient(createClient, credentials);
  return supabaseAdmin;
}

function resolveUserPath(inputPath) {
  if (!inputPath) return null;
  const expanded = inputPath.startsWith("~")
    ? path.join(process.env.HOME ?? "", inputPath.slice(1))
    : inputPath;
  return path.isAbsolute(expanded)
    ? expanded
    : path.resolve(process.cwd(), expanded);
}

async function askQuestion(rl, prompt, { defaultValue = "" } = {}) {
  const hint = defaultValue ? ` (${defaultValue})` : "";
  const answer = (
    await rl.question(`${prompt}${hint ? `${hint}` : ""}: `)
  ).trim();
  return answer || defaultValue;
}

async function askRequired(rl, prompt, { defaultValue = "" } = {}) {
  let value = "";
  do {
    value = await askQuestion(rl, prompt, { defaultValue });
    if (!value) {
      console.warn("[tax-import] A value is required. Please try again.");
    }
  } while (!value);
  return value;
}

async function askYesNo(rl, prompt, defaultValue = false) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = (await rl.question(`${prompt} (${suffix}): `))
      .trim()
      .toLowerCase();
    if (!answer) return defaultValue;
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;
    console.warn("[tax-import] Please answer with 'y' or 'n'.");
  }
}

async function promptForConfig() {
  if (process.argv.length > 2) {
    console.warn(
      "[tax-import] Command-line options detected but will be ignored. Interactive prompts are in use."
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.info("[tax-import] Let's gather the details for this import run.");
    const file = await askRequired(rl, "Source file path");
    const state = await askRequired(rl, "State code (e.g. FL)", {
      defaultValue: "FL",
    });
    const effective = await askRequired(rl, "Effective date (YYYY-MM-DD)");
    const expiration = await askQuestion(
      rl,
      "Expiration date (optional, YYYY-MM-DD)"
    );
    const componentInput = await askQuestion(
      rl,
      "Component label (total | component)",
      {
        defaultValue: "total",
      }
    );
    const format = await askQuestion(
      rl,
      "Force parser format (csv, xls, xlsx, pdf, docx) or leave blank for auto"
    );
    const sourceVersion = await askQuestion(
      rl,
      "Source version metadata (optional)"
    );
    const outputOverride = await askQuestion(
      rl,
      "Custom JSON output path (leave blank for default)"
    );
    const dryRun = await askYesNo(
      rl,
      "Dry run only (skip writing and push)?",
      false
    );
    const push = dryRun
      ? false
      : await askYesNo(
          rl,
          "Push entries to Supabase after writing JSON?",
          false
        );

    return {
      file,
      state,
      effective,
      expiration: expiration || null,
      component:
        componentInput?.toLowerCase() === "component" ? "component" : "total",
      format: format ? format.toLowerCase() : null,
      sourceVersion: sourceVersion || null,
      output: outputOverride ? resolveUserPath(outputOverride) : null,
      dryRun,
      push,
    };
  } finally {
    rl.close();
  }
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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
  const { pdf } = await import("pdf-parse");
  const dataBuffer = await fs.readFile(filePath);
  const { text } = await pdf(dataBuffer);
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
  const rateRaw = getField(
    "rate",
    "surtax",
    "tax",
    "rate_percent",
    "rate_decimal"
  );
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
    component_label: componentRaw
      ? String(componentRaw).trim().toLowerCase()
      : null,
    effective_date: effectiveRaw ? String(effectiveRaw).trim() : null,
    expiration_date: expirationRaw ? String(expirationRaw).trim() : null,
  };
}

async function parseFile(filePath, format, stateCode) {
  const ext = format ?? path.extname(filePath).toLowerCase();
  if (!ext) {
    throw new Error("Unable to determine file type; use --format to specify");
  }

  const cleanExt = ext.replace(/^[.]/, "").toLowerCase();
  console.info(`[tax-import] Using parser for .${cleanExt} source`);

  switch (cleanExt) {
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

function normalizeEntries(
  entries,
  { component, effective, expiration, file, sourceVersion }
) {
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
  const resolved =
    outputPath ??
    path.resolve(__dirname, "../output", `tax-${Date.now()}.json`);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  console.info(`[tax-import] Writing ${entries.length} entries to ${resolved}`);
  await fs.writeFile(resolved, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return resolved;
}

async function pushToSupabase(entries) {
  if (!entries.length) {
    console.warn("[tax-import] No entries to push");
    return;
  }
  try {
    await confirmSupabasePush(entries);
  } catch (error) {
    if (error?.message === "Supabase push cancelled by user") {
      console.warn(
        "[tax-import] Supabase push cancelled by user. Skipping upload."
      );
      return;
    }
    throw error;
  }
  console.info(`[tax-import] Pushing ${entries.length} entries to Supabase`);
  const supabase = await getSupabaseAdminClient();
  const stateCodes = Array.from(
    new Set(
      entries
        .map((entry) => entry.state_code)
        .filter((code) => typeof code === "string" && code.trim() !== "")
    )
  );
  if (stateCodes.length > 0) {
    console.info(
      `[tax-import] Removing existing rows for state_code IN (${stateCodes.join(
        ", "
      )})`
    );
    const { error: deleteError } = await supabase
      .from("county_surtax_windows")
      .delete()
      .in("state_code", stateCodes);
    if (deleteError) {
      throw deleteError;
    }
  }
  const { error } = await supabase
    .from("county_surtax_windows")
    .insert(entries);
  if (error) {
    throw error;
  }
  console.info(
    `[tax-import] Inserted ${entries.length} rows into county_surtax_windows`
  );
}

async function main() {
  const config = await promptForConfig();
  const filePath = resolveUserPath(config.file);
  if (!filePath) {
    throw new Error("Invalid file path provided");
  }
  const format = config.format;
  const stateCode = config.state.toUpperCase();

  console.info("[tax-import] Starting import", {
    file: filePath,
    state: stateCode,
    effective: config.effective,
    expiration: config.expiration ?? null,
    component: config.component,
    push: Boolean(config.push),
    dryRun: Boolean(config.dryRun),
    format: format ?? "auto",
  });

  const entriesRaw = await parseFile(filePath, format, stateCode);
  if (!entriesRaw.length) {
    console.warn("[tax-import] No entries extracted. Check source formatting.");
  }

  const normalizedEntries = normalizeEntries(entriesRaw, {
    component: config.component,
    effective: config.effective,
    expiration: config.expiration,
    file: filePath,
    sourceVersion: config.sourceVersion,
  }).filter((entry) => entry.rate_decimal != null);

  console.info(`[tax-import] Normalized ${normalizedEntries.length} entries`);
  if (!config.dryRun) {
    const jsonPath = await writeJsonFile(
      normalizedEntries,
      config.output
        ? config.output
        : path.resolve(
            __dirname,
            "../output",
            `tax-${stateCode.toLowerCase()}.json`
          )
    );
    console.info(`[tax-import] JSON saved to ${jsonPath}`);

    if (config.push) {
      await pushToSupabase(normalizedEntries);
    }
    console.info("[tax-import] Import complete");
  } else {
    console.info("[tax-import] Dry run complete. No files written.");
  }
}

main().catch((error) => {
  console.error("[tax-import] Failed", error);
  process.exitCode = 1;
});
