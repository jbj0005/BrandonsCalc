// @util context-indexer
// @spec ADR-001-context-infrastructure.md
// @purpose Build searchable indexes of specialists and specs from the docs directory

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// @section:types
export interface SpecialistEntry {
	name: string;
	filename: string;
	path: string;
	quickRef: string;
	sections: string[];
	keywords: string[];
	filePatterns: string[];
}

export interface SpecEntry {
	name: string;
	filename: string;
	path: string;
	sections: string[];
	version?: string;
}

export interface ContextIndex {
	specialists: SpecialistEntry[];
	specs: SpecEntry[];
	lastBuilt: string;
}

// @section:parsers
function extractSections(content: string): string[] {
	const matches = content.matchAll(/<!--\s*@section:(\S+)\s*-->/g);
	return [...matches].map((m) => m[1]);
}

function extractSection(content: string, sectionName: string): string | null {
	const regex = new RegExp(
		`<!--\\s*@section:${sectionName}\\s*-->([\\s\\S]*?)(?=<!--\\s*@section:|$)`,
		'm'
	);
	const match = content.match(regex);
	return match ? match[1].trim() : null;
}

function extractVersion(content: string): string | undefined {
	const match = content.match(/<!--\s*@version\s+(\S+)\s*-->/);
	return match ? match[1] : undefined;
}

function extractKeywordsFromContent(content: string): string[] {
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

	return [...keywords];
}

function extractFilePatterns(content: string): string[] {
	const patterns: Set<string> = new Set();
	const inlineCodes = content.matchAll(/`([^`]+\.\w+)`/g);
	for (const c of inlineCodes) {
		if (c[1].includes('/') || c[1].includes('*') || c[1].includes('.ts') || c[1].includes('.svelte') || c[1].includes('.tsx')) {
			patterns.add(c[1]);
		}
	}
	return [...patterns];
}

// @section:indexers
function indexSpecialists(docsRoot: string): SpecialistEntry[] {
	const specialistsDir = join(docsRoot, 'agents', 'specialists');
	if (!existsSync(specialistsDir)) return [];

	const files = readdirSync(specialistsDir).filter((f: string) => f.endsWith('.md') && f !== 'TEMPLATE.md');

	return files.map((filename: string) => {
		const filePath = join(specialistsDir, filename);
		const content = readFileSync(filePath, 'utf-8');
		const quickRef = extractSection(content, 'quick-ref') ?? '';

		return {
			name: basename(filename, '.md'),
			filename,
			path: `docs/agents/specialists/${filename}`,
			quickRef,
			sections: extractSections(content),
			keywords: extractKeywordsFromContent(content),
			filePatterns: extractFilePatterns(content)
		};
	});
}

function indexSpecs(docsRoot: string): SpecEntry[] {
	const specs: SpecEntry[] = [];

	function scanDir(dir: string) {
		if (!existsSync(dir)) return;
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory() && entry.name !== 'specialists' && entry.name !== 'node_modules') {
				scanDir(fullPath);
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				const content = readFileSync(fullPath, 'utf-8');
				const specMatch = content.match(/<!--\s*@spec\s+(\S+)\s*-->/);
				if (specMatch) {
					const relativePath = fullPath.replace(docsRoot + '/', '');
					specs.push({
						name: specMatch[1],
						filename: entry.name,
						path: `docs/${relativePath}`,
						sections: extractSections(content),
						version: extractVersion(content)
					});
				}
			}
		}
	}

	scanDir(docsRoot);
	return specs;
}

// @section:main
export function buildIndex(projectRoot: string): ContextIndex {
	const docsRoot = join(projectRoot, 'docs');
	return {
		specialists: indexSpecialists(docsRoot),
		specs: indexSpecs(docsRoot),
		lastBuilt: new Date().toISOString()
	};
}

export { extractSection };
