# ExcelCalc

ExcelCalc is a dealership-ready finance calculator that surfaces real-time payment scenarios, lender APRs, and vehicle data so sales teams can structure deals without leaving the browser. The app runs as a Vite single-page experience backed by Supabase for rates and lender metadata, plus optional MarketCheck and Google integrations for inventory enrichment.

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
- Supabase project with `auto_rates` table populated (see `scripts/fetch-rates.mjs` for shape).
- Optional APIs:
  - MarketCheck (vehicle inventory enrichment).
  - Google Maps JavaScript + Map ID (dealership map embed).
  - Google Custom Search or Brave Search (lead enrichment, optional).

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
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  --project-ref your-project-ref

# (optional) override defaults
# supabase secrets set MARKETCHECK_BASE="https://api.marketcheck.com/v2" --project-ref your-project-ref
# supabase secrets set MARKETCHECK_PROXY_BASE="https://your-project-ref.functions.supabase.co/marketcheck" --project-ref your-project-ref

# Deploy the functions
supabase functions deploy runtime-config --project-ref your-project-ref
supabase functions deploy marketcheck --project-ref your-project-ref
```

The client automatically falls back to the Edge Functions when the Express proxy is unavailable, so GitHub Pages and other static hosts will load Google Maps and MarketCheck data without bundling secrets into the build.

## Installation
```bash
npm install
```

## Local Development
```bash
npm run dev
```

Vite hosts the app on `http://localhost:5173` with hot module replacement. The dev server proxies `/api` traffic to `http://localhost:5174` (see `vite.config.js`) for any local middleware you attach.

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
- `npm run fetch:rates` – Pulls lender APR matrices and upserts into Supabase.
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
