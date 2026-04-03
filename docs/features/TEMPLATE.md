<!-- @feature F-XXX-NNN -->
<!-- @status draft | dev | review | live | deprecated -->
<!-- @e2e F-XXX-NNN-feature-name.spec.ts -->
<!-- @section:overview -->

# Feature Name

> One-line description of what this feature does.

---

<!-- @section:user-story -->

## User Story

**As a** [role]
**I want to** [action]
**So that** [outcome]

---

<!-- @section:workflow -->

## Workflow Steps

### Happy Path

1. User does X
2. User sees Y
3. User taps Z
4. System responds with W

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty state | Show empty component |
| Network offline | Queue action |
| Error | Show retry option |

---

<!-- @section:routes -->

## Routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/feature` | List view | Yes |
| `/feature/[id]` | Detail | Yes |

---

<!-- @section:components -->

## Components

| Component | Purpose |
|-----------|---------|
| `FeatureList.svelte` | List container |
| `FeatureCard.svelte` | Individual item |

---

<!-- @section:api -->

## API Contracts

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/feature` | GET | List all |
| `/api/feature/[id]` | GET | Get one |

---

<!-- @section:e2e -->

## E2E Test Scenarios

- [ ] Happy path
- [ ] Empty state
- [ ] Error state
- [ ] Mobile viewport

---

<!-- @section:acceptance -->

## Acceptance Criteria

- [ ] All routes render
- [ ] E2E passes
- [ ] Mobile works
- [ ] No horizontal scroll
- [ ] Icons + text on all controls

---

<!-- @section:changelog -->

## Changelog

| Date | Change | Type |
|------|--------|------|
| YYYY-MM-DD | Initial spec | feature |
