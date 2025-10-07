import fs from "node:fs/promises";
import path from "node:path";

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const exportPrefix = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const match = exportPrefix.match(/^([A-Za-z_][A-Za-z0-9_\.\-]*)\s*=\s*(.*)$/);
  if (!match) return null;
  const key = match[1];
  let value = match[2];
  if (!value) return { key, value: "" };
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  return { key, value };
}

async function loadEnvFile(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    contents
      .split(/\r?\n/)
      .map(parseLine)
      .filter(Boolean)
      .forEach(({ key, value }) => {
        if (process.env[key] == null) {
          process.env[key] = value;
        }
      });
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    console.warn(`[env] Failed to load ${filePath}:`, error.message ?? error);
    return false;
  }
}

export async function hydrateEnv({
  rootDir = process.cwd(),
  files = [".env", ".env.local", ".env.development"],
} = {}) {
  const resolved = files.map((name) => path.resolve(rootDir, name));
  let loadedAny = false;
  for (const filePath of resolved) {
    const loaded = await loadEnvFile(filePath);
    loadedAny = loadedAny || loaded;
    if (loaded) {
      console.info(`[env] Loaded environment variables from ${path.relative(rootDir, filePath)}`);
    }
  }
  return loadedAny;
}

