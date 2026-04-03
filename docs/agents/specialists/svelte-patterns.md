<!-- @specialist svelte-patterns -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Svelte Patterns Specialist

> Covers `*.svelte`, SvelteKit routes, reactivity, form actions, and SSR-safe component patterns.

**Scope:** `*.svelte`, `+page.svelte`, `+layout.svelte`, `+page.ts`, `+page.server.ts`
**Out of scope:** RLS, SQL, and service-role decisions (`supabase-architect.md`)

---

<!-- @section:failure-modes -->

## Common Failure Modes

| Symptom | Cause | Fix | Severity |
| --- | --- | --- | --- |
| SSR crash | Browser APIs used on server | Guard with framework-safe lifecycle or server/client boundaries | P0 |
| Non-reactive UI | Mutating arrays/objects in place | Use the stack's reactive update pattern | P0 |
| Broken forms | Hand-rolled fetch bypasses framework conventions | Use the framework's form action model | P1 |

---

<!-- @section:specs -->

## Related Specs

| Trigger | Spec |
| --- | --- |
| Any Svelte work | `docs/gotchas/SVELTEKIT.md` |
| UI changes | `docs/ui-specs/UI_CONSTRAINTS.md` |
| Display formatting | `docs/ui-specs/FORMATTING.md` |

---

<!-- @section:quick-ref -->

## Quick Reference

| Question | Answer |
| --- | --- |
| First file to read? | `docs/gotchas/SVELTEKIT.md` |
| Which files does this cover? | `*.svelte`, `+page.*`, `+layout.*` |
| When to escalate? | When UI work also changes auth, RLS, or backend contracts |
