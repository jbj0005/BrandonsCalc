<!-- @spec GOTCHAS_REACT_NEXTJS -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# React / Next.js Gotchas (Agent Trap List)

> Prevents common mistakes when writing React and Next.js code.
> **Read this BEFORE writing any React code.**

---

<!-- @section:definitions -->

## Definitions

| Term | Meaning |
|------|---------|
| RSC | React Server Components (render on server, no client JS) |
| Client Component | Component with `'use client'` directive |
| Server Action | Async function with `'use server'` directive |
| SSR | Server-Side Rendering (HTML + hydration) |
| ISR | Incremental Static Regeneration |

---

<!-- @section:nextjs-app-router -->

## Next.js App Router (v13+)

> **This project uses App Router. Do NOT use Pages Router patterns.**

| Pages Router (OLD) | App Router (USE THIS) |
|--------------------|-----------------------|
| `pages/index.tsx` | `app/page.tsx` |
| `getServerSideProps` | Server Component or `fetch` |
| `getStaticProps` | Server Component with caching |
| `useRouter` from `next/router` | `useRouter` from `next/navigation` |
| `_app.tsx` | `layout.tsx` |
| `_document.tsx` | `layout.tsx` with `<html>` |
| API routes in `pages/api` | Route handlers in `app/api/*/route.ts` |

---

<!-- @section:quick-rules -->

## Quick Rules

| Rule | Agents Often Do | Correct Way |
|------|-----------------|-------------|
| Server vs Client | Everything client-side | Default to Server Components |
| Data fetching | `useEffect` + `fetch` | Fetch in Server Components |
| Forms | `onSubmit` + `fetch` | Server Actions |
| State | Lift all state up | Colocate, minimize client state |
| Routing | `router.push()` everywhere | `<Link>` for navigation |
| Images | `<img>` tag | `<Image>` from `next/image` |
| Fonts | Import in CSS | `next/font` |
| Environment | `process.env` anywhere | Server only, use `NEXT_PUBLIC_` for client |

---

<!-- @section:priority-table -->

## Gotchas by Priority

| P | Category | Wrong | Right |
|---|----------|-------|-------|
| 1 | Components | `'use client'` everywhere | Server Components by default |
| 1 | Data | `useEffect` for initial data | Fetch in Server Component |
| 1 | Forms | `onSubmit` + API call | Server Actions |
| 1 | State | `useState` for server data | Props from Server Component |
| 1 | Secrets | `process.env.API_KEY` in client | Server only, never expose |
| 1 | Routing | `router.push()` for links | `<Link href="">` |
| 1 | Images | `<img src="">` | `<Image src="" alt="" />` |
| 2 | Async | `async` Client Component | Move async to Server Component |
| 2 | Hooks | Hooks in Server Component | `'use client'` or lift state |
| 2 | Context | Context everywhere | Server Components + props |

---

<!-- @section:server-client -->

## Server vs Client Components

### Mistake: Making Everything Client

**Wrong**:
```tsx
'use client'; // Unnecessary!

export default function ProductList({ products }) {
  return (
    <ul>
      {products.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

**Right** (Server Component - no directive needed):
```tsx
// No 'use client' - this is a Server Component by default
export default function ProductList({ products }) {
  return (
    <ul>
      {products.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

### When to Use Client Components

Only add `'use client'` when you need:
- `useState`, `useEffect`, `useReducer`
- Event handlers (`onClick`, `onChange`)
- Browser APIs (`window`, `document`, `localStorage`)
- Custom hooks that use state/effects

---

<!-- @section:data-fetching -->

## Data Fetching

### Mistake: useEffect for Initial Data

**Wrong**:
```tsx
'use client';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading...</p>;
  return <ProductList products={products} />;
}
```

**Right** (Server Component):
```tsx
// app/products/page.tsx
async function getProducts() {
  const res = await fetch('https://api.example.com/products', {
    next: { revalidate: 60 } // Cache for 60 seconds
  });
  return res.json();
}

export default async function ProductsPage() {
  const products = await getProducts();
  return <ProductList products={products} />;
}
```

---

<!-- @section:server-actions -->

## Server Actions

### Mistake: API Routes for Forms

**Wrong**:
```tsx
'use client';

export default function ContactForm() {
  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    await fetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(formData))
    });
  }

  return <form onSubmit={handleSubmit}>...</form>;
}
```

**Right** (Server Action):
```tsx
// app/contact/page.tsx
async function submitContact(formData: FormData) {
  'use server';

  const email = formData.get('email') as string;
  const message = formData.get('message') as string;

  // Validate
  if (!email || !message) {
    return { error: 'All fields required' };
  }

  // Save to DB, send email, etc.
  await db.contacts.create({ email, message });

  return { success: true };
}

export default function ContactPage() {
  return (
    <form action={submitContact}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      <button type="submit">Send</button>
    </form>
  );
}
```

---

<!-- @section:hooks-state -->

## Hooks & State

### Mistake: useState for Server Data

**Wrong**:
```tsx
'use client';

export default function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  return <div>{user?.name}</div>;
}
```

**Right** (Fetch in parent Server Component):
```tsx
// app/user/[id]/page.tsx (Server Component)
export default async function UserPage({ params }) {
  const user = await fetchUser(params.id);
  return <UserProfile user={user} />;
}

// components/UserProfile.tsx (can be server or client)
export function UserProfile({ user }) {
  return <div>{user.name}</div>;
}
```

### Mistake: Hooks in Server Components

**Wrong**:
```tsx
// No 'use client' directive
export default function Counter() {
  const [count, setCount] = useState(0); // ERROR!
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Right**:
```tsx
'use client';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

---

<!-- @section:routing -->

## Routing & Navigation

### Mistake: router.push for Links

**Wrong**:
```tsx
'use client';
import { useRouter } from 'next/navigation';

export default function Nav() {
  const router = useRouter();
  return (
    <button onClick={() => router.push('/about')}>
      About
    </button>
  );
}
```

**Right**:
```tsx
import Link from 'next/link';

export default function Nav() {
  return (
    <Link href="/about">About</Link>
  );
}
```

### When to Use useRouter

Only use `useRouter` for:
- Programmatic navigation after an action
- Reading current route/params in client components
- Back/forward navigation

```tsx
'use client';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();

  async function handleLogin(formData: FormData) {
    const result = await login(formData);
    if (result.success) {
      router.push('/dashboard'); // After successful action
    }
  }

  return <form action={handleLogin}>...</form>;
}
```

---

<!-- @section:images-fonts -->

## Images & Fonts

### Mistake: Raw img Tags

**Wrong**:
```tsx
<img src="/hero.jpg" alt="Hero" />
```

**Right**:
```tsx
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority // For above-the-fold images
/>
```

### Mistake: CSS Font Imports

**Wrong**:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');
```

**Right**:
```tsx
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

---

<!-- @section:environment -->

## Environment Variables

### Mistake: Exposing Secrets

**Wrong**:
```tsx
// This exposes your secret to the browser!
const apiKey = process.env.API_KEY;
```

**Right**:
```tsx
// Server only (no NEXT_PUBLIC_ prefix)
// Can only be used in Server Components, Route Handlers, Server Actions
const apiKey = process.env.API_KEY;

// Client-safe (NEXT_PUBLIC_ prefix)
const publicKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
```

---

<!-- @section:typescript -->

## TypeScript

### Page Props Types

```tsx
// app/users/[id]/page.tsx
interface PageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function UserPage({ params, searchParams }: PageProps) {
  const user = await getUser(params.id);
  return <div>{user.name}</div>;
}
```

### Server Action Types

```tsx
'use server';

interface ActionResult {
  success?: boolean;
  error?: string;
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const name = formData.get('name') as string;

  if (!name) {
    return { error: 'Name is required' };
  }

  await db.users.create({ name });
  return { success: true };
}
```

---

<!-- @section:checklist -->

## Pre-Commit Checklist

- [ ] Server Components by default (no unnecessary `'use client'`)
- [ ] Data fetched in Server Components, not `useEffect`
- [ ] Forms use Server Actions, not API routes
- [ ] Navigation uses `<Link>`, not `router.push()`
- [ ] Images use `<Image>` from `next/image`
- [ ] Fonts use `next/font`
- [ ] Secrets have no `NEXT_PUBLIC_` prefix
- [ ] Client-exposed env vars use `NEXT_PUBLIC_` prefix
- [ ] No hooks in Server Components
- [ ] Async/await only in Server Components
- [ ] TypeScript types for page props and actions
