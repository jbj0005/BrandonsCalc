<!-- @specialist react-nextjs -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# React / Next.js Specialist

> Covers `app/**/*.tsx`, route handlers, server/client boundaries, and App Router conventions.

**Scope:** `app/**/*.tsx`, `app/**/page.tsx`, `app/**/layout.tsx`, `app/api/**/route.ts`
**Out of scope:** Database policy design and secret-handling decisions (`supabase-architect.md`)

---

<!-- @section:failure-modes -->

## Common Failure Modes

| Symptom | Cause | Fix | Severity |
| --- | --- | --- | --- |
| Too much client JS | `'use client'` added everywhere | Default to server components | P0 |
| Slow first load | Data fetched in client effect | Fetch on the server when possible | P1 |
| Broken mutations | API routes or client fetch used by default | Prefer server actions / route handlers consistently | P1 |

---

<!-- @section:specs -->

## Related Specs

| Trigger | Spec |
| --- | --- |
| Any Next.js work | `docs/gotchas/REACT_NEXTJS.md` |
| UI changes | `docs/ui-specs/UI_CONSTRAINTS.md` |
| Routing | `docs/routing/ROUTE_RULES.md` |

---

<!-- @section:quick-ref -->

## Quick Reference

| Question | Answer |
| --- | --- |
| First file to read? | `docs/gotchas/REACT_NEXTJS.md` |
| Which files does this cover? | `app/**/*.tsx`, `app/api/**/route.ts` |
| When to escalate? | When route changes also alter backend auth or RLS behavior |
