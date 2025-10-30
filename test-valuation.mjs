#!/usr/bin/env node
/**
 * Test script for trade-in valuation module
 * Usage: node test-valuation.mjs
 */

import { setMarketcheckApiBase, setMarketcheckAuthToken } from "./mc-client.mjs";
import { getTradeInValuation } from "./valuation.mjs";
import { hydrateEnv } from "./scripts/utils/env.mjs";

// Load environment variables
await hydrateEnv();

// Configure Marketcheck API
// Use local server for testing (make sure server is running on port 5174)
const LOCAL_SERVER = process.env.LOCAL_SERVER_URL || "http://localhost:5174";

// Set up API base (no auth token needed for local server)
setMarketcheckApiBase(`${LOCAL_SERVER}/api/mc`);

console.log("🔍 Trade-In Valuation Test\n");
console.log("=" .repeat(60));

// Test vehicle - 2022 Honda Civic
const testVehicle = {
  year: 2022,
  make: "Honda",
  model: "Civic",
  trim: "Sport",
  mileage: 35000,
  zip: "32801", // Orlando, FL
};

console.log("\n📋 Test Vehicle:");
console.log(`   Year: ${testVehicle.year}`);
console.log(`   Make: ${testVehicle.make}`);
console.log(`   Model: ${testVehicle.model}`);
console.log(`   Trim: ${testVehicle.trim}`);
console.log(`   Mileage: ${testVehicle.mileage.toLocaleString()} miles`);
console.log(`   Location: ${testVehicle.zip}`);
console.log("\n" + "=" .repeat(60));

try {
  console.log("\n🔎 Searching for comparable vehicles...\n");

  const valuation = await getTradeInValuation(testVehicle);

  if (!valuation.success) {
    console.error(`\n❌ Valuation failed: ${valuation.error}`);
    process.exit(1);
  }

  console.log("✅ Valuation Complete!\n");
  console.log("=" .repeat(60));
  console.log("\n💰 TRADE-IN VALUE ESTIMATE");
  console.log("=" .repeat(60));
  console.log(`\n   Estimated Trade-In: $${valuation.tradeInValue.toLocaleString()}`);
  console.log(`   Confidence: ${(valuation.confidence * 100).toFixed(0)}% (${valuation.confidenceLabel})`);

  console.log("\n\n📊 MARKET ANALYSIS");
  console.log("=" .repeat(60));
  console.log(`\n   Comparables Found: ${valuation.breakdown.comparablesCount}`);
  console.log(`   Median Retail Price: $${valuation.breakdown.medianRetailPrice.toLocaleString()}`);
  console.log(`   Mean Retail Price: $${valuation.breakdown.meanRetailPrice.toLocaleString()}`);
  console.log(`   Retail Price Range: $${valuation.breakdown.retailPriceRange.min.toLocaleString()} - $${valuation.breakdown.retailPriceRange.max.toLocaleString()}`);

  console.log("\n\n🧮 CALCULATION BREAKDOWN");
  console.log("=" .repeat(60));
  console.log(`\n   Median Retail Price: $${valuation.breakdown.medianRetailPrice.toLocaleString()}`);
  console.log(`   Trade-In Multiplier: ${(valuation.breakdown.tradeInMultiplier * 100).toFixed(0)}%`);
  console.log(`   Base Trade-In Value: $${valuation.breakdown.baseTradeInValue.toLocaleString()}`);
  console.log(`   Mileage Adjustment: ${valuation.breakdown.mileageAdjustment >= 0 ? '+' : ''}$${valuation.breakdown.mileageAdjustment.toLocaleString()}`);
  console.log(`   ─────────────────────────────`);
  console.log(`   Final Trade-In Value: $${valuation.tradeInValue.toLocaleString()}`);

  console.log("\n\n📍 SEARCH DETAILS");
  console.log("=" .repeat(60));
  console.log(`\n   Year Range: ${valuation.searchConfig.yearMin} - ${valuation.searchConfig.yearMax}`);
  if (valuation.searchConfig.mileageMin !== null) {
    console.log(`   Mileage Range: ${Math.round(valuation.searchConfig.mileageMin).toLocaleString()} - ${Math.round(valuation.searchConfig.mileageMax).toLocaleString()} miles`);
    console.log(`   Mileage Tolerance: ${valuation.searchConfig.mileageTolerance}`);
  }

  console.log("\n   Search Attempts:");
  valuation.searchAttempts.forEach((attempt, idx) => {
    const status = attempt.error ? `❌ ${attempt.error}` : `✅ ${attempt.filtered} usable`;
    console.log(`      ${idx + 1}. Radius: ${attempt.radius} mi → Found: ${attempt.found}, ${status}`);
  });

  console.log("\n\n📋 SAMPLE COMPARABLES (first 5)");
  console.log("=" .repeat(60));
  const sampleComparables = valuation.comparables.slice(0, 5);
  sampleComparables.forEach((comp, idx) => {
    const dist = comp.distance ? `${comp.distance} mi` : 'N/A';
    console.log(`\n   ${idx + 1}. ${comp.year} ${comp.make} ${comp.model} ${comp.trim || ''}`);
    console.log(`      Price: $${comp.price.toLocaleString()} | Miles: ${comp.miles.toLocaleString()} | Distance: ${dist}`);
    console.log(`      Dealer: ${comp.dealer || 'Unknown'} (${comp.city}, ${comp.state})`);
  });

  console.log("\n\n" + "=" .repeat(60));
  console.log("✅ Test completed successfully!");
  console.log("=" .repeat(60) + "\n");

} catch (error) {
  console.error(`\n❌ Error during valuation test: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
