/**
 * Headless smoke check for Google Places autocomplete in the UI.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000/BrandonsCalc/ node scripts/autocomplete-smoke.js
 *
 * Make sure your app is running (npm run dev) and VITE_GOOGLE_MAPS_API_KEY is set.
 */
import { chromium } from 'playwright';

const BASE_URL =
  process.env.BASE_URL || 'http://localhost:3000/BrandonsCalc/';
const INPUT_SELECTOR =
  'input[placeholder="Enter your address or ZIP code..."], input[placeholder="Enter dealer or customer location..."]';

const SAMPLE_QUERY = process.env.AC_QUERY || 'Miami, FL';

try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Log console errors for quick diagnosis
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      console.log(`[console ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log('[pageerror]', err.message);
  });

  console.log(`Navigating to ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  console.log('Waiting for location input...');
  await page.waitForSelector(INPUT_SELECTOR, { timeout: 15000 });

  console.log(`Typing sample query: "${SAMPLE_QUERY}"`);
  await page.fill(INPUT_SELECTOR, SAMPLE_QUERY);

  // Give Places some time to respond/render suggestions
  await page.waitForTimeout(2500);

  const result = await page.evaluate(() => {
    const customList = Array.from(
      document.querySelectorAll('[data-testid="autocomplete-option"]')
    ).map((el) => (el.textContent || '').trim());
    const legacyPac = Array.from(
      document.querySelectorAll('.pac-container .pac-item')
    )
      .map((el) => el.textContent?.trim())
      .filter(Boolean);

    return {
      customSuggestionCount: customList.length,
      customSuggestions: customList.slice(0, 10),
      legacyPacItems: legacyPac,
    };
  });

  const routing = await page.evaluate(async () => {
    if (!window.google?.maps?.DirectionsService) {
      return { ok: false, reason: 'DirectionsService missing' };
    }
    return await new Promise((resolve) => {
      const svc = new google.maps.DirectionsService();
      svc.route(
        {
          origin: { lat: 25.7617, lng: -80.1918 },
          destination: { lat: 28.5383, lng: -81.3792 },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          resolve({
            ok: status === 'OK',
            status,
            hasRoute: !!result?.routes?.length,
          });
        }
      );
    });
  });

  console.log('Autocomplete probe:', JSON.stringify(result, null, 2));
  console.log('Routing probe:', JSON.stringify(routing, null, 2));

  await browser.close();
} catch (err) {
  console.error('Smoke check failed:', err);
  process.exit(1);
}
