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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "public" },
  auth: { persistSession: false }
});

const today = new Date().toISOString().split('T')[0];

// Launch Credit Union rates
// Source: https://www.launchcu.com/rates/ (verified 2025-10-30)
const LAUNCH_RATES = [
  {
    source: "LAUNCH",
    loan_type: "purchase",
    vehicle_condition: "new",
    term_range_min: 36,
    term_range_max: 84,
    term_label: "36-84 months",
    credit_score_min: 300,
    credit_score_max: 850,
    base_apr_percent: 5.25,
    apr_percent: 5.25,
    apr_adjustment: 0,
    credit_tier: "ALL_new_36_84_525",
    credit_tier_label: "All Scores (new)",
    effective_at: today
  },
  {
    source: "LAUNCH",
    loan_type: "purchase",
    vehicle_condition: "used",
    term_range_min: 36,
    term_range_max: 84,
    term_label: "36-84 months",
    credit_score_min: 300,
    credit_score_max: 850,
    base_apr_percent: 5.50,
    apr_percent: 5.50,
    apr_adjustment: 0,
    credit_tier: "ALL_used_36_84_550",
    credit_tier_label: "All Scores (used)",
    effective_at: today
  }
];

async function insertLaunchRates() {
  console.log("🚀 Inserting Launch Credit Union rates...\n");

  // First, delete any existing Launch CU rates to avoid duplicates
  const { error: deleteError } = await supabase
    .from("auto_rates")
    .delete()
    .eq("source", "LAUNCH");

  if (deleteError) {
    console.error("❌ Error deleting existing rates:", deleteError.message);
    process.exit(1);
  }

  console.log("✅ Deleted existing Launch CU rates (if any)");

  // Insert new rates
  const { data, error: insertError } = await supabase
    .from("auto_rates")
    .insert(LAUNCH_RATES)
    .select();

  if (insertError) {
    console.error("❌ Error inserting rates:", insertError.message);
    process.exit(1);
  }

  console.log(`✅ Inserted ${data.length} rate records for Launch Credit Union`);
  console.log("\nRates inserted:");
  data.forEach(rate => {
    console.log(`   - ${rate.vehicle_condition} vehicle: ${rate.base_apr_percent}% APR (${rate.term_label})`);
  });

  console.log("\n🎉 Launch Credit Union rates are now available in the calculator!");
  console.log("📝 Refresh your browser to see the new rates.");
}

insertLaunchRates();
