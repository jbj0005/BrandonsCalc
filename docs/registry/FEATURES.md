<!-- @registry FEATURES -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Feature Registry

> Single source of truth for all features.
> Agents MUST update this registry when creating or modifying features.

---

<!-- @section:status-definitions -->

## Status Definitions

| Status | Meaning |
|--------|---------|
| `planned` | In PRD, not yet specced |
| `draft` | Spec written, not yet implemented |
| `dev` | Currently in development |
| `review` | Code complete, awaiting review |
| `live` | Deployed to production |
| `deprecated` | Scheduled for removal |

---

<!-- @section:feature-index -->

## Feature Index

<!-- Add your features here -->

| ID | Feature | Status | Spec | E2E | Priority |
|----|---------|--------|------|-----|----------|
| | | | | | |

---

<!-- @section:id-format -->

## ID Format

Feature IDs follow the pattern: `F-<domain>-<number>`

Example domains:
- `AUT` — Auth/Users
- `CUS` — Customers
- `DSH` — Dashboard

---

<!-- @section:adding-features -->

## Adding a Feature

1. Determine domain code
2. Find next available number
3. Create spec: `docs/features/F-XXX-NNN-name.md`
4. Add row to Feature Index
5. Create E2E stub when dev begins
