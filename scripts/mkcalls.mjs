#!/usr/bin/env node
/**
 * mkcalls - MarketCheck usage snapshot
 *
 * Makes a lightweight MarketCheck request and reports current limit/remaining,
 * plus a daily budget until the monthly reset.
 */

import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envFile = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return;
  const text = fs.readFileSync(envFile, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const API_KEY =
  process.env.MARKETCHECK_API_KEY ||
  process.env.MARKETCHECK_KEY ||
  process.env.MARKETCHECK_API_TOKEN ||
  '';

const BASE_RAW =
  (process.env.MARKETCHECK_BASE || 'https://api.marketcheck.com/v2').replace(/\/$/, '');
const BASE = BASE_RAW.endsWith('/') ? BASE_RAW : `${BASE_RAW}/`;

if (!API_KEY) {
  console.error('Missing MARKETCHECK_API_KEY (or MARKETCHECK_KEY/MARKETCHECK_API_TOKEN).');
  process.exit(1);
}

/**
 * Pick the first header value among common rate-limit header names.
 */
function pickHeader(headers, names) {
  for (const name of names) {
    const v = headers.get(name);
    if (v != null) return v;
  }
  return null;
}

function startOfNextMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 1, 0, 0, 0, 0);
}

function diffInDays(from, to) {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

async function fetchSample() {
  // Small, cacheable call that returns rate-limit headers
  const vin = process.env.MK_VIN_SAMPLE || '1GT40LEL3SU409207';
  const url = new URL('search/car/active', BASE);
  url.searchParams.set('vin', vin);
  url.searchParams.set('rows', '1');
  url.searchParams.set('start', '0');
  url.searchParams.set('api_key', API_KEY);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const text = await res.text(); // read body to allow connection reuse
  if (!res.ok) {
    throw new Error(`MarketCheck responded ${res.status} ${res.statusText}: ${text.slice(0, 200)}...`);
  }
  return res;
}

function fmt(num) {
  return Number.isFinite(num) ? num.toLocaleString() : '—';
}

async function main() {
  const res = await fetchSample();
  const headers = res.headers;

  const limit = Number(
    pickHeader(headers, ['rate-limit-limit', 'x-rate-limit-limit', 'ratelimit-limit'])
  );
  const remaining = Number(
    pickHeader(headers, ['rate-limit-remaining', 'x-rate-limit-remaining', 'ratelimit-remaining'])
  );
  const resetSeconds = Number(
    pickHeader(headers, ['rate-limit-reset', 'x-rate-limit-reset', 'ratelimit-reset'])
  );

  const now = new Date();
  const nextMonth = startOfNextMonth(now);
  const daysToReset = resetSeconds
    ? Math.max(1, Math.ceil(resetSeconds / 86400))
    : diffInDays(now, nextMonth);
  const perDay = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining / daysToReset)) : null;

  console.log('\nMarketCheck Usage Snapshot');
  console.log('──────────────────────────');
  console.log(`Base URL       : ${BASE}`);
  console.log(`Limit          : ${fmt(limit)}`);
  console.log(`Remaining      : ${fmt(remaining)}`);
  console.log(`Days to reset  : ${fmt(daysToReset)} (est)`);
  console.log(`Budget / day   : ${fmt(perDay)} calls`);
  if (resetSeconds) {
    const resetDate = new Date(now.getTime() + resetSeconds * 1000);
    console.log(`Provider reset : ${resetDate.toISOString()}`);
  } else {
    console.log(`Provider reset : unknown (using calendar month estimate)`);
  }
  console.log('\nTip: set MK_VIN_SAMPLE to change the probe VIN.');
}

main().catch((err) => {
  console.error('Failed to fetch MarketCheck usage:', err.message || err);
  process.exit(1);
});
