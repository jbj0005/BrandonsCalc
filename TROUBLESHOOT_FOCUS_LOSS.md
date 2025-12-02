# Focus Loss Issue in Profile Modal - Address Field

## Problem
User can only type one character at a time in the address field (`LocationSearchPremium` component) within the profile modal. After each keystroke, the input loses focus.

## What Was Already Tried

### 1. Local State Pattern in UserProfileDropdown (lines 101-127)
Added local state for form fields to prevent parent re-renders during typing:
```tsx
const [localFullName, setLocalFullName] = useState(profile?.full_name || '');
const [localEmail, setLocalEmail] = useState(profile?.email || '');
const [localPhone, setLocalPhone] = useState(profile?.phone || '');
const [localDownPayment, setLocalDownPayment] = useState(...);
```
- Changed `Input` components to use local state + sync on blur
- **Result:** Fixed Full Name, Email, Phone, Down Payment fields - but Address still broken

### 2. Local State Pattern in LocationSearchPremium (lines 40-46)
Applied same pattern to the address component:
```tsx
const [localValue, setLocalValue] = useState(location);

useEffect(() => {
  setLocalValue(location);
}, [location]);
```
- Changed input to use `localValue` and `setLocalValue`
- Sync to parent only on blur
- **Result:** Still broken

## Root Cause Hypotheses

### Hypothesis A: Google Maps Web Component DOM Manipulation
The `useGoogleMapsAutocomplete` hook (lines 103-121 in the hook) physically moves the input element:
```tsx
// Move the existing input into the web component (slot="input")
inputEl.setAttribute('slot', 'input');
placeEl.appendChild(inputEl);
parent.appendChild(placeEl);
```
This DOM manipulation may conflict with React's reconciliation.

### Hypothesis B: Effect Re-running and Re-initializing Autocomplete
Check the dependency array at line 253 in `useGoogleMapsAutocomplete.ts`:
```tsx
}, [enabled, isLoaded, inputRef, types, JSON.stringify(componentRestrictions)]);
```
If any of these change, the effect re-runs, potentially destroying/recreating the autocomplete.

### Hypothesis C: Parent Component Re-render Cascade
When `onLocationChange` is called (even on blur), it updates profile state in parent, which may cause:
1. `UserProfileDropdown` re-render
2. `LocationSearchPremium` re-render
3. `useGoogleMapsAutocomplete` effect to re-evaluate
4. Potential autocomplete reinitialization

### Hypothesis D: The `activeSection` Conditional Rendering
In `UserProfileDropdown.tsx` line 499:
```tsx
location={activeSection === 'profile' ? profile?.street_address || '' : ''}
```
This ternary might cause the value to flicker during re-renders.

## Files to Investigate

| File | Lines | What to Check |
|------|-------|---------------|
| `src/hooks/useGoogleMapsAutocomplete.ts` | 83-253 | Effect cleanup/initialization logic, dependency array |
| `src/ui/components/LocationSearchPremium.tsx` | 27-186 | Component structure, when localValue syncs |
| `src/ui/components/UserProfileDropdown.tsx` | 515-550 | How LocationSearchPremium is rendered |

## Things to Try Next

### 1. Disable Autocomplete Temporarily
Comment out the `useGoogleMapsAutocomplete` call to see if the input works without it:
```tsx
// useGoogleMapsAutocomplete(inputRef, {...});
```
If this fixes it, the issue is definitely in the autocomplete hook.

### 2. Add Stable Key to LocationSearchPremium
In `UserProfileDropdown.tsx`, add a stable key:
```tsx
<LocationSearchPremium
  key="profile-address"
  location={...}
/>
```

### 3. Check for Re-mounting with useEffect Debug
Add logging in `useGoogleMapsAutocomplete.ts`:
```tsx
useEffect(() => {
  console.log('Autocomplete effect running', { enabled, isLoaded });
  // ...
}, [...]);
```
See if this logs on every keystroke.

### 4. Use Uncontrolled Input with Ref
Instead of controlled input, use an uncontrolled pattern:
```tsx
const inputRef = useRef<HTMLInputElement>(null);
// Don't use value prop, read from ref when needed
<input ref={inputRef} defaultValue={location} onBlur={() => ...} />
```

### 5. Debounce the Parent Update
Instead of updating parent on blur, debounce it:
```tsx
const debouncedUpdate = useMemo(
  () => debounce((val: string) => onLocationChange(val), 300),
  [onLocationChange]
);
```

### 6. Check if autocompleteElementRef.current Guard is Working
Line 98 in the hook:
```tsx
if (autocompleteElementRef.current) return;
```
Add logging to confirm this prevents re-initialization.

### 7. Move Autocomplete Init to a Separate Component
Create a wrapper that handles the autocomplete internally and only exposes callbacks, preventing parent re-renders from affecting it.

## Quick Debug Commands

```bash
# Search for all places location/address state is used
grep -rn "street_address\|onLocationChange" src/

# Check all useEffect dependencies in the autocomplete hook
grep -A5 "useEffect" src/hooks/useGoogleMapsAutocomplete.ts
```

## Related Files

- `src/hooks/useGoogleMapsAutocomplete.ts` - The autocomplete hook
- `src/ui/components/LocationSearchPremium.tsx` - The address input wrapper
- `src/ui/components/UserProfileDropdown.tsx` - The profile modal
- `src/hooks/useProfile.ts` - Profile state management
