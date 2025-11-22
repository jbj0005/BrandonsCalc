# Brandon's Calculator

Brandon's Calculator is a dealership-ready finance calculator that surfaces real-time payment scenarios, lender APRs, and vehicle data so sales teams can structure deals without leaving the browser. The app runs as a Vite single-page experience backed by Supabase for rates and lender metadata, plus optional MarketCheck and Google integrations for inventory enrichment.

## v1.2.0 Highlights - Interactive Controls & Offer Management

### Interactive APR/Term Editing
- **APR Controls**: Arrow buttons to adjust APR by 0.01% increments with real-time payment updates
- **Term Controls**: Arrow buttons to adjust loan term by 6-month increments
- **Keyboard Support**: Use arrow keys when focused on APR or Term values
- **Real-Time Tooltips**: Hover over APR, Term, or Monthly Finance Charge to see payment impacts
- **Finance Charge Breakdown**: New "Monthly Finance Charge" TIL card shows interest portion per payment
- **Custom APR Warning**: Modal prompts user when reviewing with adjusted APR

### Smart Slider Tooltips
- **Specific Impact**: Each slider now shows its individual impact on monthly payment (not cumulative)
- **Buyer-Centric Colors**: Green for savings, red for increases
- **Real-Time Updates**: Payment deltas update as you drag sliders

### Offer Management System (Database Ready)
- **Customer Profiles**: Auto-populate contact info across the app using Supabase
- **Saved Offers**: Store complete calculation state for instant recall
- **Salesperson Contacts**: Auto-complete with usage tracking
- **Offer Submissions**: Track submissions via email, SMS, or native share
- **Status Tracking**: Manage offer lifecycle (draft, submitted, accepted, rejected)

See [OFFER_MANAGEMENT_SYSTEM.md](docs/OFFER_MANAGEMENT_SYSTEM.md) for complete database schema and API documentation.

### New Database Tables
- `customer_profiles` - Store customer contact info for auto-population
- `salesperson_contacts` - Track salesperson contacts with auto-complete
- `saved_offers` - Store complete offer state for recall and comparison
- `offer_submissions` - Track when offers are submitted to dealers

## v1.1.0 Highlights - Contract Summary & Enhanced UX
- **Contract Summary Modal**: New professional contract summary view (RouteOne format) with Federal Truth-in-Lending disclosures, itemization of amount financed, payment schedule, and cash due at signing.
- **Vehicle & Dealer Details**: Contract displays comprehensive vehicle information (condition, year, make, model, trim, mileage, VIN) and dealer information (name, address, phone).
- **Cash to Buyer Display**: When customers cash out equity, the contract clearly shows "Cash to Buyer at Signing" in green, separate from cash due.
- **Currency Formatting**: Fixed input formatting for sale price, trade offer, and trade payoff fields - values now properly format on blur/change events.
- **Trade Calculations**: Trade Difference and Net Trade Difference now only display when there's an actual trade offer, improving clarity for cash deals.
- **Print Support**: Contract summary includes print button with optimized print styles for physical documentation.

## v1.0.2 Highlights
- Update Vehicle modal now auto-fills `modalDealerName` with the Google Places dealer selection, keeping dealer details in sync with the rest of the address fields.
- Places autocomplete gracefully skips unsupported phone fields so address/city/state/zip population stays reliable without console noise.
- Dealer location state now tracks additional metadata (city/state/zip, vehicle label) to keep downstream cards aligned with modal edits.

## v1.0.1 Highlights
- Hardened Google Maps routing: gracefully fall back to Florida view when directions fail or only partial dealer info is available.
- Improved dealer geocoding: parse partial addresses, filter invalid coordinates, and avoid rendering `0,0` markers.
- Vehicle modal updates now reuse cached rows, preserve selection order, and refresh Supabase data inline.

## Project Structure
- `index.html` – Entry point, meta tags, and calculator layout.
- `app.js` – Core UI logic, Supabase queries, rate sourcing, payment calculations, and Google Maps integration.
- `rates/` – Provider engine logic and helpers for normalizing lender matrices.
- `scripts/` – Node utilities to import rates, taxes, fees, and reset calculators.
- `supabase/` – Database migrations, CLI metadata, and local Supabase tooling.
- `styles.css` – Global design system and responsive layout styling.

## Requirements
- Node.js ≥ 18 (for native fetch and ESM compatibility).
- Supabase project with `auto_rates` and `lenders` tables (managed via myLenders tool).
- Optional APIs:
  - MarketCheck (vehicle inventory enrichment).
  - Google Maps JavaScript + Map ID (dealership map embed).
  - Google Custom Search or Brave Search (lead enrichment, optional).

### Backend fallbacks (local/dev)
- `/api/lenders` falls back to `config/lenders.json` when Supabase creds aren’t set.
- `/api/rates` returns stub APR grids when Supabase has no `auto_rates` rows, so the UI keeps working while you wire up live data.

## Environment Configuration
The Vite client no longer requires local `.env` keys for MarketCheck or Google Maps. At runtime it calls the Express proxy (`/api/config`), which hydrates settings from Supabase.

1. Populate `server/.env` with your Supabase project credentials (see `server/.env.example`):
   ```bash
   SUPABASE_URL=<https://your-project.supabase.co>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```
   These stay local so the proxy can authenticate to Supabase.
2. Store runtime secrets in the `secure_settings` table. The proxy caches them and serves them to the browser on demand.

Required secrets:

- `marketcheck_api_key` – your real MarketCheck key.
- `google_maps_api_key` – browser key used to load Google Maps JS.

Optional overrides:

- `marketcheck_api_base` – defaults to `https://api.marketcheck.com/v2`.
- `google_maps_map_id` – defaults to `DEMO_MAP_ID`.

The proxy also honours `MARKETCHECK_BASE`, `GOOGLE_MAPS_API_KEY`, and `GOOGLE_MAPS_MAP_ID` environment variables as local fallbacks, but Supabase storage keeps credentials out of the repo.

### Secure secret storage
Apply the migration in `supabase/migrations/20240920_create_secure_settings.sql` (or run the SQL manually) to create the `secure_settings` table with service-role-only access. Then upsert secrets as needed:

```sql
insert into secure_settings (name, secret)
values
  ('marketcheck_api_key', 'YOUR_REAL_MARKETCHECK_KEY'),
  ('google_maps_api_key', 'YOUR_BROWSER_MAPS_KEY'),
  ('marketcheck_api_base', 'https://api.marketcheck.com/v2'),
  ('google_maps_map_id', 'YOUR_MAP_STYLE_ID')
on conflict (name) do update set secret = excluded.secret;
```

You can force the proxy to refresh cached values by calling `/api/config?force=1` while developing.

### Supabase Edge Functions
Static hosts (e.g., GitHub Pages) have no Node backend, so the repo ships Supabase Edge Functions that expose the same configuration and MarketCheck proxy used locally.

```
supabase/functions/runtime-config   # returns Google Maps + MarketCheck metadata
supabase/functions/marketcheck      # mirrors /api/mc/* endpoints
```

Deploy them after populating `secure_settings`:

```bash
# Set secrets once (service role key + optional overrides)
supabase secrets set \
  SERVICE_ROLE_KEY="your-service-role-key" \
  --project-ref your-project-ref

# (optional) override defaults
# supabase secrets set MARKETCHECK_BASE="https://api.marketcheck.com/v2" --project-ref your-project-ref
# supabase secrets set MARKETCHECK_PROXY_BASE="https://your-project-ref.functions.supabase.co/marketcheck" --project-ref your-project-ref

# Deploy the functions
supabase functions deploy runtime-config --project-ref your-project-ref
supabase functions deploy marketcheck --project-ref your-project-ref
```

The client automatically falls back to the Edge Functions when the Express proxy is unavailable, so GitHub Pages and other static hosts will load Google Maps and MarketCheck data without bundling secrets into the build.

### Garage Vehicle Photos
- The latest migration (`20251115_add_garage_vehicle_photos_bucket.sql`) creates a dedicated `garage-vehicle-photos` storage bucket plus row-level policies so only the vehicle owner can upload/delete images. Run `supabase db push` (or execute the SQL) before enabling photo uploads.
- The bucket allows PNG/JPG/WebP/HEIC files up to 5 MB and is public-read so `photo_url` values can be rendered directly throughout the UI.
- When developing locally you can also create the bucket with the Supabase CLI: `supabase db reset` will apply all migrations against the local Docker instance.

## Installation
```bash
npm install
```

## Local Development

**Important**: This project requires TWO servers to run:
1. **Frontend** (Vite) - Port 3000
2. **Backend API** (Express) - Port 5174

### Quick Start (Both Servers)
```bash
npm start
```
This starts both the backend API and frontend dev server simultaneously.

### Individual Server Commands
```bash
# Start backend API server only
npm run server

# Start frontend dev server only
npm run dev
```

The frontend at `http://localhost:3000/BrandonsCalc/` proxies `/api` requests to the backend at `http://localhost:5174` (see `vite.config.js`).

## Building for Production
```bash
npm run build
```

Static assets land in `dist/`. Serve them with any static host or integrate into your preferred deployment pipeline.

## Testing
```bash
npm test          # runs Jest suites (see __tests__/provider-engine.test.mjs)
npm test -- provider-engine
```

Playwright is available for browser automation if you add end-to-end suites later.

## Data & Rates Maintenance
- **Lender Rates:** Managed via the [myLenders tool](../myLenders/) - a PyQt6 GUI for scraper development and rate management.
- `npm run import:gov-fees` / `npm run import:tax` – Sync state fees and tax rates.
- `node scripts/show-rates.mjs` – Inspect normalized rates in the console.
- `node scripts/reset-calculator.mjs` – Utilities for clearing stored deals.

## Release Workflow
1. Ensure all scripts/tests succeed (`npm run build`, `npm test`).
2. Commit changes with a descriptive message (e.g., `chore(release): cut v1.0.0`).
3. Tag the release (`git tag v1.0.0`) and push to GitHub (`git push --follow-tags`).
4. Publish a GitHub Release and update Supabase environment secrets as needed.

## License
ISC © Brandon
