#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { hydrateEnv } from "./utils/env.mjs";
import fs from "fs/promises";

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

async function runMigration() {
  console.log("Running migration: add condition column...\n");
  console.log("Note: You'll need to run this SQL in the Supabase dashboard SQL editor:");
  console.log("\nSQL:\n");
  console.log("alter table vehicles add column if not exists condition text;");
  console.log("\n");
  console.log("Go to: https://supabase.com/dashboard/project/txndueuqljeujlccngbj/sql/new");
  console.log("\nAfter running the SQL, press Enter to verify...");

  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Verify the column was added
  const { data: testData, error: testError } = await supabase
    .from("vehicles")
    .select("condition")
    .limit(1);

  if (testError) {
    console.error("❌ Error verifying column:", testError);
    console.log("\nPlease run the SQL manually in the Supabase dashboard.");
  } else {
    console.log("✓ Verified 'condition' column exists");
  }
}

runMigration();
