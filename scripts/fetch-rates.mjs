#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseHTML } from "linkedom";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import { createInterface } from "node:readline/promises";
import { execSync } from "node:child_process";
import os from "node:os";

// ---------- http defaults ----------
const DEFAULT_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------- load .env ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
try {
  const envContent = await fs.readFile(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let [, key, value] = match;
    value = value.trim().replace(/\s+#.*$/, ""); // remove inline comments
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value.trim();
    }
  }
} catch {
  // .env not found or not readable - env vars must be set externally
}

// ---------- config ----------
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTDIR = path.resolve(__dirname, "../output");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = "auto_rates";

const PROVIDERS = [
  "sccu",
  "nfcu",
  "ngfcu",
  "ccufl",
  "ccu_il",
  "ccu_online",
  "ccu_mi",
];

// Short/long display names for each provider (used for JSON headers/enrichment)
const PROVIDER_NAMES_STATIC = {
  sccu: { short: "SCCU", long: "Space Coast Credit Union" },
  nfcu: { short: "NFCU", long: "Navy Federal Credit Union" },
  ngfcu: { short: "NGFCU", long: "Northrop Grumman Federal Credit Union" },
  ccufl: { short: "CCUFL", long: "Community Credit Union of Florida" },
  ccu_il: { short: "CCU", long: "Consumers Credit Union (IL)" },
  ccu_online: {
    short: "CCU-Online",
    long: "Consumers Credit Union (Online via Car Buying Service)",
  },
  ccu_mi: { short: "Consumers CU", long: "Consumers Credit Union (MI)" },
  tru: { short: "Tru", long: "Truist Bank" },
  boa: { short: "BoA", long: "Bank of America" },
};

async function loadProviderNames() {
  const names = { ...PROVIDER_NAMES_STATIC };
  try {
    const configPath = path.resolve(__dirname, "../config/lenders.json");
    const raw = await fs.readFile(configPath, "utf8");
    const lenders = JSON.parse(raw);
    if (Array.isArray(lenders)) {
      for (const lender of lenders) {
        const id = (lender?.id || lender?.source || "").toLowerCase();
        if (!id) continue;
        const short = String(lender?.shortName || lender?.source || id)
          .toUpperCase()
          .trim();
        const long = String(lender?.longName || lender?.name || short).trim();
        if (!short || !long) continue;
        names[id] = { short, long };
      }
    }
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn(
        `[warn] failed to load lender display names from config: ${err.message}`
      );
    }
  }
  return names;
}

const PROVIDER_NAMES = await loadProviderNames();

function formatProviderLabel(providerId) {
  const info = PROVIDER_NAMES[providerId] || {};
  const longName = info.long || null;
  const shortName = info.short || providerId.toUpperCase();
  return longName ? `${longName} (${providerId})` : `${shortName} (${providerId})`;
}

function parseRemovalInput(raw) {
  if (!raw) throw new Error("Removal value is required");
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Removal value is required");

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    let parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    }
    const [key, value] = Object.entries(parsed ?? {})[0] ?? [];
    if (!key || value == null)
      throw new Error("Removal JSON must contain a single key/value pair");
    return { field: key.trim(), value: String(value).trim() };
  }

  const match = trimmed.match(
    /^["']?([^"'=:\s]+)["']?\s*[:=]\s*["']?(.+?)["']?$/
  );
  if (!match)
    throw new Error(
      "Unable to parse removal argument. Use JSON or key=value format."
    );
  return { field: match[1].trim(), value: match[2].trim() };
}

function resolveProviderId({ field, value }) {
  const lowerField = field.toLowerCase();
  const needle = value.toLowerCase();

  if (["source", "provider", "id"].includes(lowerField)) {
    if (PROVIDERS.includes(needle)) return needle;
    const exact = PROVIDERS.find((p) => p.toLowerCase() === needle);
    if (exact) return exact;
    throw new Error(`Unknown provider id '${value}'.`);
  }

  if (lowerField === "shortname") {
    const entry = Object.entries(PROVIDER_NAMES).find(
      ([, info]) => info.short.toLowerCase() === needle
    );
    if (!entry) throw new Error(`No provider matches shortName '${value}'.`);
    return entry[0];
  }

  if (lowerField === "longname") {
    const entry = Object.entries(PROVIDER_NAMES).find(
      ([, info]) => info.long.toLowerCase() === needle
    );
    if (!entry) throw new Error(`No provider matches longName '${value}'.`);
    return entry[0];
  }

  throw new Error(
    `Unsupported field '${field}' for removal. Use longName, shortName, provider, or source.`
  );
}

async function promptConfirmRemoval(displayName, providerId) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `Are you sure you want to remove rates for ${displayName} (${providerId})? (y/N): `
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function handleRemoval(remValue) {
  let criteria;
  try {
    criteria = parseRemovalInput(remValue);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let providerId;
  try {
    providerId = resolveProviderId(criteria);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const names = PROVIDER_NAMES[providerId] || {};
  const displayName = names.long || names.short || providerId.toUpperCase();

  const sb = getClient();
  if (!sb) {
    console.error("❌ Supabase credentials missing. Cannot remove data.");
    process.exitCode = 1;
    return;
  }

  console.log(`[info] Checking Supabase for ${displayName} (${providerId})...`);
  const { count, error: countError } = await sb
    .from(TABLE)
    .select("source", { head: true, count: "exact" })
    .eq("source", providerId);
  if (countError) {
    console.error(
      `❌ Failed to query Supabase: ${countError.message ?? countError}`
    );
    process.exitCode = 1;
    return;
  }
  if (!count) {
    console.log(`[info] No rows found for ${displayName}; nothing to remove.`);
    return;
  }
  console.log(`[info] Found ${count} row(s) ready for removal.`);

  const confirmed = await promptConfirmRemoval(displayName, providerId);
  if (!confirmed) {
    console.log("[info] Removal cancelled by user.");
    return;
  }

  try {
    const removed = await deleteOldRows(sb, [providerId]);
    if (!removed.length) {
      console.log(`[info] No rows found for ${displayName}; nothing removed.`);
      return;
    }
    console.log(
      `[ok] Removed ${removed.length} row(s) for ${displayName} (${providerId}).`
    );

    console.log(
      "[info] Fetching remaining Supabase rows to refresh local export..."
    );
    const { data: remaining, error } = await sb
      .from(TABLE)
      .select("*")
      .order("source", { ascending: true })
      .order("loan_type", { ascending: true })
      .order("term_range_min", { ascending: true });
    if (error) {
      throw error;
    }

    const rowsRaw = remaining || [];
    const rows = rowsRaw.map(
      ({ id, uuid, created_at, updated_at, ...rest }) => rest
    );
    const nameLookup = Object.fromEntries(
      Object.entries(PROVIDER_NAMES).map(([id, info]) => [
        id.toLowerCase(),
        info,
      ])
    );

    const providersMap = new Map();
    for (const row of rows) {
      const source = row.source;
      const sourceKey =
        typeof source === "string" ? source.toLowerCase() : String(source);
      if (!providersMap.has(source)) {
        const info = nameLookup[sourceKey] || {};
        providersMap.set(source, {
          provider: source,
          shortName: info.short || source.toUpperCase(),
          longName: info.long || source,
          sourceUrl: null,
          effectiveDate: row.effective_at ?? todayISO(),
          loanType: null,
          matrix: [],
        });
      }
      const providerEntry = providersMap.get(source);
      providerEntry.matrix.push({
        termMin: row.term_range_min ?? row.term_months_min ?? null,
        termMax: row.term_range_max ?? row.term_months_max ?? null,
        apr: row.apr_percent != null ? Number(row.apr_percent) / 100 : null,
        loan_type: row.loan_type,
        vehicle_condition: row.vehicle_condition,
      });
    }

    const providers = Array.from(providersMap.values());
    const rowsEnriched = rows.map((row) => {
      const sourceKey =
        typeof row.source === "string"
          ? row.source.toLowerCase()
          : String(row.source);
      const info = nameLookup[sourceKey] || {};
      return {
        ...row,
        source_short_name:
          info.short || row.source?.toUpperCase?.() || row.source,
        source_long_name: info.long || row.source,
      };
    });

    await fs.mkdir(OUTDIR, { recursive: true });
    const outFile = path.join(OUTDIR, `rates-${todayISO()}.json`);
    const payload = {
      generatedAt: new Date().toISOString(),
      headers: {
        source_short_name: "short name",
        source_long_name: "long name",
      },
      providers,
      rows,
      rows_enriched: rowsEnriched,
    };
    await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");
    console.log(`[info] Updated export written to ${outFile}`);

    if (rows.length) {
      const providersToReinsert = Array.from(
        new Set(rows.map((row) => row.source))
      );
      console.log(
        "[info] Refreshing Supabase with latest rates (excluding removed provider)..."
      );
      await deleteOldRows(sb, providersToReinsert);
      await insertRows(sb, rows);
      console.log(
        `[ok] Supabase refreshed with ${rows.length} row(s) across ${providersToReinsert.length} provider(s).`
      );
    } else {
      console.log("[info] No remaining rows to upsert to Supabase.");
    }
  } catch (err) {
    console.error(`❌ Failed to remove rates: ${err.message ?? err}`);
    process.exitCode = 1;
  }
}
// --- Consumers Credit Union (Online via Car Buying Service) ---
async function fetchCCU_Online() {
  const url = "https://www.myconsumers.org/loans/auto-loans";
  const { html } = await fetchPage(url, { selector: "table" });
  const document = parseDocument(html);

  // Effective date (e.g., "Rates effective June 26, 2025")
  let effectiveDateISO = null;
  const effNode = Array.from(document.querySelectorAll("*")).find((el) =>
    /Rates\s+effective\s+[A-Za-z]{3,}\s+\d{1,2},\s+\d{4}/i.test(
      normalizedText(el)
    )
  );
  if (effNode) {
    const m = normalizedText(effNode).match(
      /Rates\s+effective\s+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
    );
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d)) effectiveDateISO = d.toISOString().slice(0, 10);
    }
  }

  // Same table as CCU (IL), but prefer the "With Auto Buying Service" APR column
  const table = Array.from(document.querySelectorAll("table")).find((tbl) => {
    const text = normalizedText(tbl);
    return /2023\s+and\s+Newer/i.test(text) && /2019\s+to\s+2022/i.test(text);
  });
  const matrix = [];
  if (table) {
    table.querySelectorAll("tr").forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td, th")).map((cell) =>
        normalizedText(cell)
      );
      if (!tds.length) return;
      const line = tds.join(" ");
      const mTerm = line.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*Months/i);
      if (!mTerm) return;
      const lo = Number(mTerm[1]);
      const hi = Number(mTerm[2]);

      // Prefer WITH Auto Buying Service; fall back to WITHOUT if needed
      const mABS = line.match(
        /With\s+Auto\s+Buying\s+Service\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%/i
      );
      const mNoABS = line.match(
        /Without\s+Auto\s+Buying\s+Service\**\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%/i
      );
      const pick = mABS || mNoABS;
      if (!pick) return;
      const aprNew = Number(pick[1]) / 100; // 2023 and Newer
      const aprUsed = Number(pick[2]) / 100; // 2019 to 2022

      for (const loan_type of ["purchase", "refinance"]) {
        matrix.push({
          termMin: lo,
          termMax: hi,
          apr: aprNew,
          vehicle_condition: "new",
          loan_type,
        });
        matrix.push({
          termMin: lo,
          termMax: hi,
          apr: aprUsed,
          vehicle_condition: "used",
          loan_type,
        });
      }
    });
  }

  if (!matrix.length) throw new Error("CCU-Online auto rates table not parsed");

  return {
    provider: "ccu_online",
    shortName: PROVIDER_NAMES.ccu_online.short,
    longName: PROVIDER_NAMES.ccu_online.long,
    sourceUrl: url,
    effectiveDate: effectiveDateISO || todayISO(),
    loanType: null,
    matrix: matrix.sort(
      (a, b) =>
        a.termMin - b.termMin ||
        a.termMax - b.termMax ||
        a.vehicle_condition.localeCompare(b.vehicle_condition) ||
        a.loan_type.localeCompare(b.loan_type)
    ),
  };
}
// --- Consumers Credit Union (IL) ---
async function fetchCCU_IL() {
  const url = "https://www.myconsumers.org/loans/auto-loans";
  const { html } = await fetchPage(url, { selector: "table" });
  const document = parseDocument(html);

  // Effective date (e.g., "Rates effective June 26, 2025")
  let effectiveDateISO = null;
  const effNode = Array.from(document.querySelectorAll("*")).find((el) =>
    /Rates\s+effective\s+[A-Za-z]{3,}\s+\d{1,2},\s+\d{4}/i.test(
      normalizedText(el)
    )
  );
  if (effNode) {
    const m = normalizedText(effNode).match(
      /Rates\s+effective\s+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
    );
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d)) effectiveDateISO = d.toISOString().slice(0, 10);
    }
  }

  // Locate the Auto Loan rate table by its distinctive header row
  const table = Array.from(document.querySelectorAll("table")).find((tbl) => {
    const text = normalizedText(tbl);
    return /2023\s+and\s+Newer/i.test(text) && /2019\s+to\s+2022/i.test(text);
  });

  const matrix = [];
  if (table) {
    table.querySelectorAll("tr").forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td, th")).map((cell) =>
        normalizedText(cell)
      );
      if (!tds.length) return;
      const line = tds.join(" ");
      // Term buckets like "0-60 Months", "61-72 Months", "73-84 Months"
      const mTerm = line.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*Months/i);
      if (!mTerm) return;
      const lo = Number(mTerm[1]);
      const hi = Number(mTerm[2]);

      // Prefer the "Without Auto Buying Service" APRs if present; otherwise fall back to "With Auto Buying Service"
      // Rows include two APRs: one for 2023+ (treat as NEW) and one for 2019–2022 (treat as USED)
      // We search in-order for patterns ending with two percents
      let mNoABS = line.match(
        /Without\s+Auto\s+Buying\s+Service\**\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%/i
      );
      let mABS = line.match(
        /With\s+Auto\s+Buying\s+Service\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%/i
      );
      const pick = mNoABS || mABS;
      if (!pick) return;
      const aprNew = Number(pick[1]) / 100; // 2023 and Newer
      const aprUsed = Number(pick[2]) / 100; // 2019 to 2022

      // Emit rows for both purchase and refinance
      for (const loan_type of ["purchase", "refinance"]) {
        matrix.push({
          termMin: lo,
          termMax: hi,
          apr: aprNew,
          vehicle_condition: "new",
          loan_type,
        });
        matrix.push({
          termMin: lo,
          termMax: hi,
          apr: aprUsed,
          vehicle_condition: "used",
          loan_type,
        });
      }
    });
  }

  if (!matrix.length) throw new Error("CCU (IL) auto rates table not parsed");
  return {
    provider: "ccu_il",
    shortName: PROVIDER_NAMES.ccu_il.short,
    longName: PROVIDER_NAMES.ccu_il.long,
    sourceUrl: url,
    effectiveDate: effectiveDateISO || todayISO(),
    loanType: null,
    matrix: matrix.sort(
      (a, b) =>
        a.termMin - b.termMin ||
        a.termMax - b.termMax ||
        a.vehicle_condition.localeCompare(b.vehicle_condition) ||
        a.loan_type.localeCompare(b.loan_type)
    ),
  };
}

// --- Consumers Credit Union (MI) ---
async function fetchCCU_MI() {
  const url = "https://www.consumerscu.org/rates/lending-rates";
  const res = await fetch(url, {
    headers: { "User-Agent": "rates-bot/1.0 (+excelcalc)" },
  });
  if (!res.ok) throw new Error(`Consumers CU (MI) fetch failed: ${res.status}`);
  // The public page populates rates via XHR to the secure JSON endpoint; fetch that directly.
  const apiUrl = "https://secure.consumerscu.org/rates/?cat=6";
  const apiRes = await fetch(apiUrl, {
    headers: { "User-Agent": "rates-bot/1.0 (+excelcalc)" },
  });
  if (!apiRes.ok)
    throw new Error(`Consumers CU (MI) rates api failed: ${apiRes.status}`);
  const data = await apiRes.json();
  const subcategories = data?.Category?.Subcategories ?? [];
  const auto = subcategories.find((sub) =>
    /automobile/i.test(sub?.SubcategoryDescription ?? "")
  );
  const products = Array.isArray(auto?.Products) ? auto.Products : [];

  function parseTermRange(raw) {
    if (typeof raw !== "string") return { min: null, max: null };
    const lower = raw.toLowerCase();
    let min = null;
    let max = null;
    const between = lower.match(/(\d{1,3})\s*(?:-|to)\s*(\d{1,3})\s*month/);
    if (between) {
      min = Number(between[1]);
      max = Number(between[2]);
    } else {
      const upTo = lower.match(/up\s*to\s*(\d{1,3})\s*month/);
      if (upTo) {
        min = 0;
        max = Number(upTo[1]);
      } else {
        const exact = lower.match(/(\d{1,3})\s*month/);
        if (exact) {
          min = Number(exact[1]);
          max = Number(exact[1]);
        }
      }
    }
    return {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
  }

  const matrix = [];
  for (const product of products) {
    const { min: termMin, max: termMax } = parseTermRange(product?.Max ?? "");
    const apr = toPct(product?.Rate1);
    if (apr == null || termMax == null) continue;
    const name = decodeHtmlEntities(product?.ProductName ?? "");
    const vehicle_condition = /newer|less than/i.test(name)
      ? "new"
      : /older|years old|more than/i.test(name)
      ? "used"
      : "new_or_used";
    for (const loan_type of ["purchase", "refinance"]) {
      matrix.push({
        termMin: termMin ?? 0,
        termMax,
        apr,
        vehicle_condition,
        loan_type,
      });
    }
  }

  if (!matrix.length)
    throw new Error("Consumers CU (MI) automobile loan pattern not found");
  return {
    provider: "ccu_mi",
    shortName: PROVIDER_NAMES.ccu_mi.short,
    longName: PROVIDER_NAMES.ccu_mi.long,
    sourceUrl: url,
    effectiveDate: todayISO(),
    loanType: null,
    matrix,
  };
}

const PROVIDER_FETCHERS = {
  sccu: fetchSCCU,
  nfcu: fetchNFCU,
  ngfcu: fetchNGFCU,
  ccufl: fetchCCUFL,
  ccu_il: fetchCCU_IL,
  ccu_online: fetchCCU_Online,
  ccu_mi: fetchCCU_MI,
};

// ---------- cli flags ----------
const argv = process.argv.slice(2);
const flags = new Set(argv);
const getFlagValue = (name, def = null) => {
  const idx = argv.indexOf(name);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : def;
};
const DRY = flags.has("--dry-run");
const PRINT_JSON = flags.has("--print-json");
const ONLY_RAW = getFlagValue("--provider", null);
const ONLY = ONLY_RAW ? ONLY_RAW.toLowerCase() : null; // e.g. sccu
const REMOVE_RAW = getFlagValue("--rem", getFlagValue("--remove", null));

// --- paste-from-HTML mode flags ---
const PASTE_HTML = flags.has("--paste-html");
const IN_FILE = getFlagValue("--in", null);
const PROVIDER_FLAG = flags.has("--provider") ? ONLY_RAW : null;
const SHORT_FLAG = flags.has("--short")
  ? getFlagValue("--short", null)
  : PROVIDER_FLAG
  ? PROVIDER_FLAG.toUpperCase()
  : null;
const LONG_FLAG = flags.has("--long")
  ? getFlagValue("--long", null)
  : SHORT_FLAG || null;
const SOURCE_URL_FLAG = getFlagValue("--source-url", null);
const EFFECTIVE_FLAG = getFlagValue("--effective", null); // default resolved later
const PURCHASE_ONLY = flags.has("--purchase-only");
const REFI_ONLY = flags.has("--refi-only");
const UPSERT_FLAG = flags.has("--upsert");
const ADD_MODE = flags.has("--add");
const LENDER_FLAG = getFlagValue("--lender", null);
const URL_FLAG = getFlagValue("--url", null);
const FILE_FLAG = getFlagValue("--file", null);
const CLIPBOARD_FLAG = flags.has("--clipboard");
const NO_PROMPTS_FLAG = flags.has("--no-prompts") || flags.has("--auto");

// --- headless render flags (Playwright) ---
const RENDER_SELECTOR = getFlagValue("--render-selector", null); // optional CSS selector to wait for
const RENDER_TIMEOUT = Number(getFlagValue("--render-timeout", "15000")); // ms

// ---------- utility ----------
const todayISO = () => new Date().toISOString().slice(0, 10);
const toPct = (s) => {
  if (s == null) return null;
  const m = String(s).match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) / 100 : null;
};
const decodeHtmlEntities = (s) => {
  if (s == null) return "";
  const { document } = parseHTML(`<span>${s}</span>`);
  const span = document.querySelector("span");
  return span?.textContent?.replace(/\s+/g, " ").trim() ?? "";
};
const extractCellText = (cell) => {
  if (!cell) return "";
  const direct = (cell.textContent || "").replace(/\s+/g, " ").trim();
  if (direct) {
    // Some sites inline stringified content via document.write("...".tagReplace());
    const m = direct.match(
      /document\.write\((['"`])([\s\S]*?)\1\.tagReplace\(\)\s*\);?/i
    );
    if (m && m[2]) {
      const decoded = decodeHtmlEntities(m[2]);
      if (decoded.trim()) return decoded.trim();
    }
    return direct;
  }
  // Otherwise, scan inline & child scripts for document.write(...) with tagReplace()
  const pieces = [];
  cell.querySelectorAll("script").forEach((el) => {
    const raw = el?.textContent || "";
    const m = raw.match(
      /document\.write\((['"`])([\s\S]*?)\1\.tagReplace\(\)\s*\);?/i
    );
    if (m && m[2]) {
      const decoded = decodeHtmlEntities(m[2]);
      if (decoded.trim()) pieces.push(decoded.trim());
    }
  });
  if (!pieces.length) return "";
  return pieces.join(" ").replace(/\s+/g, " ").trim();
};

const parseDocument = (html) => parseHTML(html).document;
const normalizedText = (node) =>
  (node?.textContent || "").replace(/\s+/g, " ").trim();

// ---------- add mode helpers ----------
async function promptInput(prompt, defaultValue = "") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  try {
    const answer = await rl.question(`${prompt}${suffix}: `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function promptYesNo(prompt, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  while (true) {
    const input = await promptInput(
      `${prompt} (${hint})`,
      defaultYes ? "y" : "n"
    );
    const lower = input.trim().toLowerCase();
    if (!lower) return defaultYes;
    if (["y", "yes"].includes(lower)) return true;
    if (["n", "no"].includes(lower)) return false;
    console.log("Please respond with y or n.");
  }
}

async function readMultilineInput({ endMarker = "<<<END>>>" } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = [];
  try {
    for await (const line of rl) {
      if (line.trim() === endMarker) break;
      lines.push(line);
    }
  } finally {
    rl.close();
  }
  return lines.join("\n");
}

async function promptForManualHtml({
  label = "HTML",
  defaultPath = path.resolve(process.cwd(), "output/html_paste"),
  endMarker = "<<<END>>>",
} = {}) {
  const proceed = await promptYesNo(
    `[info] Unable to parse ${label}. Paste captured HTML manually?`,
    true
  );
  if (!proceed) return null;

  console.log(
    `[info] If you saved the HTML to a file, enter its path (e.g. ${defaultPath}).`
  );
  const filePath = await promptInput("Path (leave blank to paste now)", "");
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    try {
      const contents = await fs.readFile(resolved, "utf8");
      console.log(`[info] Loaded HTML from ${resolved}`);
      return contents;
    } catch (err) {
      console.warn(
        `[warn] Failed to read ${resolved}: ${
          err?.message ?? err
        }. Falling back to manual paste.`
      );
    }
  }

  console.log(
    `[info] Paste the HTML snippet now. When finished, type ${endMarker} on its own line.`
  );
  const pasted = await readMultilineInput({ endMarker });
  if (!pasted.trim()) {
    console.warn("[warn] No HTML received.");
    return null;
  }
  return pasted;
}

async function loadHtmlFromFilePath(
  rawPath,
  { label = "rate table file" } = {}
) {
  if (!rawPath) return null;
  let candidate = rawPath.trim();
  if (!candidate) return null;
  if (candidate.startsWith("file://")) {
    candidate = candidate.slice("file://".length);
  }

  const candidates = [];
  const expandTilde = candidate.startsWith("~")
    ? path.join(os.homedir(), candidate.slice(1))
    : candidate;
  if (path.isAbsolute(expandTilde)) {
    candidates.push(expandTilde);
  } else {
    candidates.push(path.resolve(PROJECT_ROOT, expandTilde));
  }
  if (candidate.startsWith("/")) {
    candidates.push(path.resolve(PROJECT_ROOT, candidate.slice(1)));
  }

  for (const attempt of candidates) {
    try {
      const stat = await fs.stat(attempt);
      if (!stat.isFile()) continue;
      const html = await fs.readFile(attempt, "utf8");
      console.log(
        `[add] Loaded HTML from ${path.relative(PROJECT_ROOT, attempt)}`
      );
      return {
        url: `file://${attempt}`,
        html,
        document: parseDocument(html),
      };
    } catch {
      continue;
    }
  }
  console.warn(
    `[add] Failed to read ${label} (${rawPath}). File not found or inaccessible.`
  );
  return null;
}

function readClipboardText() {
  const commands = [];
  if (process.platform === "darwin") {
    commands.push("pbpaste");
  } else if (process.platform === "win32") {
    commands.push('powershell -Command "Get-Clipboard -Raw"');
    commands.push("powershell Get-Clipboard");
  } else {
    commands.push("xclip -selection clipboard -out");
    commands.push("xsel --clipboard --output");
  }
  for (const cmd of commands) {
    try {
      const text = execSync(cmd, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (text && text.trim()) return text;
    } catch {
      // try next
    }
  }
  return null;
}

function createPageInfoFromHtml(html, source = "manual://inline") {
  return { url: source, html, document: parseDocument(html) };
}

function normalizeUrlInput(raw) {
  if (!raw) return null;
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:/i.test(url) && /^[\w.-]+\.[a-z]{2,}/i.test(url)) {
    url = `https://${url}`;
  }
  if (!/^https?:/i.test(url)) {
    return null;
  }
  return url;
}

async function chooseBraveResult(searchTerm, { interactive }) {
  if (!searchTerm) return null;
  console.log(`[add] Searching Brave for: "${searchTerm}"`);
  const results = await searchBrave(searchTerm);
  if (!results.length) {
    console.warn("[add] Brave search returned no results.");
    return null;
  }
  if (!interactive) {
    const top = results[0];
    console.log(`[add] Using top Brave result: ${top.title} (${top.url})`);
    return top;
  }

  console.log("\n[add] Brave search results:");
  results.forEach((res, idx) => {
    console.log(
      `  ${idx + 1}. ${res.title}\n     ${res.url}\n     ${
        res.snippet || "(no snippet)"
      }`
    );
  });
  console.log();

  while (true) {
    const choice = await promptInput(
      `Select result [1-${results.length}] or paste a URL`,
      "1"
    );
    const trimmed = choice.trim();
    if (!trimmed) return results[0];
    if (/^\d+$/.test(trimmed)) {
      const idx = Number(trimmed);
      if (idx >= 1 && idx <= results.length) {
        return results[idx - 1];
      }
      console.warn("[add] Invalid selection.");
      continue;
    }
    const normalized = normalizeUrlInput(trimmed);
    if (normalized) {
      return { url: normalized, title: normalized, snippet: "" };
    }
    console.warn("[add] Please enter a valid number or URL.");
  }
}

async function fetchPageInfoFromUrlCandidate(url, { lenderName, interactive }) {
  if (!url) return null;
  console.log(`[add] Resolving lender page from ${url}`);
  const pageInfo = await findAutoLoanPage(url);
  if (!pageInfo) {
    console.warn("[add] Unable to locate auto loan page from provided URL.");
    return null;
  }
  const summary = summarizeHtml(pageInfo.html);
  if (summary) {
    console.log(`      Snippet: ${summary}`);
  }
  if (interactive) {
    const ok = await promptYesNo("Use this page?", true);
    if (!ok) return null;
  } else {
    console.log(`[add] Using page: ${pageInfo.url}`);
  }
  return pageInfo;
}

async function fetchPageInfoFromSearch(
  searchTerm,
  { lenderName, interactive }
) {
  const result = await chooseBraveResult(searchTerm, { interactive });
  if (!result) return null;
  const pageInfo = await fetchPageInfoFromUrlCandidate(result.url, {
    lenderName,
    interactive,
  });
  if (pageInfo) return pageInfo;
  return null;
}

function getClipboardPageInfo() {
  const raw = readClipboardText();
  if (!raw || !raw.trim()) {
    console.warn("[add] Clipboard is empty.");
    return null;
  }
  console.log("[add] Loaded HTML from clipboard.");
  return createPageInfoFromHtml(raw, "clipboard://");
}

function guessShortName(name) {
  const upper = String(name || "")
    .replace(/credit union/i, " CU")
    .replace(/financial/i, " F")
    .replace(/bank/i, " B");
  const parts = upper
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (!parts.length) return "LENDER";
  const initials = parts.map((p) => p[0]).join("");
  return (
    initials.length >= 2 ? initials : parts.join("").slice(0, 4)
  ).toUpperCase();
}

function sanitizeProviderId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

async function searchBrave(query) {
  const apiKey =
    process.env.BRAVE_SEARCH_API_KEY ||
    process.env.BRAVE_API_KEY ||
    process.env.BRAVESEARCH_API_KEY;
  if (!apiKey) {
    console.warn("[add] BRAVE_SEARCH_API_KEY missing; skipping web search.");
    return [];
  }

  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", "10");

  try {
    const res = await fetch(endpoint.toString(), {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
        "User-Agent": DEFAULT_FETCH_HEADERS["User-Agent"],
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const results = Array.isArray(data?.web?.results) ? data.web.results : [];
    return results
      .map((item) => ({
        url: item?.url,
        title: item?.title || item?.name,
        snippet: item?.description || item?.snippet || "",
      }))
      .filter((item) => item.url && item.title)
      .slice(0, 5);
  } catch (error) {
    console.warn(`[add] Brave search failed: ${error?.message ?? error}`);
    return [];
  }
}

async function fetchPlainHtml(url) {
  try {
    const { html } = await fetchPage(url);
    return html;
  } catch (error) {
    console.warn(`[add] Failed to fetch ${url}: ${error?.message ?? error}`);
    return null;
  }
}

function extractMainDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

function isAutoLoanPage(url, html, document) {
  const loweredUrl = url.toLowerCase();
  const text = html?.toLowerCase?.() ?? "";
  const hasAuto =
    loweredUrl.includes("auto") ||
    loweredUrl.includes("vehicle") ||
    loweredUrl.includes("car") ||
    /auto\s+loan/i.test(text);
  const hasLoan =
    loweredUrl.includes("loan") ||
    loweredUrl.includes("rate") ||
    loweredUrl.includes("finance") ||
    /loan|apr|rate/i.test(text);
  if (hasAuto && hasLoan) return true;
  const bodyText =
    document?.body?.textContent?.toLowerCase().replace(/\s+/g, " ") ?? "";
  return /auto/.test(bodyText) && /(loan|rate|apr)/.test(bodyText);
}

async function findAutoLoanPage(seedUrl) {
  const seedHtml = await fetchPlainHtml(seedUrl);
  if (seedHtml) {
    const seedDoc = parseDocument(seedHtml);
    if (isAutoLoanPage(seedUrl, seedHtml, seedDoc)) {
      return { url: seedUrl, html: seedHtml, document: seedDoc };
    }
  }

  const origin = extractMainDomain(seedUrl);
  const originHtml = seedUrl.startsWith(origin)
    ? seedHtml
    : await fetchPlainHtml(origin);
  if (!originHtml) return null;
  const originDoc = parseDocument(originHtml);
  const candidates = new Map();

  originDoc.querySelectorAll("a[href]").forEach((el) => {
    const href = el.getAttribute("href");
    if (!href) return;
    let absolute;
    try {
      absolute = new URL(href, origin).toString();
    } catch {
      return;
    }
    if (!absolute.startsWith(origin)) return;
    const lowered = absolute.toLowerCase();
    const label = normalizedText(el);
    const labelLower = label.toLowerCase();
    if (
      (lowered.includes("auto") ||
        lowered.includes("vehicle") ||
        lowered.includes("car")) &&
      (lowered.includes("loan") ||
        lowered.includes("rate") ||
        labelLower.includes("rate") ||
        labelLower.includes("loan"))
    ) {
      if (!candidates.has(absolute)) {
        candidates.set(absolute, { url: absolute, label });
      }
    }
  });

  const shortlist = Array.from(candidates.values()).slice(0, 5);
  for (const candidate of shortlist) {
    const html = await fetchPlainHtml(candidate.url);
    if (!html) continue;
    const document = parseDocument(html);
    if (isAutoLoanPage(candidate.url, html, document)) {
      return { url: candidate.url, html, document };
    }
  }

  if (shortlist.length) {
    const fallback = shortlist[0];
    const html = await fetchPlainHtml(fallback.url);
    if (html) {
      const document = parseDocument(html);
      return { url: fallback.url, html, document };
    }
  }

  const commonPaths = [
    "/auto-loans",
    "/auto-rates",
    "/vehicle-loans",
    "/car-loans",
    "/loans/auto",
    "/borrow/auto",
    "/rates/auto",
    "/rates",
  ];
  for (const pathSuffix of commonPaths) {
    const url = origin + pathSuffix;
    const html = await fetchPlainHtml(url);
    if (!html) continue;
    const document = parseDocument(html);
    if (isAutoLoanPage(url, html, document)) {
      return { url, html, document };
    }
  }

  return null;
}

function summarizeHtml(html, limit = 240) {
  if (!html) return "";
  const document = parseDocument(html);
  const text = document?.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function detectEffectiveDate(html) {
  if (!html) return null;
  const patterns = [
    /effective\s+(?:as\s+of\s+|on\s+)?([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
    /effective\s+([A-Za-z]{3}\.? \d{1,2}, \d{4})/i,
    /effective\s+(\d{4}-\d{2}-\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const raw = match[1].replace(/\./g, "");
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }
  return null;
}

function parseLoanTypesInput(input) {
  const value = input.trim().toLowerCase();
  if (!value || value === "both" || value === "all") {
    return ["purchase", "refinance"];
  }
  const parts = value.split(/[,\s]+/).filter(Boolean);
  const set = new Set();
  for (const part of parts) {
    if (part.startsWith("p")) set.add("purchase");
    if (part.startsWith("r")) set.add("refinance");
  }
  return set.size ? Array.from(set) : ["purchase", "refinance"];
}

function normalizeInteractiveValue(value, flagKeyword, example) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return trimmed;
  if (flagKeyword) {
    const pattern = new RegExp(`^--${flagKeyword}\\s+`, "i");
    if (pattern.test(trimmed)) {
      const cleaned = trimmed.replace(pattern, "").trim();
      console.warn(
        `[add] Detected '--${flagKeyword}'. Please enter just the value (e.g., ${example}).`
      );
      return cleaned;
    }
  }
  if (/^--/.test(trimmed)) {
    console.warn(
      "[add] Detected CLI flag syntax. Please enter just the raw value."
    );
    return trimmed.replace(/^--[^\s]+\s*/i, "").trim();
  }
  return trimmed;
}

const normalizeToken = (value, { stripCommon = false } = {}) => {
  const lower = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!stripCommon) return lower;
  return lower.replace(
    /(federal|credit|union|bank|cu|corp|inc|llc|association|cooperative)/g,
    ""
  );
};

function findExistingProviderForName(lenderName) {
  const target = normalizeToken(lenderName, { stripCommon: true });
  if (!target) return null;
  let best = null;
  let bestScore = -Infinity;
  const preferStatic = (id) => (PROVIDER_NAMES_STATIC[id] ? 1 : 0);

  for (const [id, info] of Object.entries(PROVIDER_NAMES)) {
    const candidates = [
      { token: normalizeToken(id, { stripCommon: true }), base: 4 },
      { token: normalizeToken(info.short, { stripCommon: true }), base: 3 },
      { token: normalizeToken(info.long, { stripCommon: true }), base: 2 },
    ];
    for (const { token, base } of candidates) {
      if (!token || token !== target) continue;
      const score = base + preferStatic(id);
      if (score > bestScore) {
        bestScore = score;
        best = {
          id,
          short: info.short,
          long: info.long,
        };
      }
    }
  }
  return best;
}

function buildProviderFromItems(
  items,
  { provider, shortName, longName, sourceUrl, effectiveDate, loanTypes }
) {
  const matrix = [];
  const seen = new Set();
  for (const item of items) {
    const termMin = item.termMin ?? item.termMonths ?? item.term_months ?? null;
    const termMax = item.termMax ?? item.termMonths ?? item.term_months ?? null;
    if (termMin == null || termMax == null) continue;
    const vehicleConditionRaw = String(
      item.vehicle_condition || "new"
    ).toLowerCase();
    const conditionSet = /new_or_used|either|any/.test(vehicleConditionRaw)
      ? ["new", "used"]
      : [vehicleConditionRaw];
    for (const condition of conditionSet) {
      for (const loanType of loanTypes) {
        const key = [
          provider,
          loanType,
          condition,
          termMin,
          termMax,
          effectiveDate,
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        matrix.push({
          termMin,
          termMax,
          apr: item.apr,
          vehicle_condition: condition,
          loan_type: loanType,
        });
      }
    }
  }
  return {
    provider,
    shortName,
    longName,
    sourceUrl,
    effectiveDate,
    loanType: null,
    matrix,
  };
}

async function finalizeAddFlow({ lenderName, pageInfo, interactive }) {
  let renderedHtml = pageInfo.html;
  if (/^https?:/i.test(pageInfo.url)) {
    console.log(`\n[add] Rendering ${pageInfo.url} via Playwright...`);
    const rendered = await fetchPage(pageInfo.url, {
      selector: RENDER_SELECTOR,
      timeout: RENDER_TIMEOUT,
    });
    renderedHtml = rendered?.html ?? pageInfo.html;
  } else {
    console.log("[add] Using provided HTML without additional rendering.");
  }

  let items = parseAutoRatesFromHTML(renderedHtml);
  if (!items.length && pageInfo.html && pageInfo.html !== renderedHtml) {
    console.log("[add] Falling back to static HTML parse.");
    items = parseAutoRatesFromHTML(pageInfo.html);
  }
  if (!items.length && interactive) {
    const manualHtml = await promptForManualHtml({
      label: `${lenderName} rate table`,
      defaultPath: path.resolve(PROJECT_ROOT, "output/html_paste"),
    });
    if (manualHtml) {
      items = parseAutoRatesFromHTML(manualHtml);
    }
  }
  if (!items.length) {
    console.error("[add] Failed to parse any auto loan rates from the page.");
    process.exit(1);
  }
  console.log(
    `[add] Parsed ${items.length} rate bucket(s) from source content.`
  );

  const existingProvider = findExistingProviderForName(lenderName);
  if (existingProvider) {
    console.log(
      `[add] Found existing provider '${existingProvider.id}'. Defaults will reuse it.`
    );
  }

  let shortName = (
    SHORT_FLAG ||
    existingProvider?.short ||
    guessShortName(lenderName) ||
    lenderName
  ).toUpperCase();
  if (interactive) {
    while (true) {
      const input = await promptInput(
        `Short name / ticker (e.g., PENFED) [${shortName}]`,
        shortName
      );
      const cleaned = normalizeInteractiveValue(input, "short", "PENFED");
      if (!cleaned) {
        console.warn("[add] Short name cannot be empty.");
        continue;
      }
      shortName = cleaned.toUpperCase();
      break;
    }
  } else {
    console.log(`[add] Using short name: ${shortName}`);
  }

  let providerId =
    PROVIDER_FLAG != null
      ? sanitizeProviderId(PROVIDER_FLAG)
      : existingProvider?.id
      ? existingProvider.id
      : sanitizeProviderId(shortName || lenderName);
  if (interactive) {
    while (true) {
      const input = await promptInput(
        `Provider id (slug) [${providerId}]`,
        providerId
      );
      const cleaned = normalizeInteractiveValue(input, "provider", "penfed");
      const candidate = sanitizeProviderId(cleaned || providerId);
      if (!candidate) {
        console.warn(
          "[add] Provider id must contain letters or numbers (e.g., penfed)."
        );
        continue;
      }
      providerId = candidate;
      break;
    }
  } else {
    console.log(`[add] Using provider id: ${providerId}`);
  }

  const detectedEffective = detectEffectiveDate(renderedHtml);
  let effective = EFFECTIVE_FLAG || detectedEffective || todayISO();
  if (interactive) {
    effective = await promptInput("Effective date (YYYY-MM-DD)", effective);
  } else {
    console.log(`[add] Effective date resolved as ${effective}`);
  }

  let loanTypes = ["purchase", "refinance"];
  if (PURCHASE_ONLY) loanTypes = ["purchase"];
  if (REFI_ONLY) loanTypes = ["refinance"];
  if (interactive) {
    const loanTypesInput = await promptInput(
      "Loan types (purchase, refinance, both)",
      loanTypes.join(",")
    );
    loanTypes = parseLoanTypesInput(loanTypesInput);
  }

  const displayName = LONG_FLAG || existingProvider?.long || lenderName;
  PROVIDER_NAMES[providerId] = { short: shortName, long: displayName };

  const sourceUrl =
    SOURCE_URL_FLAG || (/^https?:/i.test(pageInfo.url) ? pageInfo.url : null);

  const provider = buildProviderFromItems(items, {
    provider: providerId,
    shortName,
    longName: displayName,
    sourceUrl,
    effectiveDate: effective,
    loanTypes,
  });
  const dbRows = buildDBRowsFromItems(items, {
    provider: providerId,
    effective,
    sourceUrl,
    loanTypes,
  });

  console.log(
    `[add] Expanded to ${dbRows.length} database row(s) for provider '${providerId}'.`
  );
  if (interactive) {
    console.table(dbRows.slice(0, Math.min(dbRows.length, 5)));
  }

  try {
    await fs.mkdir(OUTDIR, { recursive: true });
    const outFile = path.join(
      OUTDIR,
      `rates-${todayISO()}-${providerId}-add.json`
    );
    const payload = {
      generatedAt: new Date().toISOString(),
      headers: {
        source_short_name: "short name",
        source_long_name: "long name",
      },
      providers: [provider],
      rows: dbRows,
      rows_enriched: dbRows.map((row) => ({
        ...row,
        source_short_name: shortName,
        source_long_name: displayName,
      })),
    };
    await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");
    console.log(`[add] Wrote JSON export to ${outFile}`);
  } catch (err) {
    console.error(
      `[add] Failed to write output artifact: ${err?.message ?? err}`
    );
    return false;
  }

  const shouldUpsert = interactive
    ? await promptYesNo("Upsert these rows to Supabase now?", true)
    : UPSERT_FLAG;
  if (shouldUpsert) {
    const sb = getClient();
    if (!sb) {
      console.warn("[add] Supabase credentials missing; skipping upsert.");
    } else {
      try {
        await deleteOldRows(sb, [providerId]);
        await insertRows(sb, dbRows);
        console.log(
          `[add] Upserted ${dbRows.length} row(s) to Supabase for provider '${providerId}'.`
        );
      } catch (err) {
        console.error(
          `[add] Supabase operation failed: ${err?.message ?? err}`
        );
        console.error("[add] Resolve the issue and try again.");
        return false;
      }
    }
  } else {
    console.log("[add] Supabase upsert skipped.");
  }

  console.log("\n[add] Done.");
  return true;
}

async function runAddModeAuto() {
  if (!LENDER_FLAG && !LONG_FLAG && !SHORT_FLAG) {
    console.warn(
      '[add] Automatic mode requires --lender "Name" (optionally with --url/--file/--clipboard).'
    );
    console.warn(
      '     Example: npm run fetch:rates -- --add --no-prompts --lender "PenFed" --url https://www.penfed.org/auto'
    );
    return { success: false, reason: "missing_lender", lenderName: null };
  }
  const lenderName = LENDER_FLAG || LONG_FLAG || SHORT_FLAG;
  console.log(
    `[add] Running in automatic mode (no prompts). Lender: ${lenderName}`
  );

  let pageInfo = null;

  if (FILE_FLAG) {
    pageInfo = await loadHtmlFromFilePath(FILE_FLAG, { label: "HTML file" });
  }

  if (!pageInfo && CLIPBOARD_FLAG) {
    pageInfo = getClipboardPageInfo();
  }

  if (!pageInfo && URL_FLAG) {
    const normalized = normalizeUrlInput(URL_FLAG);
    if (!normalized) {
      console.warn(
        "[add] The value supplied to --url must be a valid http(s) URL."
      );
      return {
        success: false,
        reason: "invalid_url",
        lenderName,
      };
    }
    pageInfo = await fetchPageInfoFromUrlCandidate(normalized, {
      lenderName,
      interactive: false,
    });
  }

  if (!pageInfo) {
    pageInfo = await fetchPageInfoFromSearch(`${lenderName} auto loan rates`, {
      lenderName,
      interactive: false,
    });
  }

  if (!pageInfo) {
    console.warn(
      "[add] Unable to resolve a lender rate page with the supplied automatic inputs."
    );
    return {
      success: false,
      reason: "missing_source",
      lenderName,
    };
  }

  const success = await finalizeAddFlow({
    lenderName,
    pageInfo,
    interactive: false,
  });
  if (!success) {
    return {
      success: false,
      reason: "supabase_failed",
      lenderName,
    };
  }
  return { success: true, lenderName };
}

async function handleOptionUseUrl(lenderName) {
  const urlInput = await promptInput(
    "Enter the full lender rate page URL (e.g., https://example.com/rates). Leave blank to search instead.",
    URL_FLAG || ""
  );
  const sanitized = normalizeInteractiveValue(
    urlInput,
    "url",
    "https://example.com/rates"
  );
  const normalized = normalizeUrlInput(sanitized);
  if (normalized) {
    return await fetchPageInfoFromUrlCandidate(normalized, {
      lenderName,
      interactive: true,
    });
  }
  return await fetchPageInfoFromSearch(`${lenderName} auto loan rates`, {
    lenderName,
    interactive: true,
  });
}

async function handleOptionSearch(currentName) {
  const searchTerm = await promptInput(
    `Lender name to search with Brave (plain text, no flags) [${currentName}]`,
    currentName
  );
  const cleaned = normalizeInteractiveValue(searchTerm, "lender", "PenFed");
  const resolvedName = cleaned || currentName;
  const pageInfo = await fetchPageInfoFromSearch(
    `${resolvedName} auto loan rates`,
    { lenderName: resolvedName, interactive: true }
  );
  return { pageInfo, lenderName: resolvedName };
}

async function handleOptionClipboard() {
  const info = getClipboardPageInfo();
  if (!info) {
    console.warn("[add] Clipboard did not contain HTML.");
    return null;
  }
  return info;
}

async function handleOptionFile() {
  const filePath = await promptInput(
    "Enter path to HTML file (relative like output/paste.html or absolute)",
    FILE_FLAG || ""
  );
  const cleaned = normalizeInteractiveValue(
    filePath,
    "file",
    "output/paste.html"
  );
  if (!cleaned.trim()) {
    console.warn("[add] File path is required.");
    return null;
  }
  return await loadHtmlFromFilePath(cleaned, { label: "HTML file" });
}

async function runAddModeInteractive(initialLenderName = null) {
  console.log("\n[add] Guided lender discovery\n");
  console.log(
    "When prompted, respond with plain text values (no leading -- flags). Example: type PenFed, not --lender PenFed."
  );
  let baseLenderName = normalizeInteractiveValue(
    initialLenderName ?? LENDER_FLAG ?? LONG_FLAG ?? SHORT_FLAG ?? "",
    "lender",
    "PenFed"
  );
  while (!baseLenderName) {
    const entered = await promptInput("Lender name", "");
    baseLenderName = normalizeInteractiveValue(entered, "lender", "PenFed");
    if (!baseLenderName) {
      console.warn("[add] Please enter a lender name such as PenFed.");
    }
  }

  while (true) {
    let currentLenderName = baseLenderName;
    let pageInfo = null;
    while (!pageInfo) {
      console.log("\nSelect data source:");
      console.log(
        "  1. Use a known rate page URL (paste the full https:// URL)."
      );
      console.log(
        "     - Press Enter at the URL prompt to run Brave search using the lender name."
      );
      console.log(
        "  2. Run Brave search manually (you can change the lender name first)."
      );
      console.log(
        "  3. Use HTML from clipboard (ensure the table markup is copied now)."
      );
      console.log("  4. Load HTML from file (e.g., output/paste.html).");

      const choice = (await promptInput("Choice [1-4]", "1")).trim();
      if (choice === "1") {
        pageInfo = await handleOptionUseUrl(currentLenderName);
      } else if (choice === "2") {
        const result = await handleOptionSearch(currentLenderName);
        if (result.pageInfo) {
          pageInfo = result.pageInfo;
          currentLenderName = result.lenderName;
          baseLenderName = currentLenderName;
        }
      } else if (choice === "3") {
        pageInfo = await handleOptionClipboard();
      } else if (choice === "4") {
        pageInfo = await handleOptionFile();
      } else {
        console.warn("[add] Invalid selection.");
        continue;
      }

      if (!pageInfo) {
        console.warn(
          "[add] Unable to load rates from that option. Please choose again."
        );
      }
    }

    const success = await finalizeAddFlow({
      lenderName: currentLenderName,
      pageInfo,
      interactive: true,
    });
    if (success) break;
    console.warn(
      "[add] Supabase error encountered. Returning to top-level options."
    );
  }
  return true;
}

async function handleAddMode() {
  let previousAutoLender = null;
  while (true) {
    console.log(
      "\n[add] Select workflow:\n" +
        "  1. Automatic mode (no prompts). Provide inputs via CLI flags such as:\n" +
        '       --lender "PenFed"  --url https://penfed.org/auto   --file output/paste.html\n' +
        "     You can combine flags (url/file/clipboard) as needed; omit prompts entirely.\n" +
        "  2. Guided mode (prompts). Answer using plain text (no leading -- flags)."
    );
    const guidedDefault = NO_PROMPTS_FLAG ? "1" : "2";
    let interactive = false;
    if (NO_PROMPTS_FLAG) {
      interactive = false;
    } else {
      while (true) {
        const modeChoice = await promptInput(
          "Enable guided prompts? (1 = No, run automatically, 2 = Yes, guide me)",
          guidedDefault
        );
        const trimmed = modeChoice.trim();
        if (trimmed === "1") {
          interactive = false;
          break;
        }
        if (trimmed === "2") {
          interactive = true;
          break;
        }
        console.warn("[add] Please choose 1 or 2.");
      }
    }

    if (interactive) {
      const ok = await runAddModeInteractive(previousAutoLender);
      if (ok) return;
      continue;
    }

    const autoResult = await runAddModeAuto();
    if (autoResult.success) return;

    previousAutoLender = autoResult.lenderName || previousAutoLender;
    const reason = autoResult.reason || "unknown";
    if (reason === "missing_lender") {
      console.warn(
        "[add] Automatic mode could not start because no lender name was provided."
      );
      console.warn(
        '     Provide --lender "Name" next time, or choose guided mode to enter it now.'
      );
    } else if (reason === "invalid_url") {
      console.warn(
        "[add] The --url value was not a valid http(s) URL. Guided mode will help you pick one."
      );
    } else if (reason === "missing_source") {
      console.warn(
        "[add] Unable to discover a rate page automatically with the supplied inputs."
      );
    } else if (reason === "supabase_failed") {
      console.warn(
        "[add] Supabase reported an error. After addressing it, you can retry."
      );
    } else {
      console.warn("[add] Automatic mode could not complete.");
    }

    console.warn(
      "[add] Switching to guided prompts to help complete the flow."
    );
    const ok = await runAddModeInteractive(previousAutoLender);
    if (ok) return;
  }
}

// -------- paste-from-HTML helpers (global scope) --------
async function readAllStdin() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let buf = "";
  for await (const line of rl) buf += line + "\n";
  return buf;
}

function parseTermGeneric(text) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/[–—]/g, "-");
  let m = s.match(/up\s*to\s*(\d{1,3})\s*(?:mo|mos|month|months)\b/);
  if (m) return { min: 0, max: Number(m[1]) };
  m = s.match(/(\d{1,3})\s*-\s*(\d{1,3})\s*(?:mo|mos|month|months)\b/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  m = s.match(/(\d{1,3})\s*(?:mo|mos|month|months)\b/);
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  m = s.match(/(\d{1,2})\s*year/);
  if (m) {
    const n = Number(m[1]) * 12;
    return { min: n, max: n };
  }
  m = s.match(/(\d{1,3})/);
  if (m) {
    const n = Number(m[1]);
    return { min: n, max: n };
  }
  return { min: null, max: null };
}

function vehicleConditionFromAccount(text) {
  const s = String(text || "").toLowerCase();
  if (/\bnew\b/.test(s) || /brand\s*new/.test(s) || /factory\s+fresh/.test(s)) {
    return "new";
  }
  if (
    /\bused\b/.test(s) ||
    /pre[-\s]?owned/.test(s) ||
    /previously\s+owned/.test(s) ||
    /older\s+vehicle/.test(s)
  ) {
    return "used";
  }
  const years = Array.from(s.matchAll(/\b(20\d{2})\b/g)).map((m) =>
    Number(m[1])
  );
  if (years.length) {
    const nowYear = new Date().getFullYear();
    const maxYear = Math.max(...years);
    if (maxYear >= nowYear) return "new";
    return "used";
  }
  if (/less\s+than\s*5000\s*miles/.test(s)) return "new";
  if (/more\s+than\s*5000\s*miles/.test(s)) return "used";
  return "new_or_used";
}

function expandTableCells(cells) {
  const expanded = [];
  for (const cell of cells) {
    const span = Number(cell.getAttribute("colspan") || "1") || 1;
    const text = normalizedText(cell);
    for (let i = 0; i < span; i += 1) {
      expanded.push({ text, node: cell });
    }
  }
  return expanded;
}

function collectTableHeaders(table) {
  let headerRows = Array.from(table.querySelectorAll("thead tr"));
  if (!headerRows.length) {
    headerRows = Array.from(table.querySelectorAll("tr")).slice(0, 2);
  }
  const columnHeaders = [];
  for (const row of headerRows) {
    const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
    const expanded = expandTableCells(cells);
    let idx = 0;
    for (const cell of expanded) {
      const text = cell.text.trim();
      if (!columnHeaders[idx]) {
        columnHeaders[idx] = text;
      } else if (text) {
        columnHeaders[idx] = `${columnHeaders[idx]} ${text}`.trim();
      }
      idx += 1;
    }
  }
  return columnHeaders;
}

function parseTermHeader(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { termMin: null, termMax: null };
  let { min, max } = parseTermGeneric(cleaned);
  if (min == null && max == null) {
    const digits = cleaned.match(/\d{1,3}/g);
    if (digits) {
      if (digits.length >= 2) {
        min = Number(digits[0]);
        max = Number(digits[1]);
      } else if (digits.length === 1) {
        min = max = Number(digits[0]);
      }
    }
  }
  if (min != null && max == null) max = min;
  if (max != null && min == null) min = max;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { termMin: null, termMax: null };
  }
  return { termMin: min, termMax: max };
}

function deriveRowLabel(expandedCells, firstTermIndex) {
  const searchLimit =
    Number.isFinite(firstTermIndex) && firstTermIndex >= 0
      ? firstTermIndex
      : expandedCells.length;
  const candidateIndexes = [
    ...Array.from({ length: searchLimit }, (_, i) => i),
    ...expandedCells.map((_, i) => i),
  ];
  for (const idx of candidateIndexes) {
    const entry = expandedCells[idx];
    if (!entry) continue;
    const text = entry.text.trim();
    if (!text) continue;
    if (/%/.test(text)) continue;
    if (!/[A-Za-z]/.test(text)) continue;
    if (/apply\s+now/i.test(text)) continue;
    return text;
  }
  return "";
}

function extractAprFromText(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value / 100;
  }
  const aprMatch = cleaned.match(/(-?\d+(?:\.\d+)?)\s*apr/i);
  if (aprMatch) {
    const value = Number(aprMatch[1]);
    if (Number.isFinite(value)) return value / 100;
  }
  return null;
}

function deduceVehicleConditionFromLabel(label, cellText) {
  const combined = `${label} ${cellText || ""}`.toLowerCase();
  const inferred = vehicleConditionFromAccount(combined);
  if (inferred !== "new_or_used") return inferred;
  if (/lease/.test(combined)) return "new";
  return inferred;
}

function extractRatesFromTable(table) {
  const headers = collectTableHeaders(table);
  if (!headers.length) return [];
  const termColumns = headers
    .map((header, index) => {
      const { termMin, termMax } = parseTermHeader(header);
      if (termMin == null || termMax == null) return null;
      return { index, termMin, termMax, header };
    })
    .filter(Boolean);
  if (!termColumns.length) return [];

  const headerRowCount = table.querySelectorAll("thead tr").length || 0;
  const bodyRows = table.querySelectorAll("tbody tr");
  const allRows = bodyRows.length
    ? Array.from(bodyRows)
    : Array.from(table.querySelectorAll("tr")).slice(headerRowCount);
  const results = [];
  const seen = new Set();

  for (const row of allRows) {
    const cellNodes = Array.from(
      row.querySelectorAll(":scope > th, :scope > td")
    );
    if (!cellNodes.length) continue;
    const expanded = expandTableCells(cellNodes);
    if (!expanded.length) continue;

    const firstTermIndex = termColumns.length
      ? Math.min(...termColumns.map((c) => c.index))
      : expanded.length;
    const label = deriveRowLabel(expanded, firstTermIndex);
    if (!label) continue;

    for (const column of termColumns) {
      const entry = expanded[column.index];
      if (!entry) continue;
      const apr = extractAprFromText(entry.text);
      if (apr == null) continue;
      const condition = deduceVehicleConditionFromLabel(label, entry.text);
      const key = `${label}|${column.termMin}|${column.termMax}|${condition}|${apr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        termMin: column.termMin,
        termMax: column.termMax,
        apr,
        vehicle_condition: condition,
        program_label: label,
      });
    }
  }

  if (results.length) return results;
  return extractRowMajorRates(table, headers);
}

function extractRowMajorRates(table, headers) {
  const rows = Array.from(table.querySelectorAll("tbody tr")).filter((tr) =>
    tr.querySelector("td,th")
  );
  if (!rows.length) return [];

  const termHeaderPattern = /(payment\s*period|term|months?|length|loan\s*term)/i;
  let termIndex = headers.findIndex((h) => termHeaderPattern.test(h));
  let aprIndex = headers.findIndex((h) => /\bapr\b|rate/i.test(h));

  const expandedRows = rows.map((row) =>
    expandTableCells(Array.from(row.querySelectorAll(":scope > th, :scope > td")))
  );

  if (termIndex === -1) {
    for (const cells of expandedRows) {
      termIndex = cells.findIndex((cell) => {
        if (!cell) return false;
        const { min, max } = parseTermGeneric(cell.text);
        return min != null && max != null;
      });
      if (termIndex !== -1) break;
    }
  }

  if (aprIndex === -1) {
    for (const cells of expandedRows) {
      aprIndex = cells.findIndex((cell) => cell && extractAprFromText(cell.text) != null);
      if (aprIndex !== -1) break;
    }
  }

  if (termIndex === -1 || aprIndex === -1) return [];

  const captionNode = table.querySelector("caption");
  const headingNode =
    captionNode?.querySelector("h1,h2,h3,h4,h5,h6") ||
    captionNode ||
    findPreviousHeading(table);
  const baseLabel =
    (headingNode ? normalizedText(headingNode) : "") ||
    (headers[aprIndex] || headers[termIndex] || "Auto Loan Rates");
  const programLabel = baseLabel.replace(/effective date:.*/i, "").trim() || "Auto Loan Rates";

  const results = [];
  const seen = new Set();

  for (const cells of expandedRows) {
    const termCell = cells[termIndex];
    const aprCell = cells[aprIndex];
    if (!termCell || !aprCell) continue;

    const { min, max } = parseTermGeneric(termCell.text);
    if (min == null || max == null) continue;
    const apr = extractAprFromText(aprCell.text);
    if (apr == null) continue;

    const condition = deduceVehicleConditionFromLabel(programLabel, `${termCell.text} ${aprCell.text}`);
    const key = `${min}|${max}|${apr}|${condition}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      termMin: min,
      termMax: max,
      apr,
      vehicle_condition: condition,
      program_label: programLabel,
    });
  }

  return results;
}

function findPreviousHeading(node) {
  let walker = node.previousElementSibling;
  while (walker) {
    if (/^H[1-6]$/i.test(walker.tagName)) return walker;
    walker = walker.previousElementSibling;
  }
  return null;
}

function legacyParseAutoRatesFromDocument(document) {
  const items = [];
  let inAuto = false;

  document.querySelectorAll("tr").forEach((tr) => {
    const className = tr.getAttribute("class") || "";
    const isSubheader =
      tr.querySelectorAll("td.tablesubheader").length > 0 ||
      /tablesubheader/.test(className);

    if (isSubheader) {
      const subTxt = normalizedText(tr);
      if (/auto\s+loans/i.test(subTxt)) {
        inAuto = true;
        return;
      }
      if (/(boat|motorcycle|rv|personal|share|cd)/i.test(subTxt)) {
        inAuto = false;
        return;
      }
    }

    if (!inAuto) return;

    const cells = tr.querySelectorAll("td");
    if (cells.length < 3) return;

    const accountTxt = extractCellText(cells[0]);
    const termTxt = extractCellText(cells[1]);
    const aprTxt = extractCellText(cells[2]);

    if (!/%/.test(aprTxt) || !termTxt) return;

    const { min, max } = parseTermGeneric(termTxt);
    const apr = toPct(aprTxt);
    if (min == null || max == null || apr == null) return;

    const condition = vehicleConditionFromAccount(accountTxt);
    items.push({
      termMin: min,
      termMax: max,
      apr,
      vehicle_condition: condition,
      program_label: accountTxt,
    });
  });

  return items;
}

function parseAutoRatesFromHTML(html) {
  const document = parseDocument(html);
  const items = [];
  const seen = new Set();

  document.querySelectorAll("table").forEach((table) => {
    const tableItems = extractRatesFromTable(table);
    for (const item of tableItems) {
      const key = `${item.termMin}|${item.termMax}|${item.vehicle_condition}|${item.apr}|${item.program_label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  });

  if (items.length) return items;
  return legacyParseAutoRatesFromDocument(document);
}

function buildDBRowsFromItems(
  items,
  { provider, effective, sourceUrl, loanTypes }
) {
  const rows = [];
  const seen = new Set();
  for (const it of items) {
    const termLabel =
      it.termMin === it.termMax
        ? `${it.termMin} Months`
        : `${it.termMin}-${it.termMax} Months`;
    const condSet = /new_or_used/.test(it.vehicle_condition)
      ? ["new", "used"]
      : [it.vehicle_condition];
    for (const cond of condSet) {
      const condKey = cond.replace(/\s+/g, "_").toUpperCase();
      const programLabel = it.program_label || cond;
      const programToken = normalizeToken(programLabel, {
        stripCommon: false,
      });
      const tierSuffix = programToken ? `${condKey}_${programToken}` : condKey;
      const creditTier = `ALL_${tierSuffix.toUpperCase()}`;
      const creditTierLabel = `All Scores (${programLabel})`;
      const creditScoreMin = it.credit_score_min ?? 0;
      const creditScoreMax = it.credit_score_max ?? 850;

      for (const loan_type of loanTypes) {
        const conflictKey = [
          provider,
          loan_type,
          it.termMin,
          it.termMax,
          creditTier,
          creditScoreMin,
          creditScoreMax,
        ].join("|");
        if (seen.has(conflictKey)) continue;
        seen.add(conflictKey);
        rows.push({
          source: provider,
          source_url: sourceUrl,
          effective_at: effective,
          loan_type,
          vehicle_condition: cond,
          term_months_min: it.termMin,
          term_months_max: it.termMax,
          term_range_min: it.termMin,
          term_range_max: it.termMax,
          term_label: termLabel,
          credit_score_min: creditScoreMin,
          credit_score_max: creditScoreMax,
          credit_tier: creditTier,
          credit_tier_label: creditTierLabel,
          base_apr_percent: Number((it.apr * 100).toFixed(4)),
          apr_adjustment: 0,
          apr_percent: Number((it.apr * 100).toFixed(4)),
        });
      }
    }
  }
  return rows;
}

async function handlePasteHtmlMode() {
  const raw = IN_FILE
    ? await fs.readFile(IN_FILE, "utf8")
    : await readAllStdin();
  const items = parseAutoRatesFromHTML(raw);
  if (!items.length) {
    console.error("[error] No auto-loan rows found in pasted HTML.");
    process.exit(1);
  }

  const loanTypes = PURCHASE_ONLY
    ? ["purchase"]
    : REFI_ONLY
    ? ["refinance"]
    : ["purchase", "refinance"];
  const effective = EFFECTIVE_FLAG || todayISO();
  const provider = (PROVIDER_FLAG || "paste").toLowerCase();
  const shortName = (SHORT_FLAG || provider.toUpperCase()).toUpperCase();
  const longName = LONG_FLAG || shortName;

  const dbRows = buildDBRowsFromItems(items, {
    provider,
    effective,
    sourceUrl: SOURCE_URL_FLAG || null,
    loanTypes,
  });

  await fs.mkdir(OUTDIR, { recursive: true });
  const outFile = path.join(
    OUTDIR,
    `rates-${todayISO()}-${provider}-pasted.html.json`
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    headers: { source_short_name: "short name", source_long_name: "long name" },
    providers: [
      {
        provider,
        shortName,
        longName,
        sourceUrl: SOURCE_URL_FLAG || null,
        effectiveDate: effective,
        loanType: null,
        matrix: items,
      },
    ],
    rows: dbRows,
    rows_enriched: dbRows.map((r) => ({
      ...r,
      source_short_name: shortName,
      source_long_name: longName,
    })),
  };
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `[ok] Parsed ${items.length} item(s) → ${dbRows.length} row(s); wrote ${outFile}`
  );

  if (UPSERT_FLAG) {
    const sb = getClient();
    if (!sb) {
      console.error(
        "❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; cannot upsert."
      );
      process.exit(1);
    }
    await deleteOldRows(sb, [provider]);
    await insertRows(sb, dbRows);
    console.log(
      `[ok] Upserted ${dbRows.length} row(s) to Supabase for provider '${provider}'.`
    );
  }
}

// -------- fetch utility (static vs rendered with Playwright) --------
async function fetchPage(url, { selector = null, timeout = 15000 } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    console.error(
      "❌ Playwright not installed. Run:\n  npm i -D playwright\n  npx playwright install"
    );
    throw e;
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      userAgent: DEFAULT_FETCH_HEADERS["User-Agent"],
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    // Try to settle network; ignore if not supported by the site
    try {
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(timeout, 10000),
      });
    } catch {}
    if (selector) {
      await page.waitForSelector(selector, { timeout });
    }
    const html = await page.content();
    return { html, rendered: true };
  } finally {
    await browser.close();
  }
}

// ---------- providers ----------
async function fetchSCCU() {
  const url = "https://www.sccu.com/personal/consumer-rates";
  let htmlObj = await fetchPage(url, { selector: "table" });
  const html = htmlObj.html;
  const document = parseDocument(html);

  function parseBlock(headingRegex, loanType) {
    const headings = Array.from(document.querySelectorAll("h2, h3"));
    const section = headings.find((el) =>
      headingRegex.test(normalizedText(el))
    );
    if (!section) return { rows: [], effectiveDateISO: null };

    const table = section.closest("table");

    let effectiveDateISO = null;
    let walker = section.nextElementSibling;
    while (walker) {
      const text = normalizedText(walker);
      if (/Effective Date:/i.test(text)) {
        const m = text.match(
          /Effective Date:\s*([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
        );
        if (m) {
          const d = new Date(m[1]);
          if (!Number.isNaN(d)) {
            effectiveDateISO = d.toISOString().slice(0, 10);
            break;
          }
        }
      }
      if (walker.tagName === "TABLE") break;
      walker = walker.nextElementSibling;
    }

    const rows = [];
    if (table) {
      table.querySelectorAll("tr").forEach((tr) => {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 2) return;
        const termTxt = normalizedText(cells[0]);
        const aprTxt = normalizedText(cells[1]);
        if (/Months/i.test(termTxt) && /%/.test(aprTxt)) {
          const term = Number(termTxt.match(/([0-9]+)/)?.[1]);
          const apr = toPct(aprTxt);
          if (Number.isFinite(term) && apr != null) {
            rows.push({ termMonths: term, apr, loan_type: loanType });
          }
        }
      });
    }

    if (!rows.length) {
      const scope = table ?? section.parentElement;
      if (scope) {
        scope.querySelectorAll("*").forEach((el) => {
          const txt = normalizedText(el);
          if (!txt) return;
          if (!/Months/i.test(txt)) return;
          const mTerm = txt.match(/Up to\s*([0-9]+)\s*Months/i);
          const mApr = txt.match(/([0-9]+(?:\.[0-9]+)?)%/);
          if (mTerm && mApr) {
            rows.push({
              termMonths: Number(mTerm[1]),
              apr: Number(mApr[1]) / 100,
              loan_type: loanType,
            });
          }
        });
      }
    }

    return { rows, effectiveDateISO };
  }

  let purchase = parseBlock(/Auto Loan Purchase Interest Rates/i, "purchase");
  let refinance = parseBlock(
    /Auto Loan Refinance Interest Rates/i,
    "refinance"
  );

  if (!purchase.rows.length && !refinance.rows.length) {
    if (/ShieldSquare|SSJSInternal|__uzdbm_/i.test(html)) {
      console.warn(
        "[warn] SCCU responded with anti-bot page; using markdown mirror"
      );
      const fallback = await fetchSCCUMarkdown();
      purchase = fallback.purchase;
      refinance = fallback.refinance;
    }
  }

  if (!purchase.rows.length && !refinance.rows.length)
    throw new Error("SCCU rows not parsed");

  const effectiveDate =
    refinance.effectiveDateISO || purchase.effectiveDateISO || todayISO();
  const matrix = [...purchase.rows, ...refinance.rows].sort(
    (a, b) =>
      a.termMonths - b.termMonths || a.loan_type.localeCompare(b.loan_type)
  );

  return {
    provider: "sccu",
    shortName: PROVIDER_NAMES.sccu.short,
    longName: PROVIDER_NAMES.sccu.long,
    sourceUrl: url,
    effectiveDate,
    loanType: null,
    matrix,
  };
}

async function fetchSCCUMarkdown() {
  const mirrorUrl =
    "https://r.jina.ai/http://www.sccu.com/personal/consumer-rates";
  const res = await fetch(mirrorUrl, { headers: DEFAULT_FETCH_HEADERS });
  if (!res.ok) throw new Error(`SCCU mirror fetch failed: ${res.status}`);
  const markdown = await res.text();
  const lines = markdown.split(/\r?\n/);

  function parseMarkdownBlock(headingRegex, loanType) {
    const idx = lines.findIndex((line) => headingRegex.test(line));
    if (idx === -1) return { rows: [], effectiveDateISO: null };

    let effectiveDateISO = null;
    for (let i = idx + 1; i < lines.length; i += 1) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const m = line.match(
        /Effective Date:\s*([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
      );
      if (m) {
        const d = new Date(m[1]);
        if (!Number.isNaN(d)) effectiveDateISO = d.toISOString().slice(0, 10);
        break;
      }
      if (line.startsWith("|")) break;
      if (line.startsWith("[")) break;
    }

    const rows = [];
    let dividerSeen = false;
    for (let i = idx + 1; i < lines.length; i += 1) {
      const raw = lines[i];
      if (!raw) {
        if (dividerSeen) break;
        continue;
      }
      const trimmed = raw.trim();
      if (!trimmed.startsWith("|")) {
        if (dividerSeen) break;
        continue;
      }
      if (/^\|\s*-{3,}/.test(trimmed)) {
        dividerSeen = true;
        continue;
      }
      if (!dividerSeen) continue; // skip header row

      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .slice(1, -1);
      if (cells.length < 2) continue;
      const termTxt = cells[0] || "";
      const aprTxt = cells[1] || "";
      if (/Months/i.test(termTxt) && /%/.test(aprTxt)) {
        const term = Number(termTxt.match(/([0-9]+)/)?.[1]);
        const apr = toPct(aprTxt);
        if (Number.isFinite(term) && apr != null) {
          rows.push({ termMonths: term, apr, loan_type: loanType });
        }
      }
    }

    return { rows, effectiveDateISO };
  }

  const purchase = parseMarkdownBlock(
    /Auto Loan Purchase Interest Rates/i,
    "purchase"
  );
  const refinance = parseMarkdownBlock(
    /Auto Loan Refinance Interest Rates/i,
    "refinance"
  );

  return { purchase, refinance };
}

async function fetchNFCU() {
  // Primary page with the consolidated "Today's Auto Purchase and Refinance Loan Rates" table
  const url = "https://www.navyfederal.org/loans-cards/auto-loans.html";
  const { html } = await fetchPage(url, { selector: "table" });
  const document = parseDocument(html);

  const heading = Array.from(document.querySelectorAll("h2, h3")).find((el) =>
    /today\'?s\s+auto\s+purchase\s+and\s+refinance\s+loan\s+rates/i.test(
      normalizedText(el)
    )
  );
  if (!heading) throw new Error("NFCU rates heading not found");

  let effectiveDateTxt = "";
  let walker = heading.nextElementSibling;
  while (walker) {
    const txt = normalizedText(walker);
    if (/Rates as of/i.test(txt)) {
      effectiveDateTxt = txt;
      break;
    }
    if (walker.tagName === "TABLE") break;
    walker = walker.nextElementSibling;
  }
  let effectiveDateISO = null;
  if (effectiveDateTxt) {
    const m = effectiveDateTxt.match(
      /Rates\s+as\s+of\s+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
    );
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d)) effectiveDateISO = d.toISOString().slice(0, 10);
    }
  }

  let table = heading.nextElementSibling;
  while (table && table.tagName !== "TABLE") {
    table = table.nextElementSibling;
  }
  if (!table) throw new Error("NFCU rates table not found");

  const headers = [];
  table.querySelectorAll("thead th, thead td").forEach((th) => {
    headers.push(normalizedText(th));
  });

  const termHeaders = headers.slice(1);

  function parseTermHeaderNFCU(txt) {
    const s = txt.replace(/\s+/g, " ").toLowerCase();
    // Up to 36 mos.
    let m = s.match(/up\s*to\s*(\d{1,3})/);
    if (m) return { termMin: 0, termMax: Number(m[1]) };
    // 37-60 mos.
    m = s.match(/(\d{1,3})\s*[–-]\s*(\d{1,3})/);
    if (m) return { termMin: Number(m[1]), termMax: Number(m[2]) };
    // 85-96 or single number fallback
    m = s.match(/(\d{1,3})/);
    if (m) {
      const n = Number(m[1]);
      return { termMin: n, termMax: n };
    }
    return null;
  }

  const buckets = termHeaders.map(parseTermHeaderNFCU).filter(Boolean);
  if (!buckets.length) throw new Error("NFCU term headers not parsed");

  // Parse body rows for New Vehicle / Used Vehicle APRs
  const matrix = [];
  table.querySelectorAll("tbody tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("th, td"));
    if (!cells.length) return;
    const rowLabel = normalizedText(cells[0]);
    const vehicle_condition = /new/i.test(rowLabel)
      ? "new"
      : /used/i.test(rowLabel)
      ? "used"
      : null;
    if (!vehicle_condition) return;

    // For each bucket column, read APR value in the same order as buckets
    cells.slice(1).forEach((td, i) => {
      const txt = normalizedText(td);
      if (!txt || /n\/?a/i.test(txt)) return; // skip N/A
      const apr = toPct(txt); // convert "4.29%" -> 0.0429
      const b = buckets[i];
      if (apr != null && b) {
        matrix.push({
          termMin: b.termMin,
          termMax: b.termMax,
          apr,
          vehicle_condition,
        });
      }
    });
  });

  if (!matrix.length) throw new Error("NFCU matrix empty");

  // Duplicate matrix for both loan types; NFCU page headline states "Purchase and Refinance" for this table
  const both = [];
  for (const m of matrix) {
    both.push({ ...m, loan_type: "purchase" });
    both.push({ ...m, loan_type: "refinance" });
  }

  return {
    provider: "nfcu",
    shortName: PROVIDER_NAMES.nfcu.short,
    longName: PROVIDER_NAMES.nfcu.long,
    sourceUrl: url,
    effectiveDate: effectiveDateISO || todayISO(),
    loanType: null, // items carry their own loan_type
    matrix: both.sort(
      (a, b) =>
        a.termMin - b.termMin ||
        a.termMax - b.termMax ||
        a.loan_type.localeCompare(b.loan_type)
    ),
  };
}

async function fetchNGFCU() {
  // NGFCU publishes distinct New/Used Auto rate tables under /rates/loans/auto
  const url = "https://www.ngfcu.us/rates/loans/auto";
  const { html } = await fetchPage(url, { selector: "table" });
  const document = parseDocument(html);

  // Heuristic: scan tables near headings that contain "Auto" and infer new/used from nearby text
  const matrix = [];
  document.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
    const headingTxt = normalizedText(heading);
    if (!/auto/i.test(headingTxt)) return;
    const isNew = /new/i.test(headingTxt);
    const isUsed = /used/i.test(headingTxt);

    let table = heading.nextElementSibling;
    while (table && table.tagName !== "TABLE") {
      table = table.nextElementSibling;
    }
    if (!table) return;

    table.querySelectorAll("tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 2) return;
      const termTxt = normalizedText(cells[0]);
      const aprTxt = normalizedText(cells[1]);
      if (!/%/.test(aprTxt)) return;
      // Expect patterns like "3 Years", "4 Years", ..., convert to months
      const y = termTxt.match(/(\d{1,2})\s*year/i);
      const m = termTxt.match(/(\d{1,3})\s*month/i);
      let months = null;
      if (y) months = Number(y[1]) * 12;
      else if (m) months = Number(m[1]);
      if (!months) return;
      const apr = toPct(aprTxt);
      if (apr == null) return;

      const vehicle_condition = isNew ? "new" : isUsed ? "used" : "new_or_used";
      matrix.push({ termMonths: months, apr, vehicle_condition });
    });
  });

  if (!matrix.length) {
    // Fallback: parse any table rows with "Years" and a % on the page (two blocks for new/used are common)
    document.querySelectorAll("table tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 2) return;
      const termTxt = normalizedText(cells[0]);
      const aprTxt = normalizedText(cells[1]);
      if (!/%/.test(aprTxt)) return;
      const y = termTxt.match(/(\d{1,2})\s*year/i);
      const m = termTxt.match(/(\d{1,3})\s*month/i);
      const months = y ? Number(y[1]) * 12 : m ? Number(m[1]) : null;
      if (!months) return;
      const apr = toPct(aprTxt);
      if (apr == null) return;
      matrix.push({
        termMonths: months,
        apr,
        vehicle_condition: "new_or_used",
      });
    });
  }

  if (!matrix.length) throw new Error("NGFCU matrix empty");

  // NGFCU refinance copy states refinance uses the same low fixed rates; duplicate as refinance.
  const both = [];
  for (const row of matrix) {
    both.push({ ...row, loan_type: "purchase" });
    both.push({ ...row, loan_type: "refinance" });
  }

  return {
    provider: "ngfcu",
    shortName: PROVIDER_NAMES.ngfcu.short,
    longName: PROVIDER_NAMES.ngfcu.long,
    sourceUrl: url,
    effectiveDate: todayISO(), // NGFCU page typically omits an explicit date; use generation date
    loanType: null,
    matrix: both.sort(
      (a, b) =>
        a.termMonths - b.termMonths || a.loan_type.localeCompare(b.loan_type)
    ),
  };
}

async function fetchCCUFL() {
  // CCU Florida consolidated Loan Rates page with an Effective date
  const url = "https://www.ccuflorida.org/home/rates/loan";
  const { html } = await fetchPage(url, {
    selector:
      RENDER_SELECTOR ||
      "#rates_loan td.tablecontent1, #rates_loan td.tablecontent2",
    timeout: RENDER_TIMEOUT,
  });
  const document = parseDocument(html);

  let effectiveDateISO = null;
  const effectiveNode = Array.from(document.querySelectorAll("*")).find((el) =>
    /Effective\s+[A-Za-z]{3,}\s+\d{1,2},\s+\d{4}/i.test(normalizedText(el))
  );
  if (effectiveNode) {
    const match = normalizedText(effectiveNode).match(
      /Effective\s+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i
    );
    if (match) {
      const d = new Date(match[1]);
      if (!Number.isNaN(d)) effectiveDateISO = d.toISOString().slice(0, 10);
    }
  }

  const matrix = [];
  const table = document.querySelector("#rates_loan");
  if (table) {
    let inAutoSection = false;
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      if (!cells.length) return;
      const firstCell = cells[0];
      if (firstCell.classList.contains("tablesubheader")) {
        const headerTxt = extractCellText(firstCell);
        inAutoSection = /auto/i.test(headerTxt);
        return;
      }
      if (!inAutoSection) return;
      if (cells.length < 3) return;
      const accountTxt = extractCellText(cells[0]);
      const termTxt = extractCellText(cells[1]);
      const aprTxt = extractCellText(cells[2]);
      if (!termTxt || !aprTxt || !/%/.test(aprTxt)) return;

      let months = null;
      const mUp = termTxt.match(/up\s*to\s*(\d{1,3})\s*month/i);
      const mMo = termTxt.match(/(\d{1,3})\s*month/i);
      if (mUp) months = Number(mUp[1]);
      else if (mMo) months = Number(mMo[1]);
      if (!months) return;

      const apr = toPct(aprTxt);
      if (apr == null) return;
      const vehicle_condition = /202[45]|2023/.test(accountTxt)
        ? "new"
        : /201[4-9]|2020|2021|2022/.test(accountTxt)
        ? "used"
        : /less than 5000/i.test(accountTxt)
        ? "new"
        : /more than 5000|up to 12 years|up to 10 years/i.test(accountTxt)
        ? "used"
        : "new_or_used";
      const baseRow = {
        termMonths: months,
        apr,
        vehicle_condition,
      };
      matrix.push({ ...baseRow, loan_type: "purchase" });
      matrix.push({ ...baseRow, loan_type: "refinance" });
    });
  }

  if (!matrix.length) throw new Error("CCUFL auto table not parsed");

  return {
    provider: "ccufl",
    shortName: PROVIDER_NAMES.ccufl.short,
    longName: PROVIDER_NAMES.ccufl.long,
    sourceUrl: url,
    effectiveDate: effectiveDateISO || todayISO(),
    loanType: null,
    matrix: matrix.sort(
      (a, b) =>
        a.termMonths - b.termMonths || a.loan_type.localeCompare(b.loan_type)
    ),
  };
}

// ---------- expansion & shape ----------
function expandToRows(provider) {
  const {
    provider: source,
    effectiveDate,
    loanType,
    matrix,
    sourceUrl,
  } = provider;
  const rows = [];
  const seen = new Set();
  for (const item of matrix) {
    const termMin =
      "termMin" in item
        ? item.termMin
        : "termMonths" in item
        ? item.termMonths
        : null;
    const termMax =
      "termMax" in item
        ? item.termMax
        : "termMonths" in item
        ? item.termMonths
        : null;
    if (termMin == null || termMax == null)
      throw new Error("term range missing in provider matrix");
    const vehicleConditionRaw = (
      item.vehicle_condition ||
      provider.vehicle_condition ||
      "new"
    )
      .toString()
      .toLowerCase();
    const conditionSet = [];
    if (/new_or_used|any|either/.test(vehicleConditionRaw)) {
      conditionSet.push("new", "used");
    } else if (/used|older|pre[-\s]?owned/.test(vehicleConditionRaw)) {
      conditionSet.push("used");
    } else {
      conditionSet.push("new");
    }
    const apr = item.apr;
    const termLabel = (() => {
      const explicit =
        item.termLabel ||
        item.term_label ||
        provider.termLabel ||
        provider.term_label;
      if (typeof explicit === "string" && explicit.trim())
        return explicit.trim();
      if (termMin === termMax) return `${termMin} Months`;
      if (Number.isFinite(termMin) && Number.isFinite(termMax))
        return `${termMin}-${termMax} Months`;
      return `${termMin ?? "?"}-${termMax ?? "?"} Months`;
    })();
    const creditScoreMin =
      item.credit_score_min ??
      item.creditScoreMin ??
      provider.credit_score_min ??
      provider.creditScoreMin ??
      0;
    const creditScoreMax =
      item.credit_score_max ??
      item.creditScoreMax ??
      provider.credit_score_max ??
      provider.creditScoreMax ??
      850;
    for (const condition of conditionSet) {
      const creditTierBase = item.credit_tier || provider.credit_tier || "ALL";
      const creditTier =
        creditTierBase === "ALL"
          ? `${creditTierBase}_${condition}_${termMin}_${termMax}_${Math.round(
              (apr ?? 0) * 10000
            )}`
          : creditTierBase;
      const creditTierLabel =
        item.credit_tier_label ||
        provider.credit_tier_label ||
        (creditTierBase !== "ALL"
          ? String(creditTierBase)
          : `All Scores (${condition})`);
      const key = `${condition}|${termMin}|${termMax}|${apr}|${creditTier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const loanTypeRaw = item.loan_type || loanType || "purchase";
      rows.push({
        source,
        source_url: sourceUrl,
        effective_at: effectiveDate,
        loan_type: loanTypeRaw,
        vehicle_condition: condition,
        term_months_min: termMin,
        term_months_max: termMax,
        term_range_min: termMin,
        term_range_max: termMax,
        term_label: termLabel,
        credit_score_min: creditScoreMin,
        credit_score_max: creditScoreMax,
        credit_tier: creditTier,
        credit_tier_label: creditTierLabel,
        base_apr_percent: (apr ?? 0) * 100,
        apr_adjustment: 0,
        apr_percent: (apr ?? 0) * 100,
      });
    }
  }
  return rows;
}

// ---------- supabase ----------
function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[warn] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; running in print-only mode"
    );
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      fetch: (...args) => fetch(...args),
    },
  });
}

async function deleteOldRows(sb, providers) {
  try {
    const { data, error } = await sb
      .from(TABLE)
      .delete()
      .in("source", providers)
      .select("source");
    if (error) throw error;
    const removed = (data || []).map((row) => row.source);
    return removed;
  } catch (err) {
    console.error("[error] deleteOldRows failed:", err);
    console.error(
      "[error] Full error:",
      JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
    );
    throw err;
  }
}

async function insertRows(sb, rows) {
  const { error } = await sb.from(TABLE).upsert(rows, {
    onConflict:
      "source,loan_type,term_range_min,term_range_max,credit_tier,credit_score_min,credit_score_max",
    ignoreDuplicates: false,
    returning: "minimal",
  });
  if (error) throw error;
}

async function maybeWriteFailureReport({ failedProviders, skippedProviders }) {
  const priority = {
    failed: 2,
    skipped: 1,
  };
  const reasonLabels = {
    failed: "Fetch failure",
    skipped: "No parsed rate rows",
  };
  const register = new Map();
  const upsert = (provider, type) => {
    const current = register.get(provider);
    if (!current || priority[type] > current.priority) {
      register.set(provider, { type, priority: priority[type] });
    }
  };
  for (const provider of failedProviders || []) {
    upsert(provider, "failed");
  }
  for (const provider of skippedProviders || []) {
    upsert(provider, "skipped");
  }
  const entries = Array.from(register.entries()).sort((a, b) => {
    if (b[1].priority !== a[1].priority) {
      return b[1].priority - a[1].priority;
    }
    return a[0].localeCompare(b[0]);
  });
  if (!entries.length) return;

  console.log("[info] Providers requiring attention:");
  for (const [provider, { type }] of entries) {
    console.log(`  - ${formatProviderLabel(provider)} :: ${reasonLabels[type]}`);
  }

  const defaultName = `failed-lenders-${todayISO()}.txt`;
  let filename = defaultName;
  if (!NO_PROMPTS_FLAG) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `[prompt] Enter filename for failed lender report in /output (default ${defaultName}, type 'skip' to abort): `
      );
      const trimmed = answer.trim();
      if (trimmed.toLowerCase() === "skip") {
        console.log("[info] Skipped creating failed lender report.");
        return;
      }
      if (trimmed) {
        filename = trimmed.toLowerCase().endsWith(".txt")
          ? trimmed
          : `${trimmed}.txt`;
      }
    } finally {
      rl.close();
    }
  } else {
    console.log(
      `[info] No-prompts mode active; saving failed lender report as ${defaultName}.`
    );
  }

  const lines = [
    `Generated: ${new Date().toISOString()}`,
    "",
    "Providers needing attention:",
  ];
  for (const [provider, { type }] of entries) {
    lines.push(`- ${formatProviderLabel(provider)} :: ${reasonLabels[type]}`);
  }
  await fs.mkdir(OUTDIR, { recursive: true });
  const filePath = path.join(OUTDIR, filename);
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
  console.log(`[ok] Saved failed lender report to ${filePath}`);
}

// ---------- main ----------
// ---------- main ----------
(async function main() {
  if (ADD_MODE) {
    await handleAddMode();
    return;
  }
  if (PASTE_HTML) {
    await handlePasteHtmlMode();
    return;
  }
  if (REMOVE_RAW) {
    await handleRemoval(REMOVE_RAW);
    return;
  }

  const todo = ONLY ? [ONLY] : PROVIDERS;
  const results = [];
  const failedProviders = [];
  const skippedProviders = [];
  if (!todo.length) {
    console.warn("[warn] No providers scheduled for fetching.");
  } else {
    console.log(
      `[info] Preparing to fetch rates for ${todo.length} provider(s).`
    );
  }
  for (const [index, p] of todo.entries()) {
    const fetcher = PROVIDER_FETCHERS[p];
    if (!fetcher) {
      console.warn(
        `[warn] No fetcher registered for ${formatProviderLabel(p)}; skipping provider.`
      );
      skippedProviders.push(p);
      continue;
    }
    const label = formatProviderLabel(p);
    console.log(
      `[info] (${index + 1}/${todo.length}) Fetching rates for ${label}...`
    );
    try {
      const result = await fetcher();
      if (result && Array.isArray(result.matrix) && result.matrix.length) {
        results.push(result);
        console.log(
          `[ok] Retrieved ${result.matrix.length} rate rows for ${label}.`
        );
      } else if (result) {
        results.push(result);
        skippedProviders.push(p);
        console.warn(
          `[warn] ${label} returned no rate rows; marking for follow-up.`
        );
      } else {
        skippedProviders.push(p);
        console.warn(
          `[warn] ${label} returned no data; marking for investigation.`
        );
      }
    } catch (err) {
      console.error(`[error] ${p} fetch failed:`, err);
      failedProviders.push(p);
    }
  }

  const allRows = results.flatMap(expandToRows);

  // Build an enriched view for the JSON artifact that includes short/long provider names
  const nameByProvider = Object.fromEntries(
    results.map((r) => [r.provider, { short: r.shortName, long: r.longName }])
  );
  const rowsEnriched = allRows.map((r) => ({
    ...r,
    source_short_name:
      nameByProvider[r.source]?.short ?? r.source.toUpperCase(),
    source_long_name: nameByProvider[r.source]?.long ?? r.source,
  }));
  // Simple headers descriptor for consumers of the JSON file
  const HEADERS = {
    source_short_name: "short name",
    source_long_name: "long name",
  };

  await fs.mkdir(OUTDIR, { recursive: true });
  const outFile = path.join(
    OUTDIR,
    `rates-${todayISO()}${ONLY ? "-" + ONLY : ""}.json`
  );
  await fs.writeFile(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        headers: HEADERS,
        providers: results, // each provider now carries shortName/longName
        rows: allRows, // DB-compatible shape (no extra fields)
        rows_enriched: rowsEnriched, // human-friendly rows with names
      },
      null,
      2
    ),
    "utf8"
  );
  if (PRINT_JSON || DRY) {
    console.log(outFile);
    console.log(JSON.stringify(rowsEnriched, null, 2));
  }

  const unresolved = [
    ...failedProviders.map((p) => ({ type: "failed", provider: p })),
    ...skippedProviders.map((p) => ({ type: "skipped", provider: p })),
  ];
  if (unresolved.length) {
    const label = (p) => PROVIDER_NAMES[p]?.long ?? p;
    const failed = unresolved
      .filter((item) => item.type === "failed")
      .map((item) => label(item.provider));
    const skipped = unresolved
      .filter((item) => item.type === "skipped")
      .map((item) => label(item.provider));
    if (failed.length) {
      console.warn(
        `[warn] The following providers failed and need parser updates: ${failed.join(
          ", "
        )}`
      );
    }
    if (skipped.length) {
      console.warn(
        `[warn] No rows generated for: ${skipped.join(
          ", "
        )}. Investigate their markup.`
      );
    }
  }

  await maybeWriteFailureReport({
    failedProviders,
    skippedProviders,
  });

  // Determine which providers actually succeeded to avoid deleting good data on a failed scrape
  const fetchedProviders = results.map((r) => r.provider);

  if (!DRY && !PRINT_JSON) {
    const sb = getClient();
    if (!sb) {
      console.warn("[warn] Supabase env not set; skipped push");
      } else {
        const providersToDelete = Array.from(new Set(fetchedProviders));
        if (providersToDelete.length) {
          await deleteOldRows(sb, providersToDelete);
        }
      if (fetchedProviders.length) {
        await insertRows(sb, allRows);
        console.log(
          `[ok] upserted ${allRows.length} rows for: ${fetchedProviders.join(
            ", "
          )}`
        );
      } else if (!providersToDelete.length) {
        console.warn("[warn] no providers fetched; nothing deleted/inserted");
      }
    }
  } else {
    console.log(`[dry] wrote JSON to ${outFile} (${allRows.length} rows).`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
