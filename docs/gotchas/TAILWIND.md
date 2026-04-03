<!-- @spec GOTCHAS_TAILWIND -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Tailwind CSS Gotchas (Agent Trap List)

> Prevents common mistakes when writing Tailwind CSS.
> **Read this BEFORE writing any styles.**

---

<!-- @section:definitions -->

## Definitions

| Term | Meaning |
|------|---------|
| Utility | Single-purpose class (`p-4`, `text-red-500`) |
| Design Token | Configured value in tailwind.config |
| Arbitrary Value | One-off value `[32px]` (avoid!) |
| Purge | Removing unused CSS in production |

---

<!-- @section:quick-rules -->

## Quick Rules

| Rule | Agents Often Do | Correct Way |
|------|-----------------|-------------|
| Values | Arbitrary `[14px]` | Design tokens `text-sm` |
| Colors | Hardcoded `#ff0000` | Theme colors `text-red-500` |
| Spacing | Random values | Consistent scale `p-4`, `m-6` |
| Responsive | Desktop first | Mobile first (`md:`, `lg:`) |
| Dynamic classes | Template strings | Complete class names |
| Dark mode | Separate styles | `dark:` variant |

---

<!-- @section:priority-table -->

## Gotchas by Priority

| P | Category | Wrong | Right |
|---|----------|-------|-------|
| 1 | Values | `w-[347px]` | `w-80` or config |
| 1 | Colors | `bg-[#1a1a1a]` | `bg-gray-900` |
| 1 | Dynamic | `` `text-${color}-500` `` | Full class names |
| 1 | Responsive | `lg:block md:block sm:hidden` | `hidden md:block` |
| 2 | Spacing | Inconsistent values | Stick to scale |
| 2 | Typography | `text-[14px]` | `text-sm` |
| 2 | Components | Repeat utilities | Extract component |

---

<!-- @section:arbitrary-values -->

## Arbitrary Values

### Mistake: Random Pixel Values

**Wrong**:
```html
<div class="w-[347px] h-[89px] mt-[13px] text-[14px]">
  <!-- Magic numbers everywhere -->
</div>
```

**Right** (Use design tokens):
```html
<div class="w-80 h-24 mt-3 text-sm">
  <!-- Consistent scale -->
</div>
```

**Right** (Extend config if needed):
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      width: {
        'card': '22rem',
      },
    },
  },
}
```

```html
<div class="w-card">...</div>
```

---

<!-- @section:colors -->

## Colors

### Mistake: Hardcoded Colors

**Wrong**:
```html
<div class="bg-[#1a73e8] text-[#ffffff]">
  <!-- No consistency, hard to maintain -->
</div>
```

**Right** (Use theme colors):
```html
<div class="bg-blue-600 text-white">
  <!-- Consistent, themeable -->
</div>
```

**Right** (Custom brand colors):
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
    },
  },
}
```

```html
<div class="bg-brand-500 text-white">...</div>
```

---

<!-- @section:dynamic-classes -->

## Dynamic Classes

### Mistake: String Interpolation

**Wrong**:
```jsx
// Tailwind CAN'T see these classes - they'll be purged!
<div className={`text-${color}-500 bg-${color}-100`}>
  {content}
</div>
```

**Right** (Complete class names):
```jsx
const colorClasses = {
  red: 'text-red-500 bg-red-100',
  blue: 'text-blue-500 bg-blue-100',
  green: 'text-green-500 bg-green-100',
};

<div className={colorClasses[color]}>
  {content}
</div>
```

**Right** (Safelist if dynamic):
```js
// tailwind.config.js
module.exports = {
  safelist: [
    'text-red-500', 'text-blue-500', 'text-green-500',
    'bg-red-100', 'bg-blue-100', 'bg-green-100',
  ],
}
```

---

<!-- @section:responsive -->

## Responsive Design

### Mistake: Desktop-First

**Wrong**:
```html
<!-- Starting from desktop, hiding on mobile -->
<div class="flex-row sm:flex-col xs:hidden">
```

**Right** (Mobile-first):
```html
<!-- Start mobile, enhance for larger screens -->
<div class="flex-col md:flex-row">
```

### Breakpoint Reference

| Prefix | Min Width | Usage |
|--------|-----------|-------|
| (none) | 0px | Mobile base |
| `sm:` | 640px | Large phones |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large screens |

### Mistake: Overriding Smaller Breakpoints

**Wrong**:
```html
<div class="hidden sm:block md:hidden lg:block">
  <!-- Confusing cascade -->
</div>
```

**Right**:
```html
<div class="hidden lg:block">
  <!-- Clear: hidden until lg -->
</div>
```

---

<!-- @section:spacing -->

## Spacing

### Mistake: Inconsistent Spacing

**Wrong**:
```html
<div class="p-3">
  <h1 class="mb-5">Title</h1>
  <p class="mt-7">Content</p>
  <button class="mt-11">Submit</button>
</div>
```

**Right** (Consistent scale):
```html
<div class="p-4">
  <h1 class="mb-4">Title</h1>
  <p class="mt-6">Content</p>
  <button class="mt-8">Submit</button>
</div>
```

### Spacing Scale Reference

| Class | Size | Pixels |
|-------|------|--------|
| `0` | 0 | 0px |
| `1` | 0.25rem | 4px |
| `2` | 0.5rem | 8px |
| `4` | 1rem | 16px |
| `6` | 1.5rem | 24px |
| `8` | 2rem | 32px |
| `12` | 3rem | 48px |
| `16` | 4rem | 64px |

---

<!-- @section:dark-mode -->

## Dark Mode

### Mistake: Separate Dark Stylesheets

**Wrong**:
```html
<!-- dark-theme.css -->
<link rel="stylesheet" href="dark-theme.css" />
```

**Right** (Tailwind dark mode):
```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  <h1 class="text-gray-800 dark:text-gray-100">Title</h1>
</div>
```

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class', // or 'media' for system preference
}
```

---

<!-- @section:component-classes -->

## Component Patterns

### Mistake: Repeating Long Class Lists

**Wrong**:
```html
<button class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:ring-2 focus:ring-blue-300">
  Save
</button>
<button class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:ring-2 focus:ring-blue-300">
  Submit
</button>
```

**Right** (Extract component):
```jsx
// Button.jsx
function Button({ children, variant = 'primary' }) {
  const base = 'px-4 py-2 rounded-lg focus:ring-2';
  const variants = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-300',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
  };

  return (
    <button className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}
```

**Right** (Or use @apply sparingly):
```css
/* Only for truly repeated patterns */
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-blue-500 text-white rounded-lg
           hover:bg-blue-600 focus:ring-2 focus:ring-blue-300;
  }
}
```

---

<!-- @section:accessibility -->

## Accessibility

### Mistake: Low Contrast

**Wrong**:
```html
<p class="text-gray-400 bg-gray-100">
  <!-- Poor contrast ratio -->
</p>
```

**Right**:
```html
<p class="text-gray-700 bg-gray-100">
  <!-- Good contrast for readability -->
</p>
```

### Mistake: Missing Focus States

**Wrong**:
```html
<button class="bg-blue-500 outline-none">
  <!-- No visible focus indicator! -->
</button>
```

**Right**:
```html
<button class="bg-blue-500 focus:ring-2 focus:ring-blue-300 focus:ring-offset-2">
  <!-- Clear focus indicator -->
</button>
```

---

<!-- @section:checklist -->

## Pre-Commit Checklist

- [ ] No arbitrary values `[px]` (use design tokens)
- [ ] No hardcoded colors (use theme)
- [ ] Dynamic classes use complete strings
- [ ] Mobile-first responsive design
- [ ] Consistent spacing scale
- [ ] Dark mode uses `dark:` variants
- [ ] Repeated patterns extracted to components
- [ ] Adequate color contrast
- [ ] Focus states visible
- [ ] Unused classes will be purged (no string interpolation)
