#!/usr/bin/env npx tsx

// @util validate-registry
// @spec WORKFLOWS.md
// @purpose Validate feature registry stays in sync with code and tests

// @section:imports
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// @section:types
interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  file?: string;
}

interface FeatureEntry {
  id: string;
  name: string;
  status: string;
  spec: string;
  e2e: string;
}

// @section:config
const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, 'docs');
const FEATURES_DIR = join(DOCS_DIR, 'features');
const REGISTRY_DIR = join(DOCS_DIR, 'registry');
const E2E_DIR = join(ROOT, 'e2e');
const CODE_ROOTS = [''];
const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.svelte-kit',
  'build',
  'coverage',
  'dist',
  'docs',
  'e2e',
  'mcp',
  'node_modules',
  'playwright-report',
  'scripts',
  'test-results',
]);
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.svelte'];

// @section:parsers
function parseFeatureRegistry(): FeatureEntry[] {
  const registryPath = join(REGISTRY_DIR, 'FEATURES.md');

  if (!existsSync(registryPath)) {
    console.log('No FEATURES.md found - skipping validation');
    return [];
  }

  const content = readFileSync(registryPath, 'utf-8');
  const lines = content.split('\n');
  const features: FeatureEntry[] = [];

  let inTable = false;

  for (const line of lines) {
    if (line.includes('## Feature Index')) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;
    if (line.startsWith('|--') || line.trim() === '' || line.includes('| ID |')) continue;
    if (line.startsWith('##') || line.startsWith('---')) break;

    if (line.startsWith('|') && !line.includes('<!--')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 5 && cells[0].startsWith('F-')) {
        features.push({
          id: cells[0],
          name: cells[1],
          status: cells[2],
          spec: cells[3],
          e2e: cells[4],
        });
      }
    }
  }

  return features;
}

function isCodeFile(name: string): boolean {
  return CODE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function findFeatureAnchorsInCode(): string[] {
  const anchors: string[] = [];

  function scanDir(dir: string) {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        const content = readFileSync(fullPath, 'utf-8');
        const matches = content.match(/@feature\s+(F-[A-Z]{3}-\d{3})/g);
        if (matches) {
          for (const match of matches) {
            const id = match.replace('@feature ', '').trim();
            if (!anchors.includes(id)) {
              anchors.push(id);
            }
          }
        }
      }
    }
  }

  for (const relativeRoot of CODE_ROOTS) {
    const targetDir = relativeRoot ? join(ROOT, relativeRoot) : ROOT;
    scanDir(targetDir);
  }
  return anchors;
}

// @section:validators
function validateSpecsExist(features: FeatureEntry[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const feature of features) {
    if (!feature.spec || feature.spec === '-') continue;

    const specPath = join(FEATURES_DIR, feature.spec);
    if (!existsSync(specPath)) {
      errors.push({
        type: 'error',
        message: `Feature ${feature.id}: Spec file not found`,
        file: feature.spec,
      });
    }
  }

  return errors;
}

function validateE2EExist(features: FeatureEntry[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const feature of features) {
    if (!feature.e2e || feature.e2e === '-') continue;
    if (feature.status === 'draft' || feature.status === 'planned') continue;

    const e2ePath = join(E2E_DIR, 'features', feature.e2e);
    if (!existsSync(e2ePath)) {
      errors.push({
        type: feature.status === 'live' ? 'error' : 'warning',
        message: `Feature ${feature.id}: E2E test file not found`,
        file: feature.e2e,
      });
    }
  }

  return errors;
}

function validateCodeAnchors(features: FeatureEntry[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const codeAnchors = findFeatureAnchorsInCode();
  const registeredIds = features.map(f => f.id);

  for (const anchor of codeAnchors) {
    if (!registeredIds.includes(anchor)) {
      errors.push({
        type: 'warning',
        message: `Feature ${anchor} found in code but not in registry`,
      });
    }
  }

  return errors;
}

// @section:main
function main() {
  console.log('🔍 Validating feature registry...\n');

  const features = parseFeatureRegistry();
  console.log(`Found ${features.length} features in registry\n`);

  if (features.length === 0) {
    console.log('✅ No features to validate yet\n');
    return;
  }

  const allErrors: ValidationError[] = [
    ...validateSpecsExist(features),
    ...validateE2EExist(features),
    ...validateCodeAnchors(features),
  ];

  const errors = allErrors.filter(e => e.type === 'error');
  const warnings = allErrors.filter(e => e.type === 'warning');

  if (warnings.length > 0) {
    console.log('⚠️  Warnings:\n');
    for (const warning of warnings) {
      console.log(`   ${warning.message}`);
      if (warning.file) console.log(`      File: ${warning.file}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.log('❌ Errors:\n');
    for (const error of errors) {
      console.log(`   ${error.message}`);
      if (error.file) console.log(`      File: ${error.file}`);
    }
    console.log('');
    process.exit(1);
  }

  if (warnings.length === 0 && errors.length === 0) {
    console.log('✅ All validations passed!\n');
  } else if (errors.length === 0) {
    console.log('✅ No errors (warnings only)\n');
  }
}

main();
