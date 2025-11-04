#!/usr/bin/env node
/**
 * Debug script to test Marketcheck search directly
 */

import { setMarketcheckApiBase, setMarketcheckAuthToken, mcSearch } from "./mc-client.mjs";
import { hydrateEnv } from "./scripts/utils/env.mjs";

await hydrateEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

setMarketcheckApiBase(`${SUPABASE_URL}/functions/v1/marketcheck-proxy`);
setMarketcheckAuthToken(SUPABASE_KEY);

console.log("🔍 Testing Marketcheck Search API\n");

try {
  console.log("Searching for: 2022 Honda Civic...\n");

  const result = await mcSearch({
    year: "2022",
    make: "Honda",
    model: "Civic",
    rows: 10,
  });

  console.log("✅ Search successful!");
  console.log(`Found: ${result.count} listings`);
  console.log(`Total available: ${result.total}`);
  console.log(`API Status: ${result.ok ? '✅ OK' : '❌ Failed'}\n`);

  if (result.listings && result.listings.length > 0) {
    console.log("First 3 listings:");
    result.listings.slice(0, 3).forEach((listing, idx) => {
      console.log(`\n${idx + 1}. ${listing.year} ${listing.make} ${listing.model} ${listing.trim || ''}`);
      console.log(`   Price: $${listing.price?.toLocaleString() || 'N/A'}`);
      console.log(`   Miles: ${listing.miles?.toLocaleString() || 'N/A'}`);
      console.log(`   Location: ${listing.dealer_city}, ${listing.dealer_state}`);
    });
  } else {
    console.log("⚠️ No listings in response");
  }

  console.log("\n\nRaw response structure:");
  console.log(JSON.stringify(result, null, 2));

} catch (error) {
  console.error("❌ Search failed:", error.message);
  console.error(error.stack);
}
