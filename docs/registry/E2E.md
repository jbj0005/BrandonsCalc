<!-- @registry E2E -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# E2E Test Registry

> Maps user workflows to Playwright test files.
> Every feature MUST have E2E coverage before going live.

---

<!-- @section:test-index -->

## Test Index

| Test File | Features | Workflow | Critical | Status |
|-----------|----------|----------|----------|--------|
| | | | | |

---

<!-- @section:coverage-requirements -->

## Coverage Requirements

### Every Feature Must Have

- [ ] Happy path test
- [ ] Empty state test
- [ ] Error state test
- [ ] Mobile viewport test

---

<!-- @section:test-naming -->

## Test Naming Convention

```
e2e/
├── features/
│   └── F-XXX-NNN-feature-name.spec.ts
├── flows/
│   └── multi-feature-flow.spec.ts
└── smoke/
    └── critical-paths.spec.ts
```

---

<!-- @section:running-tests -->

## Running Tests

```bash
npm run test:e2e                    # All tests
npm run test:e2e -- --grep "F-XXX"  # Specific feature
npm run test:e2e -- --project=mobile # Mobile only
```
