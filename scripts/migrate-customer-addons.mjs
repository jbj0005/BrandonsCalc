#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { hydrateEnv } from "./utils/env.mjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log("📋 Running customer add-ons migration...\n");

  // Read the migration file
  const migrationPath = path.join(__dirname, "../supabase/migrations/20251030_create_customer_addon_tables.sql");
  const sql = await fs.readFile(migrationPath, "utf-8");

  console.log("📄 Migration file loaded");
  console.log("⚠️  Note: Supabase JS client cannot execute DDL statements directly.");
  console.log("Please run this SQL in the Supabase dashboard SQL editor:\n");
  console.log("=" .repeat(80));
  console.log(sql);
  console.log("=" .repeat(80));
  console.log("\n🔗 Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new");
  console.log("\nAfter running the SQL, press Enter to verify the tables were created...");

  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Verify the table and view were created
  console.log("\n🔍 Verifying migration...");

  const { data: tableData, error: tableError } = await supabase
    .from("customer_addon_sets")
    .select("*")
    .limit(1);

  if (tableError) {
    console.error("❌ Error verifying customer_addon_sets table:", tableError.message);
    console.log("\nPlease ensure you ran the SQL migration in the Supabase dashboard.");
    process.exit(1);
  }

  const { data: viewData, error: viewError } = await supabase
    .from("customer_addon_items_v")
    .select("*")
    .limit(1);

  if (viewError) {
    console.error("❌ Error verifying customer_addon_items_v view:", viewError.message);
    console.log("\nPlease ensure you ran the SQL migration in the Supabase dashboard.");
    process.exit(1);
  }

  console.log("✅ Table 'customer_addon_sets' created successfully");
  console.log("✅ View 'customer_addon_items_v' created successfully");

  // Check if default data was inserted
  const { data: items, error: itemsError } = await supabase
    .from("customer_addon_items_v")
    .select("*");

  if (!itemsError && items && items.length > 0) {
    console.log(`✅ Loaded ${items.length} default customer add-on items:`);
    items.forEach(item => {
      console.log(`   - ${item.name}`);
    });
  }

  console.log("\n🎉 Customer add-ons migration completed successfully!");
}

runMigration();
