# ExcelJS Migration Plan

## Objectives
- Replace the vulnerable `xlsx` (SheetJS) parser with `exceljs`.
- Preserve the existing tax import workflow while tightening file-handling guarantees.
- Add regression coverage around Excel parsing so future changes are safer.

## Completed Actions
- Added `__tests__/import-tax-rates.test.mjs`, which decodes a fixture workbook and asserts the normalized output produced by `parseFile`/`normalizeEntries`.
- Introduced an ESM-friendly guard in `scripts/import-tax-rates.mjs` so functions can be imported directly without running the CLI.
- Replaced the SheetJS reader with an `exceljs` implementation and removed the `xlsx` dependency.
- Documented the loss of legacy `.xls` support (these files now raise a descriptive error).

## Regression Test Suite
Run with:
```bash
NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/import-tax-rates.test.mjs
```

The broader `npm test` suite still reflects pre-existing gaps (e.g. the missing `src/reset-calculator.mjs` module). Resolve those failures before treating the test run as a gate.

## Operational Notes
- When users supply legacy `.xls` files, convert them to `.xlsx` (Excel or LibreOffice) before running the CLI importer.
- The parser now filters out completely empty rows; if a workbook relies on blank header rows, insert a true header row in column A instead.
- Keep an eye on ExcelJS release notes; if you rely on advanced cell types, extend `resolveCellValue` to support those shapes.
