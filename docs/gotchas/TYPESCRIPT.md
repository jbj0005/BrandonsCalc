<!-- @spec GOTCHAS_TYPESCRIPT -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# TypeScript Gotchas (Agent Trap List)

> Prevents common TypeScript mistakes that cause runtime errors.
> **Read this BEFORE writing any TypeScript code.**

---

<!-- @section:definitions -->

## Definitions

| Term | Meaning |
|------|---------|
| `any` | Disables type checking (avoid!) |
| `unknown` | Type-safe alternative to `any` |
| `never` | Type for impossible values |
| Narrowing | Refining types with conditionals |
| Type Guard | Function that narrows types |

---

<!-- @section:quick-rules -->

## Quick Rules

| Rule | Agents Often Do | Correct Way |
|------|-----------------|-------------|
| Unknown data | `as SomeType` | Type guards + validation |
| Null handling | Ignore nulls | Optional chaining `?.` |
| Array methods | No callback types | Explicit parameter types |
| Object access | Direct access | Check property exists |
| Async errors | Ignore catch type | Type error as `unknown` |
| Form data | `as string` cast | `String()` wrapper |

---

<!-- @section:priority-table -->

## Gotchas by Priority

| P | Category | Wrong | Right |
|---|----------|-------|-------|
| 1 | Casting | `value as Type` | Type guard or validation |
| 1 | Any | `any` type | `unknown` + narrowing |
| 1 | Null | `user.name` | `user?.name` |
| 1 | Arrays | `.find(x => ...)` | `.find((x: Type) => ...)` |
| 1 | Errors | `catch (e)` | `catch (e: unknown)` |
| 1 | Forms | `formData.get('x') as string` | `String(formData.get('x') ?? '')` |
| 2 | Objects | `obj[key]` | Check key exists first |
| 2 | Unions | Ignore possibilities | Handle all union members |
| 2 | Enums | String enums | `as const` objects |

---

<!-- @section:type-assertions -->

## Type Assertions

### Mistake: Unsafe Type Casting

**Wrong**:
```ts
const user = data as User; // Could be anything!
user.name.toUpperCase(); // Runtime error if data is null
```

**Right** (Type Guard):
```ts
function isUser(data: unknown): data is User {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    typeof (data as User).name === 'string'
  );
}

if (isUser(data)) {
  user.name.toUpperCase(); // Safe!
}
```

**Right** (Validation Library):
```ts
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const result = UserSchema.safeParse(data);
if (result.success) {
  const user = result.data; // Typed as User
}
```

---

<!-- @section:null-handling -->

## Null & Undefined Handling

### Mistake: Ignoring Null Possibilities

**Wrong**:
```ts
const user = getUser(id);
console.log(user.name); // Error if user is null!
```

**Right** (Optional Chaining):
```ts
const user = getUser(id);
console.log(user?.name); // undefined if user is null

// With default
const name = user?.name ?? 'Unknown';
```

**Right** (Early Return):
```ts
const user = getUser(id);
if (!user) {
  throw new Error('User not found');
}
// TypeScript now knows user is not null
console.log(user.name);
```

### Mistake: Non-null Assertion Operator

**Wrong**:
```ts
const user = getUser(id);
console.log(user!.name); // Dangerous! Bypasses null check
```

**Right**:
```ts
const user = getUser(id);
if (user) {
  console.log(user.name);
}
```

---

<!-- @section:array-methods -->

## Array Methods

### Mistake: Implicit Any in Callbacks

**Wrong**:
```ts
const users: User[] = getUsers();
const admin = users.find(u => u.role === 'admin'); // 'u' may be 'any'
```

**Right** (Explicit Type):
```ts
interface User {
  id: string;
  role: string;
}

const users: User[] = getUsers();
const admin = users.find((u: User) => u.role === 'admin');
```

**Right** (Type the Array):
```ts
const users = getUsers() as User[]; // Type once
const admin = users.find(u => u.role === 'admin'); // 'u' inferred
```

### Mistake: Assuming find() Returns Value

**Wrong**:
```ts
const user = users.find(u => u.id === id);
console.log(user.name); // Error: user might be undefined
```

**Right**:
```ts
const user = users.find(u => u.id === id);
if (user) {
  console.log(user.name);
}

// Or with non-null assertion ONLY if you're certain
const user = users.find(u => u.id === id)!; // Only if guaranteed
```

---

<!-- @section:error-handling -->

## Error Handling

### Mistake: Untyped Catch

**Wrong**:
```ts
try {
  await doSomething();
} catch (error) {
  console.log(error.message); // 'error' is 'unknown' in strict mode
}
```

**Right**:
```ts
try {
  await doSomething();
} catch (error: unknown) {
  if (error instanceof Error) {
    console.log(error.message);
  } else {
    console.log('Unknown error:', error);
  }
}
```

**Right** (Helper Function):
```ts
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

try {
  await doSomething();
} catch (error: unknown) {
  console.log(getErrorMessage(error));
}
```

---

<!-- @section:form-data -->

## FormData Handling

### Mistake: Unsafe Casting

**Wrong**:
```ts
const email = formData.get('email') as string;
// Could be null or File!
```

**Right**:
```ts
// Pattern 1: String wrapper
const email = String(formData.get('email') ?? '').trim();

// Pattern 2: Type guard
function getFormString(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

const email = getFormString(formData, 'email');
```

---

<!-- @section:object-access -->

## Object Access

### Mistake: Unchecked Property Access

**Wrong**:
```ts
function getValue(obj: Record<string, unknown>, key: string) {
  return obj[key].toString(); // obj[key] might be undefined!
}
```

**Right**:
```ts
function getValue(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  if (value === undefined) {
    throw new Error(`Key "${key}" not found`);
  }
  return String(value);
}
```

### Mistake: Object.keys Type

**Wrong**:
```ts
const user = { name: 'John', age: 30 };
Object.keys(user).forEach(key => {
  console.log(user[key]); // Error: can't index with string
});
```

**Right**:
```ts
const user = { name: 'John', age: 30 };

// Option 1: Type assertion
(Object.keys(user) as Array<keyof typeof user>).forEach(key => {
  console.log(user[key]);
});

// Option 2: Object.entries
Object.entries(user).forEach(([key, value]) => {
  console.log(key, value);
});
```

---

<!-- @section:unions -->

## Union Types

### Mistake: Not Handling All Cases

**Wrong**:
```ts
type Status = 'pending' | 'approved' | 'rejected';

function getColor(status: Status) {
  if (status === 'pending') return 'yellow';
  if (status === 'approved') return 'green';
  // Missing 'rejected'!
}
```

**Right** (Exhaustive Check):
```ts
type Status = 'pending' | 'approved' | 'rejected';

function getColor(status: Status): string {
  switch (status) {
    case 'pending': return 'yellow';
    case 'approved': return 'green';
    case 'rejected': return 'red';
    default:
      // This ensures all cases are handled
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
  }
}
```

---

<!-- @section:enums -->

## Enums vs Const Objects

### Mistake: String Enums

**Wrong**:
```ts
enum Status {
  Pending = 'pending',
  Approved = 'approved',
}
// Enums have quirks and generate extra code
```

**Right** (Const Object):
```ts
const Status = {
  Pending: 'pending',
  Approved: 'approved',
} as const;

type Status = typeof Status[keyof typeof Status];
// Status = 'pending' | 'approved'
```

---

<!-- @section:generics -->

## Generics

### Mistake: Overly Specific Types

**Wrong**:
```ts
function first(arr: string[]): string {
  return arr[0];
}
// Only works with strings!
```

**Right**:
```ts
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const num = first([1, 2, 3]); // number | undefined
const str = first(['a', 'b']); // string | undefined
```

### Mistake: Missing Constraints

**Wrong**:
```ts
function getLength<T>(item: T): number {
  return item.length; // Error: T doesn't have .length
}
```

**Right**:
```ts
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}

getLength('hello'); // 5
getLength([1, 2, 3]); // 3
```

---

<!-- @section:checklist -->

## Pre-Commit Checklist

- [ ] No `any` types (use `unknown` + narrowing)
- [ ] No unsafe type assertions (`as Type`)
- [ ] Null/undefined handled with `?.` or guards
- [ ] Array method callbacks have explicit types
- [ ] Catch blocks type error as `unknown`
- [ ] FormData uses `String()` wrapper, not `as string`
- [ ] Object property access checks for undefined
- [ ] Union types exhaustively handled
- [ ] Using `as const` objects instead of enums
- [ ] Generics have appropriate constraints
