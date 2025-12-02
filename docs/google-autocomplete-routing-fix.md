# Google Autocomplete & Routing Fix Notes

## Symptoms
- Autocomplete dropdown never appeared (no shadow root), even though Maps API loaded.
- Routing intermittently reported failures while autocomplete was broken.

## Root Causes
- The extended web component (`gmpx-place-autocomplete`) never registered in our build; the tag stayed undefined, so no suggestions rendered.
- Legacy Places web components (`gmpx-*`) from the extended component library were partially registered, causing constructor conflicts.

## Fixes Applied
1) **Replaced web component autocomplete with the modern Places “New” API**
   - Fetch predictions via `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions`.
   - Render our own dropdown (no DOM teleports), with interaction gating (only opens after user focus/typing).
   - On selection, hydrate details via `placePrediction.toPlace().fetchFields([...])` to get formatted address, components, and lat/lng.
   - File: `src/ui/components/LocationSearchPremium.tsx`.

2) **Removed legacy web-component dependency for autocomplete**
   - Stopped relying on `gmpx-place-autocomplete` entirely; removed registration attempts and slotting.

3) **Smoke probe updated to catch regressions**
   - `scripts/autocomplete-smoke.js` now:
     - Types a sample query and reports custom dropdown suggestions.
     - Runs a DirectionsService call (Miami → Orlando) to confirm routing is healthy.
   - Usage: `BASE_URL=http://localhost:3000/BrandonsCalc/ node scripts/autocomplete-smoke.js` (ensure `npm run dev` running and API key set).

4) **Interaction gating to prevent stray dropdown on load**
   - Dropdown only opens when the user focuses/types; blur closes it.
   - File: `src/ui/components/LocationSearchPremium.tsx`.

## Testing/Verification
- Run the smoke script (above) to validate both autocomplete and routing.
- Manual: type “Miami, FL” in the location input; suggestions should appear, select an item, and ensure downstream location-dependent flows (tax lookup, routing) update.

## Notes for Future Changes
- Keep using the “New” Places classes (`AutocompleteSuggestion`, `Place`) instead of the legacy web components/services.
- If Google changes the Places “New” API shapes, update the text extraction in `LocationSearchPremium.tsx` accordingly.
- The routing probe relies on `DirectionsService`; if routing breaks, the smoke script will surface a non-OK status.
