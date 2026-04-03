<!-- @spec ADR-001-context-infrastructure -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# ADR-001: Three-Tier Codified Context Infrastructure

> Adopt a three-tier memory architecture for AI agent context management.

---

## Status

**PROPOSED**

---

## Context

This project uses AI agents for development. As the codebase grows, agents face:

1. **No domain priming** — Agents start cold on complex domains. They re-derive domain understanding each session, leading to inconsistent output and repeated mistakes.
2. **Flat routing** — The Spec Router maps task types to documents but doesn't encode which domains require deep context loading.
3. **No drift detection** — Code and specs drift apart silently. Agents trust stale documentation.
4. **No structured retrieval** — Agents navigate docs via manual file reads. No tool assists with "what context do I need?"
5. **Constitution bloat** — AGENTS.md grows beyond its target line count with no reduction strategy.

Research basis: [Codified Context Infrastructure for AI Agents](https://arxiv.org/html/2602.20478v1)

---

## Decision

> Adopt a three-tier context architecture with domain-specialist agents, an MCP retrieval server, and advisory drift detection.

### Tier 1: Hot Memory (Constitution)

AGENTS.md remains the always-loaded entry point. Contains a **Specialist Router** that maps file patterns and task keywords to domain specialists.

### Tier 2: Specialist Agents

Domain-expert documents in `docs/agents/specialists/`, each 300-600 lines. More than 50% of each specialist's content is **project-specific domain knowledge** (mental models, failure modes, code patterns), not behavioral instructions.

Each specialist contains: mental model, failure mode tables, code patterns with file references, related spec triggers, decision trees, and a quick-ref section (~200 tokens).

### Tier 3: Cold Memory (MCP Retrieval)

A custom MCP server (`mcp/context-server/`) indexes all docs/ files and source @spec anchors. Provides five tools: `list_specialists`, `suggest_context`, `search_specs`, `get_spec`, `find_related`.

The Specialist Router in AGENTS.md is the primary routing mechanism. MCP is a convenience enhancement, not a hard dependency.

### Drift Detection

Advisory-only script (`scripts/detect-drift.ts`) that:
- Dynamically reads specialist files to build routing table
- Classifies work type: FIX/REFACTOR skip check; FEATURE/IMPROVEMENT trigger check
- Reports coverage levels (covered/partial/uncovered)
- Always exits 0 in advisory mode

---

## Consequences

### Positive

- Agents load domain-specific mental models before coding, reducing re-derivation
- Specialist quick-ref sections (~200 tokens) provide fast context for simple tasks
- MCP retrieval automates "what context do I need?"
- Drift detection surfaces stale specs before they mislead agents
- New specialists can be added organically following the template

### Negative

- Specialist files add maintenance surface area
- MCP server requires building and maintaining a separate Node.js project
- Specialists can become stale (mitigated by drift detection + version tags)

### Neutral

- Drift detection is advisory-only initially; may evolve to blocking for FEATURE work
- Specialist boundaries may need adjustment as the codebase evolves

---

## Alternatives Considered

### Status Quo (No Change)

Continue with AGENTS.md + Spec Router + direct file reads. No domain priming, no drift detection, cold-start problem persists.

### Single-File Expansion

Expand AGENTS.md into a 600+ line constitution. Exceeds context budget for every session regardless of task.

### Full RAG / Embedding-Based Retrieval

Vector database with semantic search. Overkill for structured, well-anchored docs. Harder to debug.

---

## References

- [Codified Context Infrastructure for AI Agents](https://arxiv.org/html/2602.20478v1)
- `AGENTS.md` — Constitution
- `docs/agents/WORKFLOWS.md` — Workflow protocol
- `docs/agents/TOKEN_OPTIMIZATION.md` — Token budget strategy

---

## Metadata

| Field | Value |
|---|---|
| Date | *(fill in)* |
| Author | *(fill in)* |
| Reviewers | — |
| Supersedes | — |
