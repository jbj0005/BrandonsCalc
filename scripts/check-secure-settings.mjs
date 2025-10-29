#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { hydrateEnv } from "./utils/env.mjs";

await hydrateEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkSecureSettings() {
  console.log("Checking secure_settings table...\n");

  const { data, error } = await supabase
    .from("secure_settings")
    .select("name, updated_at");

  if (error) {
    console.error("Error querying secure_settings:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("❌ No entries found in secure_settings table");
    return;
  }

  console.log(`✓ Found ${data.length} entries:\n`);
  data.forEach(row => {
    console.log(`  - ${row.name} (updated: ${row.updated_at})`);
  });

  // Check specifically for marketcheck_api_key
  const marketcheck = data.find(row => row.name === "marketcheck_api_key");
  if (marketcheck) {
    console.log("\n✓ marketcheck_api_key is present");
  } else {
    console.log("\n❌ marketcheck_api_key is NOT present");
  }
}

checkSecureSettings();
