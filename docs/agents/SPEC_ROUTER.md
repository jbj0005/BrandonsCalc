<!-- @spec SPEC_ROUTER -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Spec Router

> Maps common task types to the first specs an agent should read.
> Keep AGENTS.md short; move routing detail here.

---

<!-- @section:routing-table -->

## Routing Table

| Task Type | Read First |
| --- | --- |
| Any code | Primary stack gotchas from `AGENTS.md` |
| New feature | `docs/agents/WORKFLOWS.md` → `docs/features/TEMPLATE.md` |
| UI work | `docs/ui-specs/UI_CONSTRAINTS.md` |
| Icons | `docs/ui-specs/ICONS.md` |
| Formatting | `docs/ui-specs/FORMATTING.md` |
| Routes | `docs/routing/ROUTE_RULES.md` |
| State / stores | `docs/state/STORE_CONVENTIONS.md` |
| Architecture | `docs/decisions/ADR-*.md` |
| CLI / secrets | `docs/agents/CLI_SECRETS.md` |
| Tooling / anchors | `docs/agents/SCANNING_CONVENTIONS.md` → `docs/agents/TOOLING_CONFIGS.md` |
| Supabase / RLS | `docs/gotchas/SUPABASE.md` |
| Styling | `docs/gotchas/TAILWIND.md` → `docs/branding/COLORS.md` |

---

<!-- @section:usage -->

## Usage Notes

- Start with the smallest relevant doc, not the entire `/docs` tree.
- Prefer specialist `@section:quick-ref` before a full specialist read.
- When the stack is SvelteKit or Next.js, read the stack gotchas before opening code.

---

<!-- @section:quick-ref -->

## Quick Reference

| Need | First File |
| --- | --- |
| New workflow | `WORKFLOWS.md` |
| Broken UI | `UI_CONSTRAINTS.md` |
| Data formatting | `FORMATTING.md` |
| Navigation / load logic | `ROUTE_RULES.md` |
| Unclear shell task | `CLI_SECRETS.md` |
