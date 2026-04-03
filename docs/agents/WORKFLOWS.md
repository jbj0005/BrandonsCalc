<!-- @spec WORKFLOWS -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Agent Workflow Rules

> How agents classify and execute work.
> Follow these workflows to keep code and docs in sync.

---

<!-- @section:classification -->

## Step 1: Classify the Work

| Type | Definition | Trigger |
|------|------------|---------|
| **FEATURE** | New capability | New routes, new user workflow, new data model |
| **IMPROVEMENT** | Enhancement | Changes behavior of existing feature |
| **FIX** | Bug repair | Broken behavior, no spec change needed |
| **REFACTOR** | Code quality | No behavior change, no spec change |

---

<!-- @section:context-discovery -->

## Step 1.5: Context Discovery

After classifying, load domain context before coding:

1. **Match task to specialist** — Use the Specialist Router table in `AGENTS.md` to find the relevant specialist(s) by file pattern or keyword.
2. **Read `@section:quick-ref`** — Start with the specialist's quick-ref table (~200 tokens). This is sufficient for simple tasks in a known domain.
3. **Read full sections if needed** — For first-time work in a domain or complex tasks, read the specialist's mental model, failure modes, and code patterns (~1500 tokens).
4. **Follow spec links** — The specialist's `@section:specs` table maps triggers to the exact spec sections to read (~3000 tokens for cross-domain work).

**Skip this step** for trivial FIX or REFACTOR tasks that touch a single file.

---

<!-- @section:feature-workflow -->

## FEATURE Workflow

### Before Coding

1. Create spec from `docs/features/TEMPLATE.md`
2. Register in `docs/registry/FEATURES.md`
3. Create E2E stub
4. Register in `docs/registry/E2E.md`
5. Write ADR if architectural

### During Coding

- All files have `@feature F-XXX-NNN` anchor
- Update spec if requirements change

### After Coding

- Update feature status in registry
- Complete E2E tests
- Verify acceptance criteria

---

<!-- @section:improvement-workflow -->

## IMPROVEMENT Workflow

1. Find existing feature spec
2. Update affected sections
3. Add changelog entry to spec
4. Write code
5. Update E2E if scenarios changed

---

<!-- @section:fix-workflow -->

## FIX Workflow

1. Identify affected feature
2. Check if E2E covers bug (add if not)
3. Fix code
4. Verify E2E passes

---

<!-- @section:refactor-workflow -->

## REFACTOR Workflow

- No spec changes
- All existing E2E must pass
- Reference affected features in commits

---

<!-- @section:quick-ref -->

## Quick Reference

| Question | Answer |
|----------|--------|
| New route? | FEATURE workflow |
| New workflow? | FEATURE workflow |
| Enhancing existing? | IMPROVEMENT workflow |
| Bug fix? | FIX workflow |
| Just cleanup? | REFACTOR workflow |
