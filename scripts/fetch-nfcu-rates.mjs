#!/usr/bin/env node
import process from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";

const SOURCE_NAME = "NFCU";
const SOURCE_URL = "https://www.navyfederal.org/loans-cards/auto-loans.html";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const MIN_CREDIT_SCORE = 300;
const MAX_CREDIT_SCORE = 850;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const creditTierPath = path.resolve(__dirname, "../config/credit-tiers.json");

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

function expandRates({ baseRates, effectiveDate }, creditTiers) {
  const rows = [];
  baseRates.forEach((rate) => {
    creditTiers.forEach((tier) => {
      rows.push({
        source: SOURCE_NAME,
        source_url: SOURCE_URL,
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

function resolveSupabaseCredentials() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase credentials not provided. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return { url, key };
}

async function upsertRates(rows, effectiveDate, { dryRun = false } = {}) {
  if (dryRun) {
    console.log(`-- dry run -- would upsert ${rows.length} rows (effective ${effectiveDate ?? "n/a"})`);
    return;
  }
  const { url, key } = resolveSupabaseCredentials();
  const supabase = createClient(url, key);

  if (effectiveDate) {
    const { error: deleteError } = await supabase
      .from("auto_rates")
      .delete()
      .eq("source", SOURCE_NAME)
      .eq("effective_at", effectiveDate);
    if (deleteError && deleteError.code !== "PGRST204") {
      throw deleteError;
    }
  }

  const { data, error } = await supabase
    .from("auto_rates")
    .upsert(rows, {
      onConflict:
        "source,loan_type,term_range_min,term_range_max,credit_tier,credit_score_min,credit_score_max",
    })
    .select("id");

  if (error) {
    throw error;
  }
  console.log(`[nfcu] Upserted ${data?.length ?? rows.length} rate rows.`);
}

async function main() {
  try {
    const args = new Set(process.argv.slice(2));
    const dryRun = args.has("--dry-run");
    const printJson = args.has("--print-json");

    const [creditTiers, html] = await Promise.all([
      loadCreditTiers(),
      fetchHtml(SOURCE_URL),
    ]);

    const base = extractBaseRates(html);
    const rows = expandRates(base, creditTiers);

    if (printJson) {
      console.log(JSON.stringify(rows, null, 2));
    }

    await upsertRates(rows, base.effectiveDate, { dryRun });
  } catch (error) {
    console.error("[nfcu] Failed to fetch or store rates", error);
    process.exitCode = 1;
  }
}

await main();
