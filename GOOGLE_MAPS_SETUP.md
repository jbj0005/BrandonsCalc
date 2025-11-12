# Google Maps Map ID Setup

## ⚠️ CRITICAL: Map ID Required for Advanced Markers

The new `AdvancedMarkerElement` API **requires** a Map ID to function. Without it, dealer maps will not display markers.

---

## 📋 Setup Steps

### 1. Go to Google Cloud Console
Visit: https://console.cloud.google.com/google/maps-apis/studio/maps

### 2. Create a Map ID

1. Click **"CREATE MAP ID"**
2. Fill in the form:
   - **Map name**: `BrandonsCalc Production` (or whatever you prefer)
   - **Map type**: Select **"JavaScript"**
   - **Description**: "Map ID for dealer locations and directions"
3. Click **"SAVE"**

### 3. Copy the Map ID

After creation, you'll see a Map ID like:
```
abc123def456
```

### 4. Add to Environment Variables

**Local Development (.env):**
```bash
VITE_GOOGLE_MAPS_MAP_ID=abc123def456
```

**Production (Vite):**
Add to your hosting platform's environment variables:
- Vercel: Settings → Environment Variables
- Netlify: Site settings → Build & deploy → Environment
- Railway: Variables tab

**Supabase (if using Edge Functions):**
```bash
supabase secrets set GOOGLE_MAPS_MAP_ID=abc123def456
```

### 5. Restart Dev Server

```bash
npm run dev
```

---

## ✅ Verification

After adding the Map ID, you should see:
- ✅ No warning: "map is initialized without a valid Map ID"
- ✅ Dealer markers appear as modern red pins
- ✅ Markers clickable with info windows

---

## 🔧 Troubleshooting

### Error: "Map configuration error - contact support"
**Cause**: Map ID not set in environment variables
**Fix**: Follow steps 3-5 above

### Warning: "Advanced Markers will not work"
**Cause**: Map ID is invalid or not applied to the API key
**Fix**:
1. Verify Map ID exists in Google Cloud Console
2. Ensure API key has Maps JavaScript API enabled
3. Clear browser cache and restart dev server

### Markers don't appear
**Cause**: Map ID might be for wrong environment (Vector vs Raster)
**Fix**: Create a new Map ID with type "JavaScript"

---

## 📚 Additional Resources

- [Map IDs Documentation](https://developers.google.com/maps/documentation/javascript/get-map-id)
- [Advanced Markers Guide](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
- [Migration Guide](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration)

---

## 💡 Notes

- Map IDs are **free** - no additional cost beyond standard Maps API usage
- You can create multiple Map IDs (dev, staging, production)
- Map IDs allow custom styling (future enhancement opportunity)
- Required for all new Google Maps projects after Feb 2024
