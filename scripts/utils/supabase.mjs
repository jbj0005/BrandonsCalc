import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { previewEntries, confirmSurtaxSummary } from "./supabase-schema.mjs";

function resolveFromEnv() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    null;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    null;
  return { url, key };
}

async function askQuestion(rl, prompt, { defaultValue = "" } = {}) {
  const hint = defaultValue ? ` (${defaultValue})` : "";
  const response = (await rl.question(`${prompt}${hint}: `)).trim();
  return response || defaultValue;
}

async function askRequired(rl, prompt, { defaultValue = "" } = {}) {
  while (true) {
    const value = await askQuestion(rl, prompt, { defaultValue });
    if (value) return value;
    console.warn("[supabase] A value is required. Please try again.");
  }
}

async function askYesNo(rl, prompt, defaultValue = true) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = (await rl.question(`${prompt} (${suffix}): `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.warn("[supabase] Please reply with y or n.");
  }
}

function formatEnvValue(value) {
  return JSON.stringify(value ?? "");
}

async function persistEnvValues(envPath, updates) {
  if (!updates || Object.keys(updates).length === 0) return;
  let existing = "";
  try {
    existing = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const keys = Object.keys(updates);

  const replaced = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    for (const key of keys) {
      const regex = new RegExp(`^(?:export\\s+)?${key}\\s*=`);
      if (regex.test(trimmed)) {
        seen.add(key);
        return `export ${key}=${formatEnvValue(updates[key])}`;
      }
    }
    return line;
  });

  const finalLines = [...replaced];
  keys.forEach((key) => {
    if (seen.has(key)) return;
    if (finalLines.length && finalLines[finalLines.length - 1] !== "") {
      finalLines.push("");
    }
    finalLines.push(`export ${key}=${formatEnvValue(updates[key])}`);
  });

  const output = finalLines
    .join("\n")
    .replace(/\n*$/, "\n");
  await fs.writeFile(envPath, output, "utf8");
}

async function promptForSupabaseCredentials(existing, projectRoot) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.info("[supabase] Supabase credentials are required to continue.");
    const defaultUrl = existing.url || "https://txndueuqljeujlccngbj.supabase.co";
    const url = await askRequired(rl, "Supabase project URL", { defaultValue: defaultUrl });
    const key = await askRequired(rl, "Supabase service role key");
    const save = await askYesNo(rl, "Save these credentials to .env for future runs?", true);
    if (save) {
      const envPath = path.resolve(projectRoot, ".env");
      await persistEnvValues(envPath, {
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: key,
      });
      console.info(
        `[supabase] Credentials saved to ${path.relative(projectRoot, envPath)}`
      );
    }
    return { url, key };
  } finally {
    rl.close();
  }
}

export async function ensureSupabaseCredentials({
  projectRoot = process.cwd(),
  interactive = true,
} = {}) {
  const existing = resolveFromEnv();
  if (existing.url && existing.key) {
    return existing;
  }
  if (!interactive) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to push data");
  }
  const credentials = await promptForSupabaseCredentials(existing, projectRoot);
  process.env.SUPABASE_URL = credentials.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = credentials.key;
  return credentials;
}

export async function confirmSupabasePush(entries, { requireConfirmation = true } = {}) {
  if (!entries || !entries.length) {
    console.warn("[supabase] No entries provided for preview.");
    return;
  }
  previewEntries(entries);
  confirmSurtaxSummary(entries);
  if (!requireConfirmation) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const proceed = await askYesNo(rl, "Continue and push these entries to Supabase?", true);
    if (!proceed) {
      throw new Error("Supabase push cancelled by user");
    }
  } finally {
    rl.close();
  }
}

export function createSupabaseAdminClient(createClient, { url, key }) {
  if (!url || !key) {
    throw new Error("Supabase admin client requires both URL and service-role key");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
    },
  });
}
