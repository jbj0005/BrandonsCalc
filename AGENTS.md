# AGENTS.md — Map (Not Encyclopedia)

> **All AI agents read this file.** Keep it under 120 lines.
> Every section is a summary + pointer. Detail lives in `/docs`.

<!-- @section:identity -->

## Project

**BrandonsCalc** — Auto loan calculator with real lender rates, vehicle valuation, and deal structuring
**Philosophy:** Dealer-grade accuracy with consumer-friendly UX; lender rates flow from myLenders scraper pipeline

<!-- @section:read-order -->

## Read Order

1. **This file** — Entry point, quick context
2. `docs/gotchas/REACT_NEXTJS.md` — **READ BEFORE WRITING CODE**
3. **Specialist** — Match task to Specialist Router → read `@section:quick-ref` first
4. `docs/agents/SPEC_ROUTER.md` — Task-to-spec routing
5. **Code** (using `@section:` anchors)

<!-- @section:stack -->

## Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React + Vite | SPA, not Next.js |
| Backend | Express (server/) | API proxy for Supabase, MarketCheck, NHTSA |
| Database | Supabase (paused) | PostgreSQL; falls back to stub rates |
| State | React hooks | Local state, no external state lib |
| Styling | Tailwind CSS | Design tokens in tailwind.config.js |
| Deploy | GitHub Pages | Static SPA via GH Actions |
| Email | Mailtrap | Transactional (replaced SendGrid) |
| Packages | fee-engine | `packages/fee-engine/` — FL fee calculations |

<!-- @section:system-of-record -->

## System of Record

Supabase is the system of record for auto_rates, lenders, marketcheck_cache, and user data. When paused, the Express server falls back to stub rates. Lender rates originate from the `myLenders` scraper pipeline (sibling repo).

<!-- @section:ui-constraints -->

## UI Constraints (Defects, Not Preferences)

| Rule | Status |
| --- | --- |
| No horizontal scrolling | ❌ PROHIBITED |
| Icons + text on primary actions | ✅ REQUIRED |
| Touch targets 44pt min | ✅ REQUIRED |
| No silent fallbacks | ❌ PROHIBITED |

**Specs:** `docs/ui-specs/UI_CONSTRAINTS.md` · `ICONS.md` · `FORMATTING.md`

<!-- @section:specialist-routing -->

## Specialist Router

For complex tasks (3+ files or cross-domain): match file patterns → read specialist `@section:quick-ref` first.

| File Pattern / Keywords | Specialist |
| --- | --- |
| `src/**/*.tsx`, React components, hooks | `specialists/react-patterns.md` |
| `server/*`, Express, API routes | `specialists/express-api.md` |
| `supabase/*`, RLS, policies, migrations | `specialists/supabase-architect.md` |
| `packages/fee-engine/*`, fees, FL taxes | `specialists/fee-engine.md` |

All specialists live in `docs/agents/specialists/`. Start with the template in `SPECIALIST_TEMPLATE.md`.

<!-- @section:spec-routing -->

## Spec Router

**Full routing table:** `docs/agents/SPEC_ROUTER.md`
Quick: New feature → `WORKFLOWS.md` · UI → `UI_CONSTRAINTS.md` · Routes → `ROUTE_RULES.md` · Stores → `STORE_CONVENTIONS.md`

<!-- @section:workflow -->

## Workflow & Registries

**Classify before coding:** FEATURE → full spec; IMPROVEMENT → update spec; FIX → check E2E; REFACTOR → E2E must pass.
**Details:** `docs/agents/WORKFLOWS.md`
**Registries:** `docs/registry/FEATURES.md` · `docs/registry/E2E.md`

<!-- @section:cli-anchors -->

## CLI, Anchors & Commands

Agents **must** run CLI operations directly — never ask the user. **Ref:** `docs/agents/CLI_SECRETS.md`
File anchors: `// @<type> <Name>` + `// @spec <SPEC>.md` + `// @section:<name>`. **Ref:** `docs/agents/SCANNING_CONVENTIONS.md`
Commands: `npm run dev` · `npm run build` · `npx tsc --noEmit` · `npx jest` · `npx playwright test`

<!-- @section:environment -->

## Environment

Use `.env.example` as the starter template. Keep `.env` local-only and update the example file when new variables are introduced.

<!-- @section:post-change -->

## Post-Change Validation (REQUIRED)

After **every** code change: `npm run build` → `npm run check` → `npm run format`
After substantial changes, run self-review: `docs/agents/SELF_REVIEW.md`

<!-- @section:final-rule -->

## The Rule

> If unclear: update spec → record ADR → then code. **Never the other way around.**
