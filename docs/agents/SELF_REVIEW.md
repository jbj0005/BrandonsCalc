<!-- @spec SELF_REVIEW -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Agent Self-Review Protocol

> Run this after validation passes and before you consider a task complete.
> The goal is to catch issues that builds and type checks miss.

---

<!-- @section:when -->

## When to Run

- After every FEATURE or IMPROVEMENT task
- After any change touching 3+ files
- Before handing work back for review

---

<!-- @section:checklist -->

## Self-Review Checklist

### 1. Correctness

- [ ] Re-read every modified file
- [ ] Remove debug logs and stale TODOs
- [ ] Handle error cases, not just the happy path
- [ ] Confirm any new route or mutation has auth and permission checks

### 2. Consistency

- [ ] Match existing naming and folder conventions
- [ ] Reuse existing utilities before adding new ones
- [ ] Keep `@spec`, `@feature`, and `@section` anchors intact

### 3. Completeness

- [ ] Update specs or ADRs if behavior changed
- [ ] Update `docs/registry/FEATURES.md` and `docs/registry/E2E.md` when applicable
- [ ] Add or update E2E coverage for new user-visible workflows

### 4. UI Compliance

- [ ] No horizontal scrolling
- [ ] Touch targets are at least 44pt
- [ ] Key actions use icon + text
- [ ] Fallback behavior is visible, not silent

### 5. No Regressions

- [ ] `npm run build`
- [ ] `npm run check`
- [ ] `npm run format`
- [ ] Manually trace the primary user flow you touched

---

<!-- @section:quick-ref -->

## Quick Reference

| If you changed... | Re-check... |
| --- | --- |
| UI | constraints, icons, mobile |
| Routes / actions | auth, error handling |
| Specs / docs | registries, anchors |
| Data model | ADRs, gotchas, migrations |
