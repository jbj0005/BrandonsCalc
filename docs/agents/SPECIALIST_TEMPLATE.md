<!-- @spec SPECIALIST_TEMPLATE -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Specialist Agent Template

> Copy this file to `docs/agents/specialists/<name>.md` and fill in each section.
> Target: 300-600 lines. Domain knowledge (mental model + failure modes + code patterns) should be >50% of content.

---

<!-- @section:structure -->

## Required Structure

````markdown
<!-- @specialist <SPECIALIST-NAME> -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# <Domain Name> Specialist

> One-line domain purpose.

**Scope:** What this specialist covers.
**Out of scope:** What belongs to a different specialist (name it).

---

<!-- @section:mental-model -->

## Domain Mental Model

[2-4 paragraphs explaining how this domain works conceptually.
This is project-specific understanding — not generic knowledge.
Include how the subsystems interact and what invariants must hold.]

### Key Concepts

| Concept | Definition | Key Files |
| ------- | ---------- | --------- |
| ...     | ...        | `src/...` |

### Domain Boundaries

| This Specialist Handles           | Another Specialist Handles     |
| --------------------------------- | ------------------------------ |
| Scheduling logic and constraints  | → svelte-patterns (UI layer)   |
| Database queries in schedule code | → supabase-architect (RLS/DDL) |

---

<!-- @section:failure-modes -->

## Common Failure Modes

| Symptom | Cause | Fix | Severity |
| ------- | ----- | --- | -------- |
| ...     | ...   | ... | P0/P1/P2 |

---

<!-- @section:code-patterns -->

## Code Patterns

### Pattern: <Name>

**When:** ...
**Files:** `src/lib/server/example.ts` @section:actions

\```typescript
// Canonical example
\```

### Anti-Pattern: <Name>

**Why it fails:** ...

\```typescript
// What NOT to do
\```

---

<!-- @section:specs -->

## Related Specs

| Trigger      | Spec                         | Section to Read   |
| ------------ | ---------------------------- | ----------------- |
| Modifying X  | `docs/features/F-XXX-NNN.md` | @section:workflow |
| Adding new Y | `docs/features/F-YYY-NNN.md` | @section:api      |

---

<!-- @section:decision-tree -->

## Decision Trees

### When <common decision>

\```
Question?
YES → action A (see pattern above)
NO ↓
Question?
YES → action B
NO → escalate to user
\```

---

<!-- @section:quick-ref -->

## Quick Reference

| Question | Answer |
| -------- | ------ |
| ...      | ...    |
````

---

<!-- @section:guidelines -->

## Writing Guidelines

1. **>50% domain knowledge** — Mental model, failure modes, and code patterns should constitute the majority. Behavioral instructions belong in WORKFLOWS.md, not here.
2. **File references are mandatory** — Every pattern and concept must reference specific source files.
3. **Tables over prose** — Failure modes, specs, and quick-ref all use tables for token efficiency.
4. **Quick-ref is the entry point** — Agents read `@section:quick-ref` first (~200 tokens). Full read only when quick-ref is insufficient.
5. **Boundary declarations** — Every specialist must declare what's in scope and what routes to another specialist.
6. **Emergence over speculation** — Only document patterns you've observed in the codebase. Don't speculate about future patterns. (Paper guideline G4: "Repeated explanation signals documentation need.")
7. **Version and maintain** — Update `@version` when making changes. Drift detection will flag stale specialists via their linked specs.
