#!/usr/bin/env node
import process from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";

import { hydrateEnv } from "./utils/env.mjs";
import { ensureSupabaseCredentials, createSupabaseAdminClient } from "./utils/supabase.mjs";

const SOURCE_NAME = "NFCU";
const SOURCE_URL = "https://www.navyfederal.org/loans-cards/auto-loans.html";
const DISCOVERY_START_URLS = [
  SOURCE_URL,
  "https://www.navyfederal.org/loans-cards/vehicle-loans.html",
  "https://www.navyfederal.org/loans-cards/auto-loans/index.html",
  "https://www.navyfederal.org/loans-cards/"
];
const NAVY_ROOT = "https://www.navyfederal.org";
const MAX_DISCOVERY_PAGES = 12;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const MIN_CREDIT_SCORE = 300;
const MAX_CREDIT_SCORE = 850;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const creditTierPath = path.resolve(__dirname, "../config/credit-tiers.json");

await hydrateEnv({ rootDir: PROJECT_ROOT });

let supabaseAdmin = null;

async function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const credentials = await ensureSupabaseCredentials({ projectRoot: PROJECT_ROOT });
  supabaseAdmin = createSupabaseAdminClient(createClient, credentials);
  return supabaseAdmin;
}

async function askYesNo(rl, prompt, defaultValue = true, prefix = "[nfcu]") {
  const suffix = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = (await rl.question(`${prefix} ${prompt} (${suffix}): `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.warn(`${prefix} Please respond with y or n.`);
  }
}

async function promptForConfig() {
  if (process.argv.length > 2) {
    console.warn(
      "[nfcu] Command-line flags are no longer needed; interactive prompts will guide the run."
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.info("[nfcu] Preparing to fetch and process NFCU rate data.");
    const dryRun = await askYesNo(rl, "Preview only (skip Supabase updates)?", false);
    const push = dryRun ? false : await askYesNo(rl, "Push rates to Supabase when complete?", true);
    const printJson = await askYesNo(rl, "Print full rate payload as JSON?", false);
    return { dryRun, push, printJson };
  } finally {
    rl.close();
  }
}

async function loadCreditTiers() {
  const raw = await readFile(creditTierPath, "utf8");
  const tiers = JSON.parse(raw);
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error("credit-tiers.json is empty or malformed");
  }
  return tiers.map((tier) => {
    const min = Number(tier?.minScore);
    const max = Number(tier?.maxScore);
    const adj = Number(tier?.aprAdjustment ?? 0);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error(`Invalid credit tier bounds for ${tier?.id ?? "unknown"}`);
    }
    if (min < MIN_CREDIT_SCORE || max > MAX_CREDIT_SCORE || min > max) {
      throw new Error(`Credit tier bounds out of range for ${tier?.id}`);
    }
    return {
      id: String(tier?.id ?? "tier"),
      label: String(tier?.label ?? tier?.id ?? ""),
      minScore: Math.round(min),
      maxScore: Math.round(max),
      aprAdjustment: Number.isFinite(adj) ? Number(adj) : 0,
    };
  });
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseTermHeader(headerText) {
  const text = headerText.replace(/APR.*$/i, "").trim();
  const upToMatch = text.match(/Up to\s*(\d+)/i);
  if (upToMatch) {
    const max = Number(upToMatch[1]);
    return {
      label: headerText.trim(),
      min: 0,
      max,
    };
  }
  const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return {
      label: headerText.trim(),
      min,
      max,
    };
  }
  return null;
}

function parseAprCell(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/n\/?a/i.test(trimmed)) return null;
  const cleaned = trimmed.replace(/[^0-9.]+/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function parseEffectiveDate(timestampText) {
  if (!timestampText) return null;
  const match = timestampText.match(/Rates as of\s+([^.]*)/i);
  if (!match) return null;
  let raw = match[1].trim();
  raw = raw.replace(/ET.?$/i, "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function extractBaseRates(html) {
  const $ = load(html);
  const table = $("div.rates-table table.table-resp").first();
  if (!table.length) {
    throw new Error("Unable to locate NFCU rate table in source HTML");
  }

  const headers = table
    .find("thead th")
    .toArray()
    .map((th) => $(th).text().trim());
  const termHeaders = headers.slice(1).map(parseTermHeader);

  const baseRates = [];
  table.find("tbody tr").each((_, tr) => {
    const row = $(tr);
    const loanTypeLabel = row.find("th[scope='row']").first().text().trim();
    const loanType = loanTypeLabel.toLowerCase().includes("used") ? "used" : "new";

    row
      .find("td")
      .toArray()
      .forEach((td, index) => {
        const range = termHeaders[index];
        if (!range) return;
        const value = parseAprCell($(td).text());
        if (value == null) return;
        baseRates.push({
          loanType,
          termLabel: range.label,
          termMin: range.min,
          termMax: range.max,
          baseApr: value,
        });
      });
  });

  const timestampText = table.find("tfoot .rates-table__timestamp").first().text().trim();
  const effectiveDate = parseEffectiveDate(timestampText);

  if (!effectiveDate) {
    console.warn("[nfcu] Effective date not found; inserting without date stamp");
  }

  if (baseRates.length === 0) {
    throw new Error("No base rates detected in NFCU table");
  }

  return { baseRates, effectiveDate };
}

function expandRates({ baseRates, effectiveDate }, creditTiers, sourceUrl = SOURCE_URL) {
  const rows = [];
  baseRates.forEach((rate) => {
    creditTiers.forEach((tier) => {
      rows.push({
        source: SOURCE_NAME,
        source_url: sourceUrl,
        loan_type: rate.loanType,
        term_label: rate.termLabel,
        term_range_min: rate.termMin,
        term_range_max: rate.termMax,
        credit_tier: tier.id,
        credit_tier_label: tier.label,
        credit_score_min: tier.minScore,
        credit_score_max: tier.maxScore,
        base_apr_percent: rate.baseApr,
        apr_adjustment: tier.aprAdjustment,
        apr_percent: Number((rate.baseApr + tier.aprAdjustment).toFixed(2)),
        effective_at: effectiveDate,
      });
    });
  });
  return rows;
}

async function upsertRates(rows, effectiveDate, { dryRun = false } = {}) {
  if (dryRun) {
    console.log(`-- dry run -- would upsert ${rows.length} rows (effective ${effectiveDate ?? "n/a"})`);
    return;
  }
  const supabase = await getSupabaseAdmin();
  console.info(`[nfcu] Removing existing rows for source=${SOURCE_NAME}`);
  const { error: deleteError } = await supabase
    .from("auto_rates")
    .delete()
    .eq("source", SOURCE_NAME);
  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await supabase.from("auto_rates").insert(rows);

  if (insertError) {
    throw insertError;
  }
  console.log(`[nfcu] Inserted ${rows.length} rate rows.`);
}

function isInternalAutoRatesLink(href, textContent) {
  if (!href) return false;
  const normalizedText = (textContent ?? "").toLowerCase();
  const normalizedHref = href.toLowerCase();
  const hasAuto = normalizedText.includes("auto") || normalizedHref.includes("auto");
  const hasRate = normalizedText.includes("rate") || normalizedHref.includes("rate");
  const hasLoan = normalizedText.includes("loan") || normalizedHref.includes("loan");
  if (!(hasAuto && hasRate && hasLoan)) return false;
  try {
    const url = new URL(href, NAVY_ROOT);
    return url.origin === NAVY_ROOT;
  } catch (error) {
    return false;
  }
}

async function discoverRatePage() {
  console.warn(`[nfcu] Attempting discovery crawl because primary URL failed (${SOURCE_URL}).`);
  const queue = [...new Set(DISCOVERY_START_URLS)];
  const visited = new Set();

  while (queue.length && visited.size < MAX_DISCOVERY_PAGES) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);

    let html;
    try {
      html = await fetchHtml(candidate);
    } catch (error) {
      console.warn(`[nfcu] Discovery fetch failed for ${candidate}:`, error.message ?? error);
      continue;
    }

    try {
      const base = extractBaseRates(html);
      console.info(`[nfcu] Discovered rate table at ${candidate}`);
      return { url: candidate, base };
    } catch (error) {
      // Not a valid rate table; continue crawling.
    }

    const $ = load(html);
    $("a[href]")
      .toArray()
      .forEach((anchor) => {
        const el = $(anchor);
        const href = el.attr("href");
        const text = el.text();
        if (!isInternalAutoRatesLink(href, text)) return;
        try {
          const resolved = new URL(href, candidate).toString();
          if (!visited.has(resolved)) {
            queue.push(resolved);
          }
        } catch (error) {
          // Ignore malformed URLs.
        }
      });
  }

  throw new Error(
    "Unable to discover NFCU auto-loan rate page automatically. Please update SOURCE_URL manually."
  );
}

async function main() {
  try {
    const config = await promptForConfig();

    const creditTiers = await loadCreditTiers();

    let sourceUrl = SOURCE_URL;
    let base;
    try {
      const html = await fetchHtml(sourceUrl);
      base = extractBaseRates(html);
    } catch (primaryError) {
      console.warn(
        `[nfcu] Primary URL failed (${sourceUrl}): ${primaryError.message ?? primaryError}. Starting discovery.`
      );
      const discovery = await discoverRatePage();
      sourceUrl = discovery.url;
      base = discovery.base;
    }

    const rows = expandRates(base, creditTiers, sourceUrl);
    console.info(
      "[nfcu] Expansion complete",
      {
        baseRows: base.baseRates?.length ?? 0,
        expandedRows: rows.length,
        effectiveDate: base.effectiveDate ?? null,
        sourceUrl,
      }
    );

    if (config.printJson) {
      console.log(JSON.stringify(rows, null, 2));
    }

    const shouldUpsert = config.push && !config.dryRun;
    if (!shouldUpsert) {
      console.info(
        "[nfcu] Supabase update skipped",
        config.dryRun ? { reason: "dry-run" } : { reason: "user request" }
      );
    }

    await upsertRates(rows, base.effectiveDate, { dryRun: !shouldUpsert });
    console.info("[nfcu] Fetch process complete");
  } catch (error) {
    console.error("[nfcu] Failed to fetch or store rates", error);
    process.exitCode = 1;
  }
}

await main();
