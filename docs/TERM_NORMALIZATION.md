# Term Normalization for Auto Loan Rates

## Overview

This document explains the term normalization strategy for auto loan rate scrapers. The goal is to map non-standard loan terms to industry-standard terms (36/48/60/72/84 months) before inserting data into the database, ensuring consistent rate matching across all lenders.

## Problem Statement

### The Issue

Different lenders publish rates for different loan terms:

- **Industry Standard Terms**: 36, 48, 60, 72, 84 months
- **SCCU Terms**: 48, 66, 75, 84 months
- **Some Credit Unions**: 45, 54, 63, 75 months

When users select a standard term (e.g., 60 months) but a lender only offers non-standard terms (e.g., 66 months), the app cannot find a matching rate and displays "No rate available."

### The Solution

**Normalize all terms to industry standards in the scraper** before inserting into the database. This ensures:
- Users can always select standard terms
- All lenders appear to support the same terms
- Frontend rate matching logic doesn't need to change
- Database stays clean with standard terms
- APR accuracy is preserved

## Industry Standard Terms

The following loan terms are considered industry standards:

| Term (Months) | Years | Common Usage |
|--------------|-------|--------------|
| 36 | 3 | Short-term, lower total interest |
| 48 | 4 | Popular for used vehicles |
| 60 | 5 | **Most common** nationwide |
| 72 | 6 | Longer-term, lower payments |
| 84 | 7 | Maximum for most lenders |

## Normalization Algorithm

### Basic Logic

1. **Exact Match**: If the term is already a standard (36/48/60/72/84), use it as-is
2. **Nearest Match**: Find the closest standard term using distance calculation
3. **Tie-Breaker**: If two terms are equidistant, prefer the shorter one (more conservative)

### Distance Calculation

```
distance = |original_term - standard_term|
```

### Examples

| Original Term | Nearest Standard | Distance | Notes |
|--------------|------------------|----------|-------|
| 45 months | 48 months | 3 | Rounds up to 48 |
| 54 months | 60 months | 6 | Rounds up to 60 |
| 63 months | 60 months | 3 | Rounds down to 60 |
| 66 months | 60 months | 6 | Rounds down to 60 |
| 75 months | 72 months | 3 | Rounds down to 72 |

### Edge Cases

#### Case 1: 0 Months
Some lenders use "0-36 months" to indicate "up to 36 months."
- **Normalization**: 0 → 36

#### Case 2: Equidistant Terms
User selects 57 months. SCCU has 48 (distance: 9) and 66 (distance: 9).
- **Normalization**: Prefer shorter → 48 months

#### Case 3: Term Ranges
NFCU offers "37-60 months" range.
- **Normalization**:
  - `term_min`: 37 → 36
  - `term_max`: 60 → 60
  - **Result**: "36-60 Months"

## Implementation

### JavaScript (Reference)

```javascript
import { normalizeRateTerms } from './normalize-terms.mjs';

// Example: SCCU scraped data
const scrapedRate = {
  termMonths: 66,
  apr: 5.99,
  vehicle_condition: 'new',
  loan_type: 'purchase',
  credit_score_min: 740,
  credit_score_max: 850,
  source: 'SCCU',
  effective_at: '2025-10-03'
};

// Normalize before database insertion
const normalized = normalizeRateTerms(scrapedRate);

console.log(normalized.term_range_min); // 60
console.log(normalized.term_range_max); // 60
console.log(normalized.term_label);     // "60 Months"
```

### Python (myLenders Tool)

```python
from normalize_terms import normalize_rate_terms

# Example: SCCU scraped data
scraped_rate = {
    "termMonths": 66,
    "apr": 5.99,
    "vehicle_condition": "new",
    "loan_type": "purchase",
    "credit_score_min": 740,
    "credit_score_max": 850,
    "source": "SCCU",
    "effective_at": "2025-10-03"
}

# Normalize before database insertion
normalized = normalize_rate_terms(scraped_rate)

print(normalized['term_range_min'])  # 60
print(normalized['term_range_max'])  # 60
print(normalized['term_label'])      # "60 Months"
```

## Lender-Specific Examples

### SCCU (Space Coast Credit Union)

**Published Terms**: 48, 66, 75, 84 months

**Normalization Mapping**:
| Original | Normalized | APR | Notes |
|----------|-----------|-----|-------|
| 48 | 48 | 5.49% | Exact match |
| 66 | 60 | 5.99% | Distance: 6 months |
| 75 | 72 | 6.49% | Distance: 3 months |
| 84 | 84 | 6.74% | Exact match |

**Impact**:
- Before: Users selecting 60 or 72 months see "No rate available"
- After: Users get the closest available rate

### Navy Federal Credit Union (NFCU)

**Published Terms**: 0-36, 37-60, 61-72, 73-84 months (ranges)

**Normalization Mapping**:
| Original Range | Normalized Range | APR | Notes |
|---------------|------------------|-----|-------|
| 0-36 | 36-36 | 4.29% | 0 → 36, exact match |
| 37-60 | 36-60 | 4.79% | 37 → 36 |
| 61-72 | 60-72 | 5.29% | 61 → 60 |
| 73-84 | 72-84 | 5.79% | 73 → 72 |

**Impact**:
- Minimal changes (most terms already standard)
- Slight broadening of ranges (37 becomes 36)

### Launch Credit Union

**Published Terms**: 36, 48, 60, 72, 84 months

**Normalization Mapping**:
- All terms are already standard → No changes needed

## Database Schema

### Before Normalization

```sql
-- SCCU rates in database (current state)
INSERT INTO auto_rates (term_range_min, term_range_max, apr_percent)
VALUES
  (48, 48, 5.49),  -- ✅ Standard
  (66, 66, 5.99),  -- ❌ Non-standard
  (75, 75, 6.49),  -- ❌ Non-standard
  (84, 84, 6.74);  -- ✅ Standard
```

### After Normalization

```sql
-- SCCU rates in database (with normalization)
INSERT INTO auto_rates (term_range_min, term_range_max, apr_percent)
VALUES
  (48, 48, 5.49),  -- ✅ Standard
  (60, 60, 5.99),  -- ✅ Normalized from 66
  (72, 72, 6.49),  -- ✅ Normalized from 75
  (84, 84, 6.74);  -- ✅ Standard
```

## Integration Guide (myLenders Tool)

### Step 1: Copy the Python Module

Copy `scripts/normalize_terms.py` to your myLenders project:

```bash
cp scripts/normalize_terms.py /path/to/myLenders/utils/
```

### Step 2: Import in Scraper

```python
from utils.normalize_terms import normalize_rate_terms
```

### Step 3: Normalize After Scraping

```python
def scrape_lender_rates(lender_id):
    """Scrape rates from lender website."""

    # 1. Scrape the raw data
    raw_rates = scrape_website(lender_id)

    # 2. Normalize terms to industry standards
    normalized_rates = [
        normalize_rate_terms(rate)
        for rate in raw_rates
    ]

    # 3. Insert into database
    insert_to_supabase(normalized_rates)

    return normalized_rates
```

### Step 4: Update Database Insertion

```python
def insert_to_supabase(normalized_rates):
    """Insert normalized rates into Supabase."""
    for rate in normalized_rates:
        supabase.table('auto_rates').upsert({
            'source': rate['source'],
            'term_range_min': rate['term_range_min'],  # ← Normalized
            'term_range_max': rate['term_range_max'],  # ← Normalized
            'term_label': rate['term_label'],          # ← Auto-generated
            'apr_percent': rate['apr'],
            'vehicle_condition': rate['vehicle_condition'],
            'loan_type': rate['loan_type'],
            'credit_score_min': rate.get('credit_score_min', 300),
            'credit_score_max': rate.get('credit_score_max', 850),
            'effective_at': rate['effective_at'],
            'last_scraped_at': datetime.now().isoformat()
        }).execute()
```

## Testing

### JavaScript

```bash
# Test the normalization utility
node scripts/normalize-terms.mjs

# Run the example scraper
node scripts/scraper-term-normalization-example.mjs
```

### Python

```bash
# Test the normalization utility (includes examples)
python3 scripts/normalize_terms.py
```

### Expected Output

```
=== SCCU Terms ===
  48 months → 48 months (distance: 0)
  66 months → 60 months (distance: 6)
  75 months → 72 months (distance: 3)
  84 months → 84 months (distance: 0)
```

## Benefits

### 1. Consistent User Experience
- Users can always select standard terms (36/48/60/72/84)
- No more "No rate available" errors for non-standard lenders

### 2. Simplified Frontend
- No changes needed to rate matching logic
- No "nearest term" fallback logic required
- Cleaner, more maintainable code

### 3. Database Consistency
- All lenders use the same term structure
- Easier to compare rates across lenders
- Simpler queries and reporting

### 4. Accurate APR Preservation
- APRs are not modified, only terms
- Users see the actual lender rates
- Transparency maintained

### 5. Future-Proof
- New lenders with non-standard terms automatically normalized
- Consistent data quality over time

## Migration Plan

### Phase 1: Update Scrapers
1. Copy `normalize_terms.py` to myLenders tool
2. Update each scraper to call `normalize_rate_terms()`
3. Test with each lender

### Phase 2: Cleanup Existing Data
1. Run database cleanup script to normalize existing SCCU rates
2. Verify frontend shows correct rates
3. Test with all lenders

### Phase 3: Validation
1. Compare old vs new rate matching
2. Verify APRs are unchanged
3. Confirm user experience improvement

## Troubleshooting

### Issue: "Invalid term" error

**Cause**: Scraper is passing a negative or invalid term value

**Solution**: Check scraper parsing logic, ensure term is a positive integer

### Issue: Terms normalized incorrectly

**Cause**: Industry standard terms list may be outdated

**Solution**: Review `INDUSTRY_STANDARD_TERMS` in both JS and Python modules

### Issue: APRs changing after normalization

**Cause**: Bug in normalization logic (should never modify APR)

**Solution**: APRs should remain unchanged. If they're changing, check the database insertion logic.

## FAQ

### Q: Why not normalize on the frontend?

**A**: Normalizing in scrapers keeps the database clean and consistent. Frontend normalization would require complex fallback logic and would need to be duplicated across all clients.

### Q: What if a lender has a rate exactly between two standards?

**A**: The algorithm prefers the shorter term (more conservative). For example, 57 months equidistant from 48 and 66 would normalize to 48.

### Q: Do we preserve the original term anywhere?

**A**: The original term is not currently preserved. If needed, you could add an `original_term` field to the database schema for auditing purposes.

### Q: What about terms above 84 months?

**A**: Terms above 84 months are rare and typically not supported. The algorithm will normalize them to 84 (the maximum standard term).

### Q: Can I add custom industry-standard terms?

**A**: Yes, modify `INDUSTRY_STANDARD_TERMS` in both `normalize-terms.mjs` and `normalize_terms.py`. Common additions might be 24 months or 96 months.

## Related Files

- **JavaScript Utility**: `scripts/normalize-terms.mjs`
- **Python Utility**: `scripts/normalize_terms.py`
- **Example Implementation**: `scripts/scraper-term-normalization-example.mjs`
- **Database Cleanup**: `scripts/cleanup-sccu-terms.mjs` (see below)
- **Rate Matching Logic**: `src/services/lenderRates.ts`

## See Also

- [Offer Management System](./OFFER_MANAGEMENT_SYSTEM.md)
- [Slider Polarity System](./slider-polarity-system.md)
- [Rate Automation](./rate-automation.md) (archived)
