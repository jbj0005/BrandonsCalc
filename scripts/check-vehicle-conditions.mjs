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

async function checkVehicleConditions() {
  console.log("Checking vehicle conditions...\n");

  const { data, error } = await supabase
    .from("vehicles")
    .select("id, vehicle, year, make, model, condition, asking_price")
    .order("inserted_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("❌ Error querying vehicles:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No vehicles found in database");
    return;
  }

  console.log(`Found ${data.length} vehicles:\n`);
  data.forEach((v, i) => {
    const label = [v.condition, v.year, v.make, v.model].filter(Boolean).join(" | ");
    const price = v.asking_price ? `$${v.asking_price.toLocaleString()}` : "No price";
    console.log(`${i + 1}. ${label || v.vehicle || "Unnamed"} | ${price}`);
    console.log(`   Condition: ${v.condition || "(null)"}`);
    console.log("");
  });

  const withoutCondition = data.filter(v => !v.condition).length;
  if (withoutCondition > 0) {
    console.log(`⚠️  ${withoutCondition} vehicle(s) have no condition set`);
    console.log("These will show as: Year | Make | Model | Price (no condition)");
  }
}

checkVehicleConditions();
