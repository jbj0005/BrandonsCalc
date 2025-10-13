#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const configPath = path.join(projectRoot, "config", "lenders.json");
const outputDir = path.join(projectRoot, "output");

let createClient = null;
async function loadSupabase() {
  if (createClient) return createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
    return createClient;
  } catch {
    console.warn("[warn] Supabase client not available; skipping live lookup");
    return null;
  }
}

async function loadEnv() {
  try {
    const envPath = path.join(projectRoot, ".env");
    const raw = await readFile(envPath, "utf8");
    for (const lineRaw of raw.split(/\r?\n/)) {
      const line = lineRaw.trim();
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
  } catch {
    // optional
  }
}

async function getLiveSupabaseSources() {
  const create = await loadSupabase();
  if (!create) return null;
  await loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[warn] Supabase credentials missing; skipping live lookup");
    return null;
  }
  try {
    const supabase = create(url, key);
    const { data, error } = await supabase
      .from("auto_rates")
      .select("source", { head: false, count: "exact" });
    if (error) throw error;
    const sources = new Set();
    for (const row of data || []) {
      if (row?.source) sources.add(String(row.source).trim().toUpperCase());
    }
    return sources;
  } catch (err) {
    console.warn(`[warn] Could not query Supabase: ${err.message ?? err}`);
    return null;
  }
}

async function loadLenders() {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("config/lenders.json must be an array");
  }
  return parsed;
}

const BASE_FIELDS = ["longName", "shortName"]; // always included

async function promptForFields(sample) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const available = Object.keys(sample).sort();
    const optional = available.filter((field) => !BASE_FIELDS.includes(field));
    console.log("\nBase columns: longName, shortName, live_in_supabase");
    console.log("Optional fields you can add:");
    console.log(optional.join(", ") || "(none)");
    console.log(
      "\nEnter additional fields as a comma-separated list (press Enter to skip):"
    );
    const answer = (await rl.question("> ")).trim();
    const picked = answer
      ? answer
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      : [];

    const invalid = picked.filter((field) => !available.includes(field));
    if (invalid.length) {
      throw new Error(
        `Unknown field(s): ${invalid.join(", ")}. Please choose from: ${optional.join(", ")}`
      );
    }
    return picked;
  } finally {
    rl.close();
  }
}

function buildReport(lenders, extraFields, liveSources) {
  const lines = [];
  const columns = [
    ...BASE_FIELDS,
    ...extraFields.filter((f, idx, arr) => !BASE_FIELDS.includes(f) && arr.indexOf(f) === idx),
  ];
  lines.push([...columns, "live_in_supabase"].join("\t"));

  for (const lender of lenders) {
    const row = columns.map((field) => {
      const value = lender?.[field];
      if (value == null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value).replace(/\s+/g, " ").trim();
    });
    const short = String(lender?.shortName || lender?.source || "")
      .toUpperCase()
      .trim();
    const live = liveSources
      ? liveSources.has(short)
        ? "yes"
        : "no"
      : "unknown";
    row.push(live);
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

async function main() {
  try {
    const lenders = await loadLenders();
    if (!lenders.length) {
      console.log("No lenders found in config/lenders.json");
      return;
    }

    const fields = await promptForFields(lenders[0]);
    const liveSources = await getLiveSupabaseSources();
    if (!liveSources) {
      console.log("[info] live Supabase lookup skipped; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable");
    }

    const report = buildReport(lenders, fields, liveSources);

    await mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `lenders-${timestamp}.txt`;
    const outPath = path.join(outputDir, filename);
    await writeFile(outPath, report, "utf8");

    console.log(`\n✅ Report written to ${outPath}`);
  } catch (err) {
    console.error("❌", err.message ?? err);
    process.exitCode = 1;
  }
}

main();
