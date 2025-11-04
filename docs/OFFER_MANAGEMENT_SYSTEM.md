# Offer Management System Documentation

## Overview

The Offer Management System provides comprehensive functionality for:
- Auto-populating customer information across the app
- Saving and recalling complete offer states
- Tracking salesperson contacts with auto-complete
- Submitting offers to dealers via multiple channels
- Managing offer history and status

---

## Database Schema

### Tables

#### 1. `customer_profiles`
Stores customer contact information for auto-population throughout the application.

**Key Features:**
- Email-based upsert (unique constraint on email)
- Google Places integration for address
- Stores user preferences (preferred lender, term, credit score)
- Tracks last usage for freshness

**Fields:**
- `id` - UUID primary key
- `full_name` - Customer's full name
- `email` - Unique email (used as natural key)
- `phone` - Phone number
- `street_address`, `city`, `state`, `state_code`, `zip_code` - Address components
- `county`, `county_name` - Tax jurisdiction
- `google_place_id` - Google Places API reference
- `preferred_lender_id`, `preferred_term`, `credit_score_range` - User preferences
- `last_used_at` - Timestamp of last use

**Usage:**
```javascript
// Save/update customer profile
const profile = await saveCustomerProfile({
  email: 'customer@example.com',
  fullName: 'John Smith',
  phone: '(555) 123-4567',
  stateCode: 'FL',
  countyName: 'Miami-Dade'
});

// Load and auto-populate
const profile = await loadCustomerProfile();
autoPopulateCustomerInfo(profile);
```

---

#### 2. `salesperson_contacts`
Stores salesperson/dealer information with usage tracking for auto-complete.

**Key Features:**
- Tracks usage count and recency
- Auto-complete based on name or dealership
- Unique constraint on (full_name, dealership_name)

**Fields:**
- `id` - UUID primary key
- `full_name` - Salesperson's name
- `dealership_name` - Dealership name
- `phone`, `email` - Contact information
- `times_used` - Usage counter (increments on each use)
- `last_used_at` - Last used timestamp

**Usage:**
```javascript
// Save salesperson contact
const contact = await saveSalespersonContact({
  fullName: 'Mike Johnson',
  dealership: 'ABC Motors',
  phone: '(555) 987-6543'
});

// Load suggestions for auto-complete
const suggestions = await loadSalespersonSuggestions('Mike');
```

---

#### 3. `saved_offers`
Stores complete offer state for recall, comparison, and submission.

**Key Features:**
- Complete snapshot of calculation state
- Both structured fields AND full `wizard_state` JSONB
- Status tracking (draft, submitted, accepted, rejected)
- References customer and salesperson
- Timestamps for created, updated, last_viewed

**Fields:**

**Metadata:**
- `id` - UUID primary key
- `customer_profile_id` - FK to customer_profiles
- `salesperson_id` - FK to salesperson_contacts
- `offer_name` - Display name (e.g., "2024 Camry - ABC Motors")
- `status` - Current status (draft/submitted/accepted/rejected)

**Vehicle:**
- `vehicle_year`, `vehicle_make`, `vehicle_model`, `vehicle_trim`
- `vehicle_vin`, `vehicle_condition`, `vehicle_mileage`

**Pricing:**
- `sale_price`, `down_payment`

**Trade-in:**
- `has_tradein`, `tradein_year`, `tradein_make`, `tradein_model`
- `tradein_vin`, `tradein_allowance`, `tradein_payoff`, `tradein_net`

**Financing:**
- `term`, `apr`, `monthly_payment`, `finance_charge`
- `amount_financed`, `total_of_payments`
- `lender_id`, `lender_name`

**Additional:**
- `fees` - JSONB with all fee details
- `state_code`, `county_name` - Tax jurisdiction
- `wizard_state` - Complete serialized wizardData (JSONB)
- `customer_notes` - User notes

**Usage:**
```javascript
// Save complete offer
const offer = await saveOffer('Looking to buy this week');

// Update offer
await updateOffer(offerId, {
  status: 'submitted',
  customer_notes: 'Submitted to dealer on 11/4'
});

// Load offers
const offers = await loadSavedOffers();

// Restore offer to calculator
await restoreOffer(offerId);
```

---

#### 4. `offer_submissions`
Tracks when offers are submitted to dealers.

**Key Features:**
- Links to saved offer
- Captures submission method and text
- Optional dealer response tracking

**Fields:**
- `id` - UUID primary key
- `saved_offer_id` - FK to saved_offers
- `salesperson_id` - FK to salesperson_contacts
- `submission_method` - How it was sent (share/email/sms/copy)
- `formatted_text` - The actual text sent
- `recipient_contact` - Where it was sent
- `dealer_response` - Optional response text
- `dealer_response_at` - Response timestamp

**Usage:**
```javascript
// Record submission
await recordOfferSubmission({
  offerId: offer.id,
  salespersonId: contact.id,
  method: 'email',
  formattedText: offerText,
  recipient: 'dealer@example.com'
});
```

---

## Database Functions

### `increment_salesperson_usage(salesperson_id UUID)`
Increments the `times_used` counter and updates `last_used_at`.

**Usage:**
```sql
SELECT increment_salesperson_usage('uuid-here');
```

### `update_customer_last_used(profile_id UUID)`
Updates the `last_used_at` timestamp for a customer profile.

**Usage:**
```sql
SELECT update_customer_last_used('uuid-here');
```

### Auto-Update Triggers
All tables have triggers to automatically update the `updated_at` column on any UPDATE operation.

---

## Application Flow

### Customer Profile Auto-Population

1. **First Visit:**
   - User enters information in Submit Offer modal
   - Profile saved to `customer_profiles`
   - Profile ID stored in localStorage

2. **Return Visit:**
   - Profile loaded from Supabase by ID or email
   - All forms auto-populated
   - User can update information

3. **Google Places Integration:**
   - When user selects address from Google Places
   - Address components saved to profile
   - State/county auto-selected

### Offer Lifecycle

1. **Draft Creation:**
   ```
   User adjusts calculator → Click "Save Offer" → saved_offers (status: draft)
   ```

2. **Auto-Save:**
   ```
   Every 30 seconds → Update saved offer if exists
   ```

3. **Submission:**
   ```
   User clicks "Submit Offer" → Opens submission modal
   → User fills info → Chooses method (share/email/sms)
   → Creates offer_submissions record
   → Updates saved_offers.status = 'submitted'
   ```

4. **Recall:**
   ```
   User opens "My Saved Offers" → Selects offer
   → Restores wizard_state to wizardData
   → Populates entire UI
   → Continues editing or submits
   ```

### Salesperson Auto-Complete

1. **First Use:**
   - User types salesperson name
   - No suggestions yet
   - After submission, contact saved

2. **Subsequent Uses:**
   - User starts typing
   - Auto-complete shows matches
   - Sorted by usage frequency
   - Click to auto-fill all fields

---

## API Examples

### Customer Profile Management

```javascript
// Save profile (upsert by email)
async function saveCustomerProfile(data) {
  const { data: profile, error } = await supabase
    .from('customer_profiles')
    .upsert({
      email: data.email,
      full_name: data.fullName,
      phone: data.phone,
      street_address: data.streetAddress,
      city: data.city,
      state_code: data.stateCode,
      zip_code: data.zipCode,
      county_name: data.countyName,
      google_place_id: data.googlePlaceId,
      updated_at: new Date().toISOString(),
      last_used_at: new Date().toISOString()
    }, {
      onConflict: 'email'
    })
    .select()
    .single();

  localStorage.setItem('customerProfileId', profile.id);
  return profile;
}

// Load profile
async function loadCustomerProfile() {
  const profileId = localStorage.getItem('customerProfileId');

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  return profile;
}
```

### Saved Offer Management

```javascript
// Save offer
async function saveOffer(customerNotes = '') {
  const profileId = localStorage.getItem('customerProfileId');
  const reviewData = computeReviewData();

  const { data: offer } = await supabase
    .from('saved_offers')
    .insert({
      customer_profile_id: profileId,
      offer_name: `${wizardData.vehicle.year} ${wizardData.vehicle.make} ${wizardData.vehicle.model}`,
      vehicle_year: wizardData.vehicle.year,
      vehicle_make: wizardData.vehicle.make,
      vehicle_model: wizardData.vehicle.model,
      sale_price: reviewData.salePrice,
      monthly_payment: reviewData.monthlyPayment,
      wizard_state: wizardData, // Complete state
      customer_notes: customerNotes,
      status: 'draft'
    })
    .select()
    .single();

  return offer;
}

// Load all offers for customer
async function loadSavedOffers() {
  const profileId = localStorage.getItem('customerProfileId');

  const { data: offers } = await supabase
    .from('saved_offers')
    .select('*, salesperson:salesperson_contacts(*)')
    .eq('customer_profile_id', profileId)
    .order('created_at', { ascending: false });

  return offers;
}

// Restore offer
async function restoreOffer(offerId) {
  const { data: offer } = await supabase
    .from('saved_offers')
    .select('*')
    .eq('id', offerId)
    .single();

  // Restore state
  Object.assign(wizardData, offer.wizard_state);
  await populateUIFromWizardData();
  await autoCalculateQuick();

  // Update last viewed
  await supabase
    .from('saved_offers')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', offerId);
}
```

### Salesperson Auto-Complete

```javascript
// Save salesperson
async function saveSalespersonContact(data) {
  const { data: contact } = await supabase
    .from('salesperson_contacts')
    .upsert({
      full_name: data.fullName,
      dealership_name: data.dealership,
      phone: data.phone,
      email: data.email,
      last_used_at: new Date().toISOString()
    }, {
      onConflict: 'full_name,dealership_name'
    })
    .select()
    .single();

  // Increment usage
  await supabase.rpc('increment_salesperson_usage', {
    salesperson_id: contact.id
  });

  return contact;
}

// Get suggestions
async function loadSalespersonSuggestions(query = '') {
  let queryBuilder = supabase
    .from('salesperson_contacts')
    .select('*')
    .order('times_used', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(10);

  if (query) {
    queryBuilder = queryBuilder.or(
      `full_name.ilike.%${query}%,dealership_name.ilike.%${query}%`
    );
  }

  const { data: suggestions } = await queryBuilder;
  return suggestions;
}
```

---

## Security Considerations

### Current State (Development)
- RLS enabled but allows all operations
- No authentication required
- Suitable for MVP/development

### Production Recommendations
1. **Add Authentication:**
   - Integrate Supabase Auth
   - Users must sign in to access data

2. **Update RLS Policies:**
   ```sql
   -- Only allow users to see their own data
   CREATE POLICY "Users can only see their own profiles"
     ON customer_profiles
     FOR SELECT
     USING (auth.uid() = user_id);
   ```

3. **Add user_id Column:**
   - Add `user_id UUID REFERENCES auth.users(id)` to relevant tables
   - Link data to authenticated users

4. **Rate Limiting:**
   - Implement rate limits on submission endpoints
   - Prevent spam/abuse

---

## Migration Instructions

### Running the Migration

1. **Using Supabase CLI:**
   ```bash
   supabase db push
   ```

2. **Using Supabase Dashboard:**
   - Navigate to SQL Editor
   - Copy contents of migration file
   - Execute SQL

3. **Verify Migration:**
   ```sql
   -- Check tables exist
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN (
     'customer_profiles',
     'salesperson_contacts',
     'saved_offers',
     'offer_submissions'
   );

   -- Check RLS is enabled
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   AND tablename IN (
     'customer_profiles',
     'salesperson_contacts',
     'saved_offers',
     'offer_submissions'
   );
   ```

### Rollback (if needed)

```sql
-- Drop tables in reverse order (respects foreign keys)
DROP TABLE IF EXISTS offer_submissions CASCADE;
DROP TABLE IF EXISTS saved_offers CASCADE;
DROP TABLE IF EXISTS salesperson_contacts CASCADE;
DROP TABLE IF EXISTS customer_profiles CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS increment_salesperson_usage(UUID);
DROP FUNCTION IF EXISTS update_customer_last_used(UUID);
DROP FUNCTION IF EXISTS update_updated_at_column();
```

---

## Future Enhancements

1. **Offer Comparison:**
   - Side-by-side comparison of multiple saved offers
   - Highlight differences

2. **Dealer Integration:**
   - API endpoints for dealers to respond
   - Push notifications on dealer responses

3. **Analytics:**
   - Track which offers get accepted
   - Popular vehicle combinations
   - Average negotiation timelines

4. **PDF Generation:**
   - Generate professional PDF offer sheets
   - Attach to email submissions

5. **Scheduling:**
   - Schedule follow-ups
   - Reminders for pending offers

---

## Support

For questions or issues:
- Check migration logs in `supabase/migrations/`
- Review Supabase dashboard for errors
- Check browser console for client-side errors
