#!/usr/bin/env npx tsx

// @util detect-drift
// @spec ADR-001-context-infrastructure.md
// @purpose Advisory check: do changed source files have matching specialist/spec coverage?

// @section:imports
import { execSync } from 'child_process';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// @section:types
interface DriftResult {
	file: string;
	specialist: string | null;
	specAnchor: string | null;
	status: 'covered' | 'uncovered' | 'partial';
	reason?: string;
}

interface SpecialistRoute {
	patterns: RegExp[];
	keywords: string[];
	specialist: string;
}

type WorkType = 'FEATURE' | 'IMPROVEMENT' | 'FIX' | 'REFACTOR' | 'UNKNOWN';

// @section:config
const ROOT = process.cwd();
const SPECIALISTS_DIR = join(ROOT, 'docs', 'agents', 'specialists');
const SOURCE_EXTENSIONS = ['.ts', '.svelte', '.js', '.jsx', '.tsx', '.sql'];

// @section:dynamic-routing
// Dynamically builds specialist routing table by scanning specialist files.
// Unlike hardcoded routing, this works for any project — specialists define
// their own coverage through the file patterns and keywords in their content.
let _cachedRoutes: SpecialistRoute[] | null = null;

function loadSpecialistRoutes(): SpecialistRoute[] {
	if (_cachedRoutes) return _cachedRoutes;

	if (!existsSync(SPECIALISTS_DIR)) {
		_cachedRoutes = [];
		return _cachedRoutes;
	}

	const files = readdirSync(SPECIALISTS_DIR).filter(
		(f) => f.endsWith('.md') && f !== 'TEMPLATE.md' && !f.startsWith('.')
	);

	_cachedRoutes = files.map((filename) => {
		const content = readFileSync(join(SPECIALISTS_DIR, filename), 'utf-8');

		// Extract file patterns from inline code references
		const filePatterns: RegExp[] = [];
		const inlineCodes = content.matchAll(/`([^`]+\.\w+)`/g);
		for (const c of inlineCodes) {
			const code = c[1];
			if (code.includes('/') || code.endsWith('.ts') || code.endsWith('.svelte') || code.endsWith('.tsx') || code.endsWith('.jsx')) {
				// Convert glob-like patterns to regex
				const pattern = code
					.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
					.replace(/\\\*/g, '.*'); // Restore * as wildcard
				try {
					filePatterns.push(new RegExp(pattern));
				} catch {
					// Skip invalid regex
				}
			}
		}

		// Extract keywords from headings and bold text
		const keywords: Set<string> = new Set();
		const headings = content.matchAll(/^##\s+(.+)$/gm);
		for (const h of headings) {
			h[1]
				.toLowerCase()
				.split(/\W+/)
				.filter((w) => w.length > 3)
				.forEach((w) => keywords.add(w));
		}
		const bolds = content.matchAll(/\*\*([^*]+)\*\*/g);
		for (const b of bolds) {
			b[1]
				.toLowerCase()
				.split(/\W+/)
				.filter((w) => w.length > 3)
				.forEach((w) => keywords.add(w));
		}

		return {
			patterns: filePatterns,
			keywords: [...keywords],
			specialist: filename
		};
	});

	return _cachedRoutes;
}

// @section:helpers
function getChangedFiles(base?: string): string[] {
	try {
		if (base) {
			const output = execSync(`git diff --name-only ${base}...HEAD`, {
				cwd: ROOT,
				encoding: 'utf-8'
			});
			return output.trim().split('\n').filter(Boolean);
		}

		const staged = execSync('git diff --cached --name-only', {
			cwd: ROOT,
			encoding: 'utf-8'
		});
		const unstaged = execSync('git diff --name-only', {
			cwd: ROOT,
			encoding: 'utf-8'
		});
		const untracked = execSync('git ls-files --others --exclude-standard', {
			cwd: ROOT,
			encoding: 'utf-8'
		});

		const all = [...staged.split('\n'), ...unstaged.split('\n'), ...untracked.split('\n')];
		return [...new Set(all.filter(Boolean))];
	} catch {
		console.error('⚠️  Could not read git changes. Are you in a git repository?');
		return [];
	}
}

function isSourceFile(file: string): boolean {
	return SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function readSpecAnchor(filePath: string): string | null {
	const fullPath = join(ROOT, filePath);
	if (!existsSync(fullPath)) return null;

	try {
		const content = readFileSync(fullPath, 'utf-8');
		const lines = content.split('\n').slice(0, 5);
		for (const line of lines) {
			const match = line.match(/@spec\s+(\S+)/);
			if (match) return match[1];
		}
	} catch {
		// File unreadable, skip
	}
	return null;
}

function matchSpecialist(filePath: string): string | null {
	const routes = loadSpecialistRoutes();
	for (const route of routes) {
		for (const pattern of route.patterns) {
			if (pattern.test(filePath)) {
				return route.specialist;
			}
		}
	}
	return null;
}

function classifyWorkType(): WorkType {
	const typeArg = process.argv.find((a) => a.startsWith('--type='));
	if (typeArg) {
		const val = typeArg.split('=')[1].toUpperCase() as WorkType;
		if (['FEATURE', 'IMPROVEMENT', 'FIX', 'REFACTOR'].includes(val)) return val;
	}

	try {
		const branch = execSync('git rev-parse --abbrev-ref HEAD', {
			cwd: ROOT,
			encoding: 'utf-8'
		}).trim();

		if (/^fix[/-]/.test(branch) || /^hotfix[/-]/.test(branch)) return 'FIX';
		if (/^refactor[/-]/.test(branch)) return 'REFACTOR';
		if (/^feat[/-]/.test(branch) || /^feature[/-]/.test(branch)) return 'FEATURE';
		if (/^improve[/-]/.test(branch) || /^enhancement[/-]/.test(branch)) return 'IMPROVEMENT';
	} catch {
		// Not in git, can't determine
	}

	return 'UNKNOWN';
}

function specialistExists(name: string): boolean {
	return existsSync(join(SPECIALISTS_DIR, name));
}

// @section:analyzer
function analyzeFile(file: string): DriftResult {
	const specialist = matchSpecialist(file);
	const specAnchor = readSpecAnchor(file);

	if (specialist && specAnchor) {
		if (!specialistExists(specialist)) {
			return {
				file,
				specialist,
				specAnchor,
				status: 'partial',
				reason: `Specialist ${specialist} referenced but file missing`
			};
		}
		return { file, specialist, specAnchor, status: 'covered' };
	}

	if (specialist && !specAnchor) {
		return {
			file,
			specialist,
			specAnchor: null,
			status: 'partial',
			reason: 'No @spec anchor in file header'
		};
	}

	if (!specialist && specAnchor) {
		return {
			file,
			specialist: null,
			specAnchor,
			status: 'partial',
			reason: 'No specialist route matches this file'
		};
	}

	return {
		file,
		specialist: null,
		specAnchor: null,
		status: 'uncovered',
		reason: 'No specialist or @spec coverage'
	};
}

// @section:main
function main() {
	const args = process.argv.slice(2);
	const base = args.find((a) => a.startsWith('--base='))?.split('=')[1];
	const verbose = args.includes('--verbose');

	console.log('🔍 Drift Detection (advisory mode)\n');

	// Step 1: Classify work type
	const workType = classifyWorkType();
	console.log(`📋 Work type: ${workType}`);

	if (workType === 'FIX' || workType === 'REFACTOR') {
		console.log('⏭️  FIX/REFACTOR — skipping drift check (no spec drift expected)');
		process.exit(0);
	}

	// Step 2: Get changed files
	const changedFiles = getChangedFiles(base);
	const sourceFiles = changedFiles.filter(isSourceFile);

	if (sourceFiles.length === 0) {
		console.log('✅ No source file changes detected.');
		process.exit(0);
	}

	const routes = loadSpecialistRoutes();
	console.log(`📁 ${sourceFiles.length} source file(s) changed`);
	console.log(`📚 ${routes.length} specialist(s) loaded\n`);

	// Step 3: Analyze each file
	const results = sourceFiles.map(analyzeFile);
	const covered = results.filter((r) => r.status === 'covered');
	const partial = results.filter((r) => r.status === 'partial');
	const uncovered = results.filter((r) => r.status === 'uncovered');

	// Step 4: Report
	if (verbose || covered.length > 0) {
		if (covered.length > 0) {
			console.log(`✅ Fully covered (${covered.length}):`);
			for (const r of covered) {
				console.log(`   ${r.file} → ${r.specialist} + @spec ${r.specAnchor}`);
			}
			console.log();
		}
	}

	if (partial.length > 0) {
		console.log(`⚠️  Partial coverage (${partial.length}):`);
		for (const r of partial) {
			console.log(`   ${r.file} — ${r.reason}`);
		}
		console.log();
	}

	if (uncovered.length > 0) {
		console.log(`❌ No coverage (${uncovered.length}):`);
		for (const r of uncovered) {
			console.log(`   ${r.file}`);
		}
		console.log();
	}

	// Step 5: Summary
	const total = results.length;
	const coveragePercent = total > 0 ? Math.round((covered.length / total) * 100) : 100;

	console.log('─'.repeat(50));
	console.log(
		`📊 Coverage: ${covered.length}/${total} files fully covered (${coveragePercent}%)`
	);

	if (partial.length + uncovered.length > 0) {
		console.log('\n💡 Advisory: Consider adding @spec anchors to uncovered files');
		console.log('   or extending specialist routing for unmatched patterns.');
	} else {
		console.log('\n🎉 All changed files have full context coverage!');
	}

	// Advisory only — never exit with error code
	process.exit(0);
}

main();
