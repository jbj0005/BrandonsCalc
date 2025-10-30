# Customer Add-ons Migration Guide

This guide walks you through migrating customer add-on items (Extended Warranty, Tire Package, GAP Coverage) from Dealer Fees to a new Customer Add-ons section.

## Overview

The migration creates:
- `customer_addon_sets` table - stores customer add-on fee sets
- `customer_addon_items_v` view - flattened view of all customer add-on items
- Default customer add-on items including Extended Warranty, Tire Package, GAP Coverage, and more

## Prerequisites

- Access to your Supabase dashboard
- Service role key in `.env` file
- Node.js installed

## Migration Steps

### Step 1: Run the SQL Migration

1. Open your Supabase SQL Editor:
   - Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

2. Copy the contents of `supabase/migrations/20251030_create_customer_addon_tables.sql`

3. Paste and execute the SQL in the Supabase SQL Editor

4. Verify the migration by running:
   ```bash
   npm run migrate:customer-addons
   ```

   This will prompt you to confirm the tables were created successfully.

### Step 2: Clean Up Dealer Fees

Remove the customer add-on items from the dealer fees table:

```bash
npm run cleanup:dealer-fees
```

This will remove the following items from `dealer_fee_sets`:
- Extended Warranty
- Tire Protection
- Gap Coverage

### Step 3: Verify the Migration

Run the fees report to verify the changes:

```bash
npm run show:fees
```

You should see:
- **Dealer fees** - no longer contain Extended Warranty, Tire Protection, or Gap Coverage
- **Customer add-ons** - contain Extended Warranty, Tire Package, GAP Coverage, and additional items

### Step 4: Test the Calculator

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open the calculator and test:
   - Add customer add-ons using the new Customer Add-ons section
   - Verify autocomplete suggestions work
   - Open the Edit Fee modal and test editing customer add-ons
   - Generate a contract and verify customer add-ons appear in the itemization

## Database Schema

### customer_addon_sets Table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| label | text | Set label/name |
| items | jsonb | Array of fee items |
| active | boolean | Whether the set is active |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

### customer_addon_items_v View

| Column | Type | Description |
|--------|------|-------------|
| set_id | uuid | Reference to parent set |
| set_label | text | Set label |
| name | text | Item name |
| amount | numeric | Default amount |
| sort_order | integer | Display order |

## Default Customer Add-ons

The migration creates these default items:
1. Extended Warranty - $2,500
2. Tire Package - $1,200
3. GAP Coverage - $895
4. Paint Protection - $695
5. Fabric Protection - $495
6. Window Tint - $450
7. Wheel & Tire Protection - $850
8. Maintenance Package - $1,500

## Code Changes

The following files were updated:

### app.js
- Added `customerAddonSuggestionStore` for autocomplete
- Added `loadCustomerAddonSuggestions()` function
- Updated `recomputeFees()` to include customer add-ons
- Updated `recomputeTaxes()` to include customer add-ons in taxable base
- Updated edit fee modal to support "customer" type
- Connected customer addon input to datalist

### index.html
- Added Customer Add-ons section HTML between Dealer and Gov't fees
- Added "Customer" option to edit fee modal type dropdown
- Updated taxable base tooltip to mention Customer Add-ons

### styles.css
- No changes required (existing fee group styles apply)

## Troubleshooting

### Error: Table doesn't exist
If you get an error that `customer_addon_sets` doesn't exist:
1. Verify you ran the SQL migration in Supabase dashboard
2. Check the SQL Editor for any error messages
3. Ensure you're connected to the correct Supabase project

### Items still showing in dealer fees
If Extended Warranty, Tire Protection, or Gap Coverage still appear in dealer fees:
1. Run `npm run cleanup:dealer-fees` again
2. Verify the items were removed by running `npm run show:fees`
3. Check the Supabase dashboard to manually verify the `dealer_fee_sets` table

### Autocomplete not working
If customer addon autocomplete isn't working:
1. Check browser console for errors loading suggestions
2. Verify `customer_addon_items_v` view exists and has data
3. Refresh the page to reload suggestions

## Rollback

If you need to rollback this migration:

1. Move items back to dealer fees (manually in Supabase dashboard)
2. Drop the tables:
   ```sql
   drop view if exists customer_addon_items_v;
   drop table if exists customer_addon_sets;
   ```
3. Revert code changes in `app.js`, `index.html`, and `package.json`
