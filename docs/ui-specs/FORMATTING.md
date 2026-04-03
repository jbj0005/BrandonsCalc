<!-- @spec FORMATTING -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Formatting Rules

> Shared display formatting avoids subtle UI drift and duplicated utility code.

---

<!-- @section:standards -->

## Standards

| Type | Display | Notes |
| --- | --- | --- |
| Currency | `$1,234.56` | Store as integer cents when possible |
| Number | `1,234` | Use comma separators |
| Percent | `12.5%` | One decimal place max |
| Phone | `(555) 123-4567` | Normalize before storage |
| Date | `Jan 15, 2025` | Use local display timezone |
| ISO date | `2025-01-15` | Inputs and machine-readable values |

---

<!-- @section:usage -->

## Usage

- Prefer shared helpers over inline formatting.
- Keep input formats distinct from display formats.
- Do not recalculate currency with floating-point math if integer storage is available.

---

<!-- @section:quick-ref -->

## Quick Reference

| Need | Use |
| --- | --- |
| Money display | `$lib/utils/format.ts` |
| Date input | ISO date string |
| UI copy | Consistent separators and casing |
