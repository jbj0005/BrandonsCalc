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

// Items to remove from dealer fees (now in customer add-ons)
const ITEMS_TO_REMOVE = [
  "Extended Warranty",
  "Tire Protection",
  "Gap Coverage"
];

async function cleanupDealerFees() {
  console.log("🧹 Cleaning up dealer fees...\n");
  console.log("Items to remove from dealer fees:");
  ITEMS_TO_REMOVE.forEach(item => console.log(`   - ${item}`));
  console.log("");

  // Fetch current dealer fee sets
  const { data: sets, error: fetchError } = await supabase
    .from("dealer_fee_sets")
    .select("*")
    .eq("active", true);

  if (fetchError) {
    console.error("❌ Error fetching dealer fee sets:", fetchError.message);
    process.exit(1);
  }

  if (!sets || sets.length === 0) {
    console.log("ℹ️  No active dealer fee sets found");
    return;
  }

  console.log(`📋 Found ${sets.length} active dealer fee set(s)\n`);

  for (const set of sets) {
    console.log(`Processing set: ${set.label} (ID: ${set.id})`);

    let items = Array.isArray(set.items) ? set.items : [];
    const originalCount = items.length;

    // Filter out the items that should be customer add-ons
    const filteredItems = items.filter(item => {
      const itemName = item?.name || "";
      return !ITEMS_TO_REMOVE.includes(itemName);
    });

    const removedCount = originalCount - filteredItems.length;

    if (removedCount > 0) {
      console.log(`   Removing ${removedCount} item(s)`);

      // Update the set with filtered items
      const { error: updateError } = await supabase
        .from("dealer_fee_sets")
        .update({
          items: filteredItems,
          updated_at: new Date().toISOString()
        })
        .eq("id", set.id);

      if (updateError) {
        console.error(`   ❌ Error updating set: ${updateError.message}`);
      } else {
        console.log(`   ✅ Updated successfully (${filteredItems.length} items remaining)`);
      }
    } else {
      console.log(`   ℹ️  No items to remove from this set`);
    }
  }

  console.log("\n🎉 Dealer fees cleanup completed!");
  console.log("\n💡 Next steps:");
  console.log("   1. Run 'npm run show:fees' to verify the changes");
  console.log("   2. Test the calculator to ensure customer add-ons work correctly");
}

cleanupDealerFees();
