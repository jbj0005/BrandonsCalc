<!-- @spec TOKEN_OPTIMIZATION -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Token Optimization Guide

> Strategies to minimize context window usage while maintaining code quality.
> Every token saved = more room for reasoning.

---

<!-- @section:principles -->

## Core Principles

1. **Pointers over content** — Entry files reference specs, don't duplicate
2. **Sections over files** — Read `@section:X` not entire files
3. **Indexes over searches** — Build mental map first, then targeted reads
4. **Tables over prose** — Structured data compresses better
5. **Anchors over line numbers** — Stable references reduce re-reads

---

<!-- @section:strategies -->

## Key Strategies

### Agent Entry Files = Pointers

**Bad:** 500-line CLAUDE.md with all rules duplicated
**Good:** 20-line CLAUDE.md that symlinks to AGENTS.md

**Savings:** ~95% on entry file reads

### Section Anchors

**Bad:** Agent reads entire 400-line file
**Good:** Agent jumps to `@section:actions`

**Savings:** 60-80% per file read

### Tables for Rules

**Bad:** Prose explanation of each rule
**Good:** Table with Rule | Status columns

**Savings:** 70% fewer tokens for rule sets

### Quick-Ref Sections

Every spec ends with a quick reference table. Agents read quick-ref first, full spec only if needed.

**Savings:** 50% on spec reads

---

<!-- @section:read-patterns -->

## Optimal Read Patterns

### Pattern 1: Index-First

```
1. Read AGENTS.md @section:spec-routing
2. Read relevant SPEC.md @section:quick-ref
3. Only if unclear: read full section
```

### Pattern 2: Anchor-Jump

```
1. grep for @section:actions in target file
2. Read only that section
3. Never read types/imports unless needed
```

---

<!-- @section:context-budgeting -->

## Context Budgeting

### Per-Task Budget Guide

| Task Type | Recommended Reads | Max Tokens |
|---|---|---|
| Bug fix | 1 spec section + 1 code section | ~2K |
| New component | UI_CONSTRAINTS quick-ref + template | ~3K |
| Store change | STORE_CONVENTIONS + store file sections | ~4K |
| New feature | Full relevant spec + multiple sections | ~8K |
| Architecture | ADRs + multiple specs | ~15K |

### Specialist Context Budget

| Read Level | Tokens | When to Use |
|---|---|---|
| Specialist `@section:quick-ref` only | ~200 | Simple tasks in a known domain |
| Specialist full read | ~1500 | First time in domain, or complex single-domain task |
| Specialist + linked specs | ~3000 | Cross-domain work or new feature implementation |

### Signs of Token Waste

- Reading same file multiple times
- Reading entire spec for one rule
- Loading all stores when modifying one
- Reading unrelated component files

---

<!-- @section:quick-ref -->

## Quick Reference

| Strategy | Savings |
|----------|---------|
| Pointer files | 95% on entry reads |
| Section anchors | 60-80% per file |
| Tables over prose | 70% for rule sets |
| Quick-ref sections | 50% on spec reads |
