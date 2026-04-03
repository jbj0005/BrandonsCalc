<!-- @spec SCANNING_CONVENTIONS -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Scanning Conventions

> How agents and tools navigate code without line numbers.
> Section anchors are **stable** across refactors.

---

<!-- @section:why -->

## Why Section Anchors

| Without Anchors | With Anchors |
|-----------------|--------------|
| "Go to line 147" | "Go to `@section:actions`" |
| Breaks after any edit | Stable across refactors |
| Requires full file read | Grep-able, indexed |
| Context-dependent | Self-documenting |

**Token savings:** 60-80% reduction in context reads.

---

<!-- @section:universal-format -->

## Universal Anchor Format

### File Identity (Required at top of every file)

```
// @<type> <Name>
// @spec <SPEC_NAME>.md
// @purpose <one-line description>
```

### Section Markers

```
// @section:<name>
```

### Sub-Item Markers (within sections)

```
// @action:<name>
// @handler:<method>
// @field:<name>
```

---

<!-- @section:by-file-type -->

## Anchors by File Type

### Components (`*.svelte` / `*.tsx`)

```svelte
<!-- @component CustomerCard -->
<!-- @spec UI_CONSTRAINTS.md -->

<!-- @section:props -->
<!-- @section:state -->
<!-- @section:lifecycle -->
<!-- @section:handlers -->
<!-- @section:template -->
```

### Stores (`*.store.ts`)

```typescript
// @store RouteStore
// @spec STORE_CONVENTIONS.md

// @section:types
// @section:initial-state
// @section:actions
// @section:selectors
// @section:subscriptions
```

### Routes (`+page.server.ts`)

```typescript
// @route /customers/[id]
// @spec ROUTE_RULES.md

// @section:load
// @section:actions
// @action:update-status
// @action:record-payment
```

### API Endpoints (`+server.ts`)

```typescript
// @api /api/sync
// @spec API_CONTRACTS.md

// @section:validation
// @section:auth
// @section:handlers
// @handler:GET
// @handler:POST
// @section:error-handling
```

---

<!-- @section:standard-sections -->

## Standard Section Names

| Section | Purpose |
|---------|---------|
| `types` | Type definitions |
| `props` | Component props |
| `state` | Local state |
| `initial-state` | Store initial state |
| `actions` | Mutations, handlers |
| `selectors` | Derived state |
| `handlers` | Event handlers |
| `lifecycle` | onMount, onDestroy |
| `template` | Markup/JSX |
| `load` | SvelteKit load function |
| `guards` | Auth/access checks |
| `validation` | Input validation |
| `error-handling` | Error boundaries |
| `exports` | Public API |

---

<!-- @section:quick-ref -->

## Quick Reference

| Question | Answer |
|----------|--------|
| What anchor for components? | `@component` |
| What anchor for stores? | `@store` |
| How to mark sections? | `// @section:name` |
| Why not line numbers? | They break on any edit |
