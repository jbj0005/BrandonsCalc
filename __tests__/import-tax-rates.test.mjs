import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseFile,
  normalizeEntries,
} from "../scripts/import-tax-rates.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_BASE64_PATH = path.resolve(
  __dirname,
  "fixtures",
  "sample-tax.xlsx.b64"
);

async function prepareWorkbook() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tax-import-"));
  const workbookPath = path.join(tmpRoot, "rates.xlsx");
  const base64 = await fs.readFile(FIXTURE_BASE64_PATH, "utf8");
  await fs.writeFile(workbookPath, Buffer.from(base64, "base64"));
  return {
    workbookPath,
    cleanup: () =>
      fs.rm(tmpRoot, {
        recursive: true,
        force: true,
      }),
  };
}

describe("import-tax-rates Excel parsing", () => {
  test("produces normalized entries from sample workbook", async () => {
    const { workbookPath, cleanup } = await prepareWorkbook();
    try {
      const parsed = await parseFile(workbookPath, "xlsx", "FL");
      expect(parsed).toHaveLength(2);

      const normalized = normalizeEntries(parsed, {
        component: "total",
        effective: "2024-01-01",
        expiration: null,
        file: workbookPath,
        sourceVersion: null,
      });

      expect(normalized).toEqual([
        {
          state_code: "FL",
          county_name: "Alpha",
          county_fips: null,
          component_label: "total",
          rate_decimal: 0.025,
          effective_date: "2024-01-01",
          expiration_date: "2024-12-31",
          source_file: "rates.xlsx",
          source_version: null,
        },
        {
          state_code: "FL",
          county_name: "Beta",
          county_fips: null,
          component_label: "total",
          rate_decimal: 1,
          effective_date: "2024-06-01",
          expiration_date: null,
          source_file: "rates.xlsx",
          source_version: null,
        },
      ]);
    } finally {
      await cleanup();
    }
  });
});
