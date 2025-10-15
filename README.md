# ExcelCalc

ExcelCalc is a dealership-ready finance calculator that surfaces real-time payment scenarios, lender APRs, and vehicle data so sales teams can structure deals without leaving the browser. The app runs as a Vite single-page experience backed by Supabase for rates and lender metadata, plus optional MarketCheck and Google integrations for inventory enrichment.

## v1.0.0 Highlights
- Redesigned borrower UX with floating payment summary, affordability calculator, and side-by-side lender rate sourcing.
- Supabase-backed `rates/provider-engine` for ingesting, matching, and applying lowest APR programs (including the cleaned CCUFL note output).
- Scriptable data pipelines for rates, tax tables, and government fees (`scripts/fetch-rates.mjs`, `scripts/import-*.mjs`).
- Configurable MarketCheck vehicle lookups, Google Maps visualization, and VIN utilities for sales desk workflows.

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
Create a `.env.local` (or populate `.env`) with the following keys. The provided `.env` file can be used as a template, but be sure to rotate any keys before deploying publicly.

```
SUPABASE_URL=<https://your-project.supabase.co>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
MARKETCHECK_API_KEY=<marketcheck-key>
VITE_MARKETCHECK_API_KEY=<marketcheck-key-exposed-to-client>
VITE_MARKETCHECK_API_BASE=<marketcheck-api-base>
VITE_GOOGLE_MAPS_MAP_ID=<google-map-style-id>
GOOGLE_API_KEY=<google-server-key>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_ID_SECRET=<oauth-client-secret>
BRAVE_SEARCH_API_KEY=<optional-brave-key>
```

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
