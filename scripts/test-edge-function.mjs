#!/usr/bin/env node
import { hydrateEnv } from "./utils/env.mjs";

await hydrateEnv();

const SUPABASE_ANON_KEY = "sb_publishable_iq_fkrkjHODeoaBOa3vvEA_p9Y3Yz8X";
const testVin = "1C6SRFKP3TN178530"; // The VIN from your error log

const url = `https://txndueuqljeujlccngbj.functions.supabase.co/marketcheck/by-vin/${testVin}?radius=100&pick=nearest`;

console.log("Testing edge function...");
console.log("URL:", url);
console.log("");

try {
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    }
  });

  console.log("Status:", response.status, response.statusText);

  const data = await response.json();
  console.log("\nResponse:");
  console.log(JSON.stringify(data, null, 2));

} catch (error) {
  console.error("Error:", error.message);
}
