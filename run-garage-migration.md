# Run garage_vehicles Migration

## Option 1: Supabase Dashboard (Recommended - Easiest)

1. **Go to your Supabase Dashboard**
   - Visit: https://app.supabase.com/project/txndueuqljeujlccngbj
   - Or: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Paste & Run Migration**
   ```sql
   -- Copy the ENTIRE contents below and paste into SQL Editor:
   ```

4. **Copy this SQL:**

```sql
-- ============================================
-- CREATE GARAGE VEHICLES TABLE
-- For vehicles the user OWNS (trade-ins)
-- Separate from 'vehicles' table which stores SAVED vehicles (interested in buying)
-- ============================================

CREATE TABLE IF NOT EXISTS garage_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Vehicle Info
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  vin TEXT,
  mileage INTEGER,

  -- Ownership Details
  condition TEXT CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  estimated_value NUMERIC(10, 2),
  payoff_amount NUMERIC(10, 2) DEFAULT 0,

  -- Optional
  photo_url TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_user_id ON garage_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_garage_vehicles_created_at ON garage_vehicles(created_at DESC);

-- RLS Policies
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

-- Trigger for updated_at
CREATE TRIGGER update_garage_vehicles_updated_at
  BEFORE UPDATE ON garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

5. **Click "Run"** (or press Cmd/Ctrl + Enter)

6. **Verify Success**
   - You should see: "Success. No rows returned"
   - Click "Table Editor" in left sidebar
   - You should now see `garage_vehicles` table

---

## Option 2: Via Terminal (If you have psql)

```bash
# If you have the connection string
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  -f supabase/migrations/20251105_create_garage_vehicles.sql
```

---

## Verify Migration Worked

### Method 1: SQL Query
In Supabase SQL Editor, run:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'garage_vehicles';
```

Should return: `garage_vehicles`

### Method 2: Check Policies
```sql
SELECT policyname
FROM pg_policies
WHERE tablename = 'garage_vehicles';
```

Should return 4 policies (view, insert, update, delete)

---

## After Migration Success

1. ✅ Refresh your browser at http://localhost:3001
2. ✅ Click profile dropdown → "My Garage"
3. ✅ Console should show: "🔍 Querying garage_vehicles table..."
4. ✅ Modal should open (will be empty initially)

---

## Troubleshooting

### Error: "relation garage_vehicles already exists"
✅ Good! Table already exists. Skip migration.

### Error: "function update_updated_at_column() does not exist"
Run this first:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Error: Permission denied
- Check you're logged in to correct Supabase project
- Verify you have admin access
- Try using service role key instead of anon key
