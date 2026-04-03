<!-- @spec GOTCHAS_SUPABASE -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Supabase Gotchas (Agent Trap List)

> Prevents common mistakes when working with Supabase.
> **Read this BEFORE writing any Supabase code.**

---

<!-- @section:definitions -->

## Definitions

| Term | Meaning |
|------|---------|
| RLS | Row Level Security - database-level access control |
| Anon Key | Public key for client-side, RLS enforced |
| Service Role | Admin key, bypasses RLS, server-only |
| Auth | Supabase authentication system |
| Realtime | Live subscriptions to database changes |

---

<!-- @section:quick-rules -->

## Quick Rules

| Rule | Agents Often Do | Correct Way |
|------|-----------------|-------------|
| Keys | Service role everywhere | Anon on client, service on server |
| RLS | Skip or disable | Always enable, write policies |
| Auth | Client-side only | Server-side verification |
| Queries | Trust client input | Validate + parameterize |
| Deletes | Direct delete | Soft delete or audit |
| Secrets | In client code | Server-side only |

---

<!-- @section:priority-table -->

## Gotchas by Priority

| P | Category | Wrong | Right |
|---|----------|-------|-------|
| 1 | Security | Service role on client | Anon key only on client |
| 1 | RLS | RLS disabled | RLS enabled + policies |
| 1 | Auth | Trust client session | Verify server-side |
| 1 | Secrets | Expose API keys | Environment variables |
| 1 | Queries | String concatenation | Parameterized queries |
| 2 | Errors | Ignore errors | Handle all error states |
| 2 | Types | No types | Generated types |
| 2 | Realtime | Subscribe everything | Subscribe selectively |

---

<!-- @section:security -->

## Security

### Mistake: Service Role Key on Client

**Wrong**:
```ts
// client-side code
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
// NEVER do this - exposes full database access!
```

**Right**:
```ts
// Client-side: anon key only
const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Server-side only: service role
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
const adminClient = createClient(url, SUPABASE_SERVICE_ROLE_KEY);
```

### Mistake: Disabled RLS

**Wrong**:
```sql
-- Table has no RLS
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name TEXT
);
-- Anyone with anon key can read/write all data!
```

**Right**:
```sql
-- Enable RLS
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  name TEXT
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their org's customers
CREATE POLICY "Users see own org customers"
  ON customers FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Policy: Users can only insert to their org
CREATE POLICY "Users insert own org customers"
  ON customers FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

---

<!-- @section:auth -->

## Authentication

### Mistake: Trusting Client Session

**Wrong**:
```ts
// Client component
const { data: { user } } = await supabase.auth.getUser();
// This user object could be manipulated!
```

**Right** (Server-side verification):
```ts
// hooks.server.ts or middleware
const { data: { user }, error } = await supabase.auth.getUser();

if (error || !user) {
  throw redirect(303, '/login');
}

// Now user is verified by Supabase servers
event.locals.user = user;
```

### Mistake: Using getSession() for Auth

**Wrong**:
```ts
// getSession() can be spoofed on the client
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  // User might not actually be authenticated!
}
```

**Right**:
```ts
// getUser() verifies with Supabase servers
const { data: { user }, error } = await supabase.auth.getUser();
if (user && !error) {
  // User is verified
}
```

---

<!-- @section:queries -->

## Queries

### Mistake: String Concatenation

**Wrong**:
```ts
// SQL injection vulnerability!
const { data } = await supabase
  .from('users')
  .select('*')
  .filter('name', 'eq', userInput); // userInput could be malicious
```

**Right** (RLS handles authorization):
```ts
// With RLS, the query is automatically scoped
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('name', userInput); // Safe if RLS is configured
```

### Mistake: Ignoring Errors

**Wrong**:
```ts
const { data } = await supabase.from('users').select('*');
// What if there's an error?
return data;
```

**Right**:
```ts
const { data, error } = await supabase.from('users').select('*');

if (error) {
  console.error('Failed to fetch users:', error);
  throw new Error('Could not load users');
}

return data;
```

### Mistake: Select All Columns

**Wrong**:
```ts
const { data } = await supabase.from('users').select('*');
// Fetches all columns, including sensitive ones
```

**Right**:
```ts
const { data } = await supabase
  .from('users')
  .select('id, name, email, created_at');
// Only fetch what you need
```

---

<!-- @section:relationships -->

## Relationships

### Mistake: Manual Joins

**Wrong**:
```ts
const { data: users } = await supabase.from('users').select('*');
const { data: profiles } = await supabase.from('profiles').select('*');
// Now manually join in JS - inefficient!
```

**Right** (Use Supabase relationships):
```ts
const { data } = await supabase
  .from('users')
  .select(`
    id,
    email,
    profile:profiles (
      full_name,
      avatar_url
    )
  `);
// Single query, Supabase handles the join
```

### Mistake: Wrong Foreign Key Reference

**Wrong**:
```ts
const { data } = await supabase
  .from('orders')
  .select(`
    *,
    customer:customers (*) // Ambiguous if multiple FKs
  `);
```

**Right** (Explicit FK reference):
```ts
const { data } = await supabase
  .from('orders')
  .select(`
    *,
    customer:customers!orders_customer_id_fkey (
      id,
      name
    )
  `);
```

---

<!-- @section:realtime -->

## Realtime

### Mistake: Subscribe to Everything

**Wrong**:
```ts
// Subscribes to ALL changes on the table
supabase
  .channel('all-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' },
    payload => console.log(payload))
  .subscribe();
```

**Right** (Filter subscriptions):
```ts
// Subscribe only to relevant changes
supabase
  .channel('room-messages')
  .on('postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${roomId}`
    },
    payload => handleNewMessage(payload.new))
  .subscribe();
```

### Mistake: Not Cleaning Up

**Wrong**:
```ts
useEffect(() => {
  const channel = supabase.channel('messages').subscribe();
  // No cleanup - memory leak!
}, []);
```

**Right**:
```ts
useEffect(() => {
  const channel = supabase
    .channel('messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      handleMessage)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

<!-- @section:types -->

## Types

### Mistake: No Type Generation

**Wrong**:
```ts
const { data } = await supabase.from('users').select('*');
// data is 'any' - no type safety
```

**Right** (Generate types):
```bash
# Generate types from your database
npx supabase gen types typescript --project-id YOUR_PROJECT > src/types/database.ts
```

```ts
import type { Database } from '@/types/database';

type User = Database['public']['Tables']['users']['Row'];

const supabase = createClient<Database>(url, key);
const { data } = await supabase.from('users').select('*');
// data is now typed as User[]
```

---

<!-- @section:storage -->

## Storage

### Mistake: Public Buckets for Private Files

**Wrong**:
```sql
-- Public bucket for user documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true);
-- Anyone can access any file!
```

**Right**:
```sql
-- Private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- RLS policy for access
CREATE POLICY "Users access own documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### Mistake: No File Validation

**Wrong**:
```ts
const { data } = await supabase.storage
  .from('avatars')
  .upload(file.name, file);
// Accepts any file type, any size
```

**Right**:
```ts
// Validate before upload
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

if (file.size > MAX_SIZE) {
  throw new Error('File too large');
}

if (!ALLOWED_TYPES.includes(file.type)) {
  throw new Error('Invalid file type');
}

const { data } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/${file.name}`, file, {
    contentType: file.type,
    upsert: false,
  });
```

---

<!-- @section:migrations -->

## Migrations

### Mistake: Direct Database Changes

**Wrong**:
```sql
-- Running this directly in SQL editor
ALTER TABLE users ADD COLUMN phone TEXT;
-- No record of the change!
```

**Right** (Use migrations):
```bash
# Create migration
npx supabase migration new add_phone_to_users
```

```sql
-- supabase/migrations/20240115_add_phone_to_users.sql
ALTER TABLE users ADD COLUMN phone TEXT;
```

```bash
# Apply migration
npx supabase db push
```

---

<!-- @section:checklist -->

## Pre-Commit Checklist

- [ ] Service role key only on server-side
- [ ] RLS enabled on all tables
- [ ] RLS policies written and tested
- [ ] Auth verified with `getUser()`, not `getSession()`
- [ ] Queries select only needed columns
- [ ] All query errors handled
- [ ] Types generated from database
- [ ] Realtime subscriptions filtered and cleaned up
- [ ] Storage buckets have appropriate policies
- [ ] File uploads validated (size, type)
- [ ] Database changes via migrations
