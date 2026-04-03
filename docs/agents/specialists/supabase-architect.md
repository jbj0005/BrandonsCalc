<!-- @specialist supabase-architect -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Supabase Architect Specialist

> Covers `supabase/migrations/*`, auth boundaries, RLS, and server-only data access patterns.

**Scope:** `supabase/migrations/*.sql`, `hooks.server.ts`, `src/lib/server/*.ts`, `src/routes/**/+page.server.ts`
**Out of scope:** Pure component rendering and frontend interaction details

---

<!-- @section:failure-modes -->

## Common Failure Modes

| Symptom | Cause | Fix | Severity |
| --- | --- | --- | --- |
| Data leak | RLS missing or bypassed | Enable RLS and write explicit policies | P0 |
| Secret exposure | Service role used in client code | Keep admin access server-only | P0 |
| Auth drift | Trusting client session without server verification | Re-verify auth on the server | P0 |

---

<!-- @section:specs -->

## Related Specs

| Trigger | Spec |
| --- | --- |
| Any Supabase work | `docs/gotchas/SUPABASE.md` |
| Routes / server actions | `docs/routing/ROUTE_RULES.md` |
| Architecture changes | `docs/decisions/ADR-*.md` |

---

<!-- @section:quick-ref -->

## Quick Reference

| Question | Answer |
| --- | --- |
| First file to read? | `docs/gotchas/SUPABASE.md` |
| Which files does this cover? | `supabase/migrations/*`, `hooks.server.ts`, server data access files |
| When to escalate? | When a change weakens auth, policies, or system-of-record boundaries |
