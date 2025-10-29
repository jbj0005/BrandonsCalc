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

async function checkSchema() {
  // Get a sample row to see the schema
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Error querying vehicles:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No vehicles in table, checking with empty insert...");
    return;
  }

  const columns = Object.keys(data[0]);
  console.log("\nVehicles table columns:");
  columns.forEach(col => console.log(`  - ${col}`));

  const hasCondition = columns.includes("condition");
  console.log(`\n${hasCondition ? "✓" : "✗"} 'condition' column ${hasCondition ? "exists" : "does NOT exist"}`);
}

checkSchema();
