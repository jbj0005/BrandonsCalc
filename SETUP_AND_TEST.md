# Setup & Test Guide - Modal System

## 🎯 Current Status

✅ **Servers Running:**
- Frontend: http://localhost:3000/
- API: http://localhost:3002/

✅ **Code Fixed:**
- All localStorage references replaced with auth store
- All table names updated (garage_vehicles vs vehicles)
- Modal functions have debugging logs
- 400 error query fixed

⏳ **Needs Migration:**
- `garage_vehicles` table must be created in Supabase

---

## Step 1: Run Database Migration

### 🚀 Quick Method (Supabase Dashboard)

1. **Open Supabase SQL Editor**
   - Go to: https://app.supabase.com/project/txndueuqljeujlccngbj/sql
   - Click "New Query"

2. **Copy & Paste This SQL:**

```sql
-- ============================================
-- CREATE GARAGE VEHICLES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS garage_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nickname TEXT,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  vin TEXT,
  mileage INTEGER,
  condition TEXT CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  estimated_value NUMERIC(10, 2),
  payoff_amount NUMERIC(10, 2) DEFAULT 0,
  photo_url TEXT,
  notes TEXT,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_vehicles_user_id ON garage_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_created_at ON garage_vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_last_used ON garage_vehicles(last_used_at DESC NULLS LAST);

ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own garage vehicles"
  ON garage_vehicles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own garage vehicles"
  ON garage_vehicles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own garage vehicles"
  ON garage_vehicles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own garage vehicles"
  ON garage_vehicles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION increment_garage_vehicle_usage(vehicle_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE garage_vehicles
  SET
    times_used = COALESCE(times_used, 0) + 1,
    last_used_at = NOW()
  WHERE id = vehicle_id;
END;
$$ LANGUAGE plpgsql;
```

3. **Click "Run"** (or Cmd/Ctrl + Enter)

4. **Expected Result:**
   - ✅ Success message
   - Check Table Editor → should see `garage_vehicles` table

---

## Step 2: Test Modal System

### 🔍 Open Your App

1. **Go to:** http://localhost:3000/
2. **Open Browser Console** (F12 or Cmd+Option+I)
3. **Sign in** if not already authenticated

---

### Test 1: My Garage Modal

**Click:** Profile dropdown → "My Garage"

**Expected Console Logs:**
```
🚗 [My Garage] Opening modal...
✅ [My Garage] Modal opened, loading vehicles...
🔍 Querying garage_vehicles table...
```

**Expected Behavior:**
- ✅ Modal opens (overlay appears)
- ✅ Modal title shows "My Garage"
- ✅ Empty state OR vehicles list appears
- ✅ No 400 errors in Network tab
- ✅ No red errors in Console

**If Empty:**
- This is normal! You haven't added any vehicles yet
- Click "Add Vehicle" to test adding

**If 400 Error:**
- Check Network tab for exact error
- Verify migration ran successfully
- Check RLS policies are created

---

### Test 2: My Profile Modal

**Click:** Profile dropdown → "My Profile"

**Expected Console Logs:**
```
👤 [My Profile] Opening modal...
✅ [My Profile] Modal element found, loading profile data...
✅ [My Profile] Modal opened
```

**Expected Behavior:**
- ✅ Modal opens
- ✅ Profile form appears with your data
- ✅ Email, name, phone populated (if you entered them)
- ✅ No errors

---

### Test 3: My Offers Modal

**Click:** Profile dropdown → "My Offers"

**Expected Console Logs:**
```
📋 [My Offers] Opening modal...
✅ [My Offers] Modal opened, loading offers...
[my-offers] Loading offers for user: [your-user-id]
```

**Expected Behavior:**
- ✅ Modal opens
- ✅ "Active Offers" and "Closed Offers" tabs appear
- ✅ Empty state OR list of offers
- ✅ No errors

---

## Step 3: Test Adding Garage Vehicle

1. **Open My Garage modal**
2. **Click "Add Vehicle"** button
3. **Fill in form:**
   - Year: 2020
   - Make: Toyota
   - Model: Camry
   - Trim: LE
   - VIN: 1234567890ABCDEFG
   - Mileage: 50000
   - Condition: Good
   - Estimated Value: 18000
   - Payoff Amount: 12000

4. **Click "Save"**

**Expected:**
- ✅ "Vehicle added successfully" toast
- ✅ Form closes
- ✅ Vehicle appears in list
- ✅ Vehicle card shows all info

---

## Step 4: Test Vehicle Auto-Populate

1. **In My Garage**, click on a vehicle card
2. **Modal should close**
3. **Main calculator form should populate:**
   - ✅ Vehicle year, make, model filled in
   - ✅ Sale price slider set to asking_price OR estimated_value
   - ✅ Trade-in value set to estimated_value
   - ✅ Trade-in payoff set to payoff_amount

**Expected Console Log:**
```
✅ Profile loaded: [profile data]
🚗 [Garage] Loading 1 vehicles
Vehicle selected: [vehicle data]
```

---

## Troubleshooting

### Modal Won't Open

**Check Console:**
- Is there an error before the emoji log?
- Does `window.openMyGarageModal` exist?

**Fix:**
```javascript
// In browser console, test:
window.openMyGarageModal
// Should return: ƒ openMyGarageModal() { ... }
```

**If undefined:**
- Check app.js has: `window.openMyGarageModal = openMyGarageModal;`
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

---

### 400 Error: "relation garage_vehicles does not exist"

**Migration didn't run!**

1. Go to Supabase Dashboard → Table Editor
2. Check if `garage_vehicles` table exists
3. If not, run migration SQL again
4. Refresh browser

---

### 400 Error: "permission denied for table garage_vehicles"

**RLS policies not working!**

**Check in SQL Editor:**
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'garage_vehicles';
```

Should return 4 policies.

**If missing, run:**
```sql
-- Copy RLS policies from migration SQL above
```

---

### Modal Opens but No Data

**Check Network tab:**
- Look for Supabase requests
- Check response status (should be 200)
- Check response body (should have data or empty array)

**Check Console:**
- Are there any Supabase errors?
- Does auth store have user? Run: `useAuthStore.getState().user`

---

### Data Loads but Wrong Table

**Symptoms:**
- Garage shows vehicles you want to BUY (not own)
- Vehicle has dealer info, listing_id

**Problem:** Querying wrong table

**Check in app.js:**
```javascript
// My Garage should use:
.from("garage_vehicles")  // ✅ Correct

// NOT:
.from("vehicles")  // ❌ Wrong - this is for SAVED vehicles
```

---

## Success Criteria

✅ **All 3 modals open without errors**
✅ **Console shows debugging emoji logs**
✅ **No 400 errors in Network tab**
✅ **Can add vehicle to garage**
✅ **Selecting garage vehicle populates calculator**
✅ **Profile data loads and displays**

---

## Next Steps After Testing

Once modals work:

1. ✅ **Update AGENT_CONTEXT.md**
   - Mark modal system as ✅ Working
   - Add any new patterns discovered
   - Document any edge cases

2. 🚧 **Fix TypeScript errors** (if desired)
   ```bash
   npm run type-check
   ```

3. 🏗️ **Build for production**
   ```bash
   npm run build
   ```

4. 📊 **Test payment calculation**
   - Select vehicle
   - Verify monthly payment updates
   - Check all lenders load rates

---

## Quick Commands

```bash
# Restart servers if needed
npm run dev           # Terminal 1
PORT=3002 node server/server.js  # Terminal 2

# Check validation
bash .ai/quick-check.sh

# View logs
# Just watch browser console!
```

---

**Ready to test!** Open http://localhost:3000/ and start clicking those modals! 🚀
