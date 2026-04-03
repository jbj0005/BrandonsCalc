#!/usr/bin/env node

// @util project-context-server
// @spec ADR-001-context-infrastructure.md
// @purpose MCP server providing context retrieval for the three-tier architecture

// @section:imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { z } from 'zod';
import { buildIndex, extractSection, type ContextIndex } from './indexer.js';

// @section:config
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT ?? process.cwd());
let index: ContextIndex;

function getIndex(): ContextIndex {
	if (!index) {
		index = buildIndex(PROJECT_ROOT);
	}
	return index;
}

function readFullFile(relativePath: string): string | null {
	const fullPath = join(PROJECT_ROOT, relativePath);
	if (!existsSync(fullPath)) return null;
	return readFileSync(fullPath, 'utf-8');
}

// @section:server
const server = new McpServer({
	name: 'project-context',
	version: '1.0.0'
});

// @section:tool-list-specialists
server.tool(
	'list_specialists',
	'List all specialist agents with their domains and file patterns',
	{},
	async () => {
		const idx = getIndex();
		const listing = idx.specialists.map((s) => ({
			name: s.name,
			path: s.path,
			sections: s.sections,
			keywordSample: s.keywords.slice(0, 8),
			filePatternSample: s.filePatterns.slice(0, 5)
		}));

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(listing, null, 2)
				}
			]
		};
	}
);

// @section:tool-suggest-context
server.tool(
	'suggest_context',
	'Given a file path or task description, suggest which specialists and specs to read',
	{
		query: z.string().describe('File path, keyword, or task description'),
	},
	async ({ query }) => {
		const idx = getIndex();
		const q = query.toLowerCase();

		const specialistMatches = idx.specialists
			.map((s) => {
				let score = 0;
				for (const p of s.filePatterns) {
					if (q.includes(p.replace(/\*/g, '').toLowerCase())) score += 3;
				}
				for (const k of s.keywords) {
					if (q.includes(k)) score += 2;
				}
				if (q.includes(s.name)) score += 5;
				return { specialist: s, score };
			})
			.filter((m) => m.score > 0)
			.sort((a, b) => b.score - a.score);

		const specMatches = idx.specs
			.map((s) => {
				let score = 0;
				if (q.includes(s.name.toLowerCase())) score += 5;
				if (q.includes(s.filename.toLowerCase().replace('.md', ''))) score += 3;
				return { spec: s, score };
			})
			.filter((m) => m.score > 0)
			.sort((a, b) => b.score - a.score);

		const suggestions = {
			specialists: specialistMatches.slice(0, 3).map((m) => ({
				name: m.specialist.name,
				path: m.specialist.path,
				relevance: m.score,
				readFirst: `@section:quick-ref (${m.specialist.sections.includes('quick-ref') ? 'available' : 'missing'})`
			})),
			specs: specMatches.slice(0, 5).map((m) => ({
				name: m.spec.name,
				path: m.spec.path,
				relevance: m.score,
				sections: m.spec.sections
			})),
			tip:
				specialistMatches.length > 0
					? `Start with ${specialistMatches[0].specialist.path} @section:quick-ref`
					: 'No specialist match. Check AGENTS.md @section:spec-routing for task routing.'
		};

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(suggestions, null, 2)
				}
			]
		};
	}
);

// @section:tool-search-specs
server.tool(
	'search_specs',
	'Full-text search across all specs and specialists for a keyword or phrase',
	{
		query: z.string().describe('Search term or phrase'),
		scope: z
			.enum(['all', 'specialists', 'specs'])
			.optional()
			.describe('Limit search scope')
	},
	async ({ query, scope }) => {
		const idx = getIndex();
		const q = query.toLowerCase();
		const results: Array<{ file: string; section: string; snippet: string }> = [];
		const searchScope = scope ?? 'all';

		const searchFile = (relativePath: string) => {
			const content = readFullFile(relativePath);
			if (!content) return;

			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].toLowerCase().includes(q)) {
					let currentSection = 'top';
					for (let j = i; j >= 0; j--) {
						const sectionMatch = lines[j].match(/<!--\s*@section:(\S+)\s*-->/);
						if (sectionMatch) {
							currentSection = sectionMatch[1];
							break;
						}
					}

					const snippetStart = Math.max(0, i - 1);
					const snippetEnd = Math.min(lines.length, i + 2);
					results.push({
						file: relativePath,
						section: currentSection,
						snippet: lines.slice(snippetStart, snippetEnd).join('\n').trim()
					});

					if (results.filter((r) => r.file === relativePath).length >= 3) return;
				}
			}
		};

		if (searchScope === 'all' || searchScope === 'specialists') {
			for (const s of idx.specialists) searchFile(s.path);
		}
		if (searchScope === 'all' || searchScope === 'specs') {
			for (const s of idx.specs) searchFile(s.path);
		}

		return {
			content: [
				{
					type: 'text' as const,
					text:
						results.length > 0
							? JSON.stringify(results.slice(0, 15), null, 2)
							: `No results found for "${query}" in ${searchScope} scope.`
				}
			]
		};
	}
);

// @section:tool-get-spec
server.tool(
	'get_spec',
	'Read a specific spec or specialist file, optionally a specific section only',
	{
		path: z.string().describe('Relative path to the spec file (e.g., docs/agents/specialists/example.md)'),
		section: z
			.string()
			.optional()
			.describe('Section name to read (e.g., quick-ref, mental-model). Omit to read entire file.')
	},
	async ({ path, section }) => {
		const content = readFullFile(path);
		if (!content) {
			return {
				content: [
					{
						type: 'text' as const,
						text: `File not found: ${path}`
					}
				],
				isError: true
			};
		}

		if (section) {
			const sectionContent = extractSection(content, section);
			if (!sectionContent) {
				const sections = [...content.matchAll(/<!--\s*@section:(\S+)\s*-->/g)].map(
					(m) => m[1]
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: `Section "${section}" not found in ${path}. Available sections: ${sections.join(', ')}`
						}
					],
					isError: true
				};
			}
			return {
				content: [
					{
						type: 'text' as const,
						text: `## ${path} @section:${section}\n\n${sectionContent}`
					}
				]
			};
		}

		return {
			content: [
				{
					type: 'text' as const,
					text: content
				}
			]
		};
	}
);

// @section:tool-find-related
server.tool(
	'find_related',
	'Given a source file path, find related specialists, specs, and linked docs',
	{
		filePath: z.string().describe('Source file path relative to project root')
	},
	async ({ filePath }) => {
		const idx = getIndex();
		const fp = filePath.toLowerCase();

		const specialistMatches = idx.specialists.filter((s) =>
			s.filePatterns.some((p) => {
				const pattern = p.replace(/\*/g, '').toLowerCase();
				return pattern.length > 3 && fp.includes(pattern);
			})
		);

		const content = readFullFile(filePath);
		let specAnchor: string | null = null;
		if (content) {
			const lines = content.split('\n').slice(0, 5);
			for (const line of lines) {
				const match = line.match(/@spec\s+(\S+)/);
				if (match) {
					specAnchor = match[1];
					break;
				}
			}
		}

		const linkedSpec = specAnchor
			? idx.specs.find((s) => s.name === specAnchor || s.filename === specAnchor)
			: null;

		const result = {
			file: filePath,
			specialists: specialistMatches.map((s) => ({
				name: s.name,
				path: s.path,
				quickRefAvailable: s.sections.includes('quick-ref')
			})),
			specAnchor: specAnchor,
			linkedSpec: linkedSpec
				? { name: linkedSpec.name, path: linkedSpec.path, sections: linkedSpec.sections }
				: null,
			suggestion:
				specialistMatches.length > 0
					? `Read ${specialistMatches[0].path} @section:quick-ref first`
					: specAnchor
						? `Read the linked spec: ${specAnchor}`
						: 'No direct context found. Check AGENTS.md @section:spec-routing for routing.'
		};

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(result, null, 2)
				}
			]
		};
	}
);

// @section:main
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error) => {
	console.error('Server error:', error);
	process.exit(1);
});
