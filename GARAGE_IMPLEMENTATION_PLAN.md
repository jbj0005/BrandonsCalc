# My Garage - Implementation Plan

## Phase 1: Core CRUD Operations ✅ (Partially Complete)

### Database Schema ✅
- [x] Create `garage_vehicles` table
- [x] Add `photo_url` column for vehicle images
- [x] Add indexes and RLS policies
- [x] Create helper functions (increment_garage_vehicle_usage)

### UI Components ✅
- [x] Add "Garage" button to header
- [x] Create My Garage modal
- [x] Design vehicle cards with photo placeholder
- [x] Build add/edit form with all fields

### JavaScript Functions (Next)
- [ ] `openMyGarageModal()` - Open modal and load vehicles
- [ ] `closeMyGarageModal()` - Close modal
- [ ] `loadGarageVehicles()` - Fetch vehicles from database and render cards
- [ ] `renderGarageVehicleCard(vehicle)` - Create vehicle card HTML
- [ ] `showGarageForm(vehicleId?)` - Show add/edit form
- [ ] `hideGarageForm()` - Hide form and clear fields
- [ ] `saveGarageVehicle()` - Create or update vehicle
- [ ] `editGarageVehicle(id)` - Load vehicle data into form
- [ ] `deleteGarageVehicle(id)` - Delete with confirmation

## Phase 2: VIN Lookup Integration

### MarketCheck VIN Decode
- [ ] Add VIN input with "Lookup" button in garage form
- [ ] Create `lookupVINFromMarketCheck(vin)` function
- [ ] Call MarketCheck VIN decode API endpoint
- [ ] Parse response and auto-populate fields:
  - year
  - make
  - model
  - trim
  - Optional: estimated_value (if available)
- [ ] Handle errors gracefully (VIN not found, API error)
- [ ] Show loading indicator during lookup
- [ ] Display friendly message if no data found

### API Endpoint
```javascript
// MarketCheck VIN decode endpoint
GET /api/mc/decode?vin={VIN}

// Response structure:
{
  "year": 2020,
  "make": "Honda",
  "model": "Civic",
  "trim": "EX-L",
  "body_type": "Sedan",
  "drivetrain": "FWD",
  "engine": "1.5L 4-Cylinder Turbo"
}
```

## Phase 3: Photo Upload

### Supabase Storage Setup
- [ ] Create storage bucket: `garage-vehicle-photos`
- [ ] Configure bucket policies (authenticated users can upload)
- [ ] Set file size limit (e.g., 5MB max)
- [ ] Allowed formats: jpg, jpeg, png, webp

### UI Components
- [ ] Add photo upload field to garage form
- [ ] Show image preview before upload
- [ ] Display current photo if editing existing vehicle
- [ ] Add "Change Photo" / "Remove Photo" buttons
- [ ] Show upload progress indicator

### JavaScript Functions
- [ ] `handlePhotoUpload(file)` - Upload to Supabase Storage
- [ ] `generatePhotoPath(customerId, vehicleId)` - Create unique path
- [ ] `uploadVehiclePhoto(file, path)` - Upload and get public URL
- [ ] `deleteVehiclePhoto(photoUrl)` - Remove from storage
- [ ] Validate file type and size before upload

### Photo Storage Structure
```
garage-vehicle-photos/
  {customer_profile_id}/
    {vehicle_id}/
      photo.jpg
```

## Phase 4: Trade-In Integration

### Trade-In Modal Updates
- [ ] Add "Select from My Garage" button at top of trade-in modal
- [ ] Add dropdown/select field to choose garage vehicle
- [ ] Load garage vehicles for current user
- [ ] Sort by most recently used

### Auto-Population
- [ ] When garage vehicle selected:
  - Auto-fill year, make, model, trim
  - Auto-fill VIN
  - Auto-fill mileage
  - Auto-fill estimated trade-in value
  - Auto-fill payoff amount
- [ ] Increment `times_used` counter in database
- [ ] Update `last_used_at` timestamp
- [ ] Allow manual override of auto-filled values

### Database Call
```javascript
// Increment usage when vehicle is selected for trade-in
await supabase.rpc('increment_garage_vehicle_usage', {
  vehicle_id: selectedVehicleId
});
```

## Phase 5: Profile Cleanup

### Remove Old Trade-In Preferences
- [ ] Remove from profile modal UI:
  - Preferred Trade-In Value field
  - Preferred Trade-In Payoff field
- [ ] Remove from database schema:
  - `preferred_trade_value` column
  - `preferred_trade_payoff` column
- [ ] Keep `preferred_down_payment` (not related to garage)
- [ ] Remove from auto-populate logic in `autoPopulateCalculatorFromProfile()`

## Phase 6: Enhanced Features (Future)

### Vehicle Validation
- [ ] VIN format validation (17 characters, alphanumeric)
- [ ] Year range validation (1900-2030)
- [ ] Duplicate VIN detection
- [ ] Warn if mileage seems too high for year

### Bulk Import
- [ ] Import vehicles from CSV
- [ ] Batch VIN lookup

### Vehicle History
- [ ] Track all times vehicle was used in offers
- [ ] Link to saved offers that used this vehicle
- [ ] Show usage statistics

### Smart Suggestions
- [ ] Suggest trade-in value based on mileage and condition
- [ ] Alert when vehicle value may need updating (e.g., mileage increased)

## Technical Notes

### MarketCheck API Integration
```javascript
// Example VIN lookup implementation
async function lookupVINFromMarketCheck(vin) {
  try {
    const response = await fetch(`/api/mc/decode?vin=${vin}`);

    if (!response.ok) {
      // Handle gracefully - VIN not found is OK
      console.log('VIN not found in MarketCheck');
      return null;
    }

    const data = await response.json();
    return {
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      // Only populate if available
      estimatedValue: data.price || null
    };
  } catch (error) {
    console.error('MarketCheck lookup error:', error);
    // Don't throw - just return null
    return null;
  }
}
```

### Supabase Storage Upload
```javascript
// Example photo upload implementation
async function uploadVehiclePhoto(file, vehicleId) {
  const customerId = localStorage.getItem('customerProfileId');
  const fileExt = file.name.split('.').pop();
  const fileName = `${vehicleId}/photo.${fileExt}`;
  const filePath = `${customerId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('garage-vehicle-photos')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true // Overwrite if exists
    });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('garage-vehicle-photos')
    .getPublicUrl(filePath);

  return publicUrl;
}
```

## Implementation Order

1. **First:** Complete Phase 1 (CRUD operations)
2. **Second:** Phase 2 (VIN lookup) - Quick win, big value
3. **Third:** Phase 4 (Trade-in integration) - Core feature
4. **Fourth:** Phase 3 (Photo upload) - Nice to have
5. **Fifth:** Phase 5 (Cleanup old preferences)
6. **Future:** Phase 6 (Enhanced features)

## Testing Checklist

### CRUD Operations
- [ ] Can add new vehicle
- [ ] Can edit existing vehicle
- [ ] Can delete vehicle (with confirmation)
- [ ] Empty state shows when no vehicles
- [ ] Vehicle cards display correctly
- [ ] Currency formatting works

### VIN Lookup
- [ ] Valid VIN populates fields
- [ ] Invalid VIN shows friendly message
- [ ] No error when MarketCheck has no data
- [ ] Loading indicator appears during lookup

### Photo Upload
- [ ] Can upload photo (jpg, png)
- [ ] Photo displays in card
- [ ] Can change existing photo
- [ ] Can delete photo
- [ ] File size validation works

### Trade-In Integration
- [ ] Garage vehicles appear in dropdown
- [ ] Selecting vehicle populates all fields
- [ ] Usage counter increments
- [ ] Can still manually enter trade-in info
