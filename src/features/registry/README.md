# Features Registry

Centralized registry of all application features and behaviors, organized by interaction type for easy discovery, debugging, and understanding of dependencies.

## Purpose

The Features Registry solves several problems:

1. **Feature Discovery** - Quickly find where a behavior is implemented
2. **Dependency Tracking** - Understand what each feature depends on
3. **Debugging** - Common issues and solutions documented alongside features
4. **Consistency** - Reusable validation rules, toast messages, and configurations
5. **Onboarding** - New developers can quickly understand how features work

## Organization

Features are organized by **interaction type**:

- **Hover** - Mouse hover interactions (dropdowns, tooltips, sliders)
- **Click** - Click handlers and button actions
- **Keyboard** - Keyboard shortcuts (ESC, Tab, Arrow keys)
- **Form** - Form validation and submission
- **Auto-Populate** - Auto-fill behaviors (location, down payment, trade-in)
- **API** - API calls and endpoints
- **Cache** - Caching strategies and configurations
- **Toast** - Toast notifications and templates
- **Modal** - Modal triggers and management
- **Realtime** - Realtime subscriptions

## Quick Start

```typescript
import registry from '@/features/registry';

// Find all hover behaviors
const hoverBehaviors = registry.findByCategory('hover');

// Find features that depend on Google Maps
const mapsFeatures = registry.findByDependency('google-maps');

// Find specific feature
const feature = registry.findFeature('hover-profile-dropdown-open');

// Search for features
const results = registry.searchFeatures('dropdown');

// Print summary
registry.printRegistrySummary();
```

## Using Configurations

The registry exports executable configurations that can be used in your code:

```typescript
import { HOVER_CONFIGS, VALIDATION_RULES, VALIDATORS, API_ENDPOINTS, CACHE_TTL, TOAST_MESSAGES } from '@/features/registry';

// Use hover delay config
setTimeout(() => {
  setShowDropdown(true);
}, HOVER_CONFIGS.PROFILE_DROPDOWN_OPEN_DELAY);

// Use validation
const error = VALIDATORS.email('test@example.com');

// Use validation rule
<Input
  validation={VALIDATION_RULES.email}
  ...
/>

// Use toast template
toast.push(TOAST_MESSAGES.SIGN_IN_SUCCESS);

// Use API endpoint
fetch(`${API_ENDPOINTS.LENDER_RATES}?source=nfcu`);

// Use cache TTL
const cacheExpiry = Date.now() + CACHE_TTL.LENDER_RATES;
```

## Feature Structure

Each feature has the following metadata:

```typescript
{
  id: 'unique-kebab-case-id',
  name: 'Human Readable Name',
  description: 'Detailed description of what this feature does',
  category: 'hover' | 'click' | 'keyboard' | ...,
  location: [
    {
      file: 'src/path/to/file.tsx',
      lines: '100-150',
      function: 'functionName',
    },
  ],
  dependencies: [
    {
      type: 'google-maps' | 'supabase' | 'feature' | ...,
      name: 'Dependency Name',
      required: true,
      notes: 'Additional context',
    },
  ],
  triggers: ['What activates this feature'],
  effects: ['What happens when triggered'],
  config: {
    delay: 200,
    validation: { ... },
    endpoint: '/api/...',
    // ... executable configuration
  },
  examples: ['Code examples'],
  debugging: [
    {
      issue: 'Common problem',
      solution: 'How to fix it',
    },
  ],
}
```

## Common Use Cases

### Finding All Features in a File

```typescript
import { findByFile } from '@/features/registry';

const features = findByFile('CalculatorApp.tsx');
console.log(`Found ${features.length} features in CalculatorApp.tsx`);
```

### Understanding Dependencies

```typescript
import { findByDependency, getDependencyGraph } from '@/features/registry';

// Find all features that need Google Maps
const mapsFeatures = findByDependency('google-maps');

// Get full dependency graph
const graph = getDependencyGraph();
console.log('Feature dependencies:', graph);
```

### Debugging Feature Conflicts

```typescript
import { getFeaturesWithDelays } from '@/features/registry';

// Find all features with delays (potential timing conflicts)
const delayedFeatures = getFeaturesWithDelays();
delayedFeatures.forEach(f => {
  console.log(`${f.name}: ${f.config.delay}ms`);
});
```

### Validating the Registry

```typescript
import { validateRegistry } from '@/features/registry';

const { valid, errors } = validateRegistry();
if (!valid) {
  console.error('Registry validation errors:', errors);
}
```

## Registry Files

- **`types.ts`** - TypeScript types and interfaces
- **`hover-behaviors.ts`** - All hover interactions
- **`form-validations.ts`** - All validation rules and functions
- **`api-cache.ts`** - API endpoints and caching strategies
- **`keyboard-shortcuts.ts`** - Keyboard handlers
- **`toast-messages.ts`** - Toast notification templates
- **`auto-populate.ts`** - Auto-fill behaviors
- **`modal-triggers.ts`** - Modal open/close triggers
- **`index.ts`** - Main registry with helper functions

## Adding New Features

To add a new feature:

1. Choose the appropriate registry file based on interaction type
2. Add your feature to the features array:

```typescript
export const hoverFeatures: Feature[] = [
  // ... existing features
  {
    id: 'hover-my-new-feature',
    name: 'My New Feature',
    description: 'Detailed description...',
    category: 'hover',
    location: [{ file: 'src/...', lines: '...' }],
    dependencies: [],
    triggers: ['Mouse enters...'],
    effects: ['Shows...'],
    config: { delay: 200 },
  },
];
```

3. If adding new config values, export them from the registry file:

```typescript
export const HOVER_CONFIGS = {
  // ... existing configs
  MY_NEW_DELAY: 300,
} as const;
```

4. The feature will automatically be included in the main registry

## Best Practices

1. **Keep Descriptions Clear** - Write descriptions that help others understand the feature
2. **Document Dependencies** - Always list what the feature needs to work
3. **Include Examples** - Code examples make it easier to understand usage
4. **Add Debugging Tips** - Document common issues you've encountered
5. **Use Executable Configs** - Export reusable configurations instead of magic numbers
6. **Update on Changes** - Keep the registry up-to-date when modifying features

## VS Code Integration

Add this to `.vscode/settings.json` for quick access:

```json
{
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "files.associations": {
    "*.registry.ts": "typescript"
  }
}
```

## Troubleshooting

### Feature not found?

Check the specific registry file for your interaction type. The main index re-exports all features.

### Circular dependencies?

Use `getDependencyGraph()` to visualize dependencies and find circular references.

### Validation not working?

Make sure you're using the exported `VALIDATORS` functions or `validate()` helper with `VALIDATION_RULES`.

## Future Enhancements

- [ ] Auto-generate documentation from JSDoc comments
- [ ] VS Code extension for feature search
- [ ] Runtime performance monitoring
- [ ] Feature flag integration
- [ ] Automated dependency graph visualization
