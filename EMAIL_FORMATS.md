# Email Format Structure

> **Note**: Email delivery uses Mailtrap (configured in `server/server.js`).

## Overview
The system supports three different email formats for different recipients:
- **Customer Format**: Full details including financing, fees, and savings
- **Dealer Format**: Vehicle details, trade-in vehicle info, customer contact (no financing/fees)
- **Lender Format**: TBD (placeholder for future implementation)

## Email Format Type
```typescript
export type EmailFormat = 'customer' | 'dealer' | 'lender';
```

## Data Structure

### LeadData Interface Extensions

#### Trade-in Vehicle Details (New)
```typescript
tradeVehicleYear?: number;
tradeVehicleMake?: string;
tradeVehicleModel?: string;
tradeVehicleTrim?: string;
tradeVehicleVIN?: string;
tradeVehicleMileage?: number;
tradeVehicleCondition?: string; // e.g., "Excellent", "Good", "Fair"
```

#### Pricing Distinction
```typescript
vehiclePrice?: number;        // Customer's offer price
dealerAskingPrice?: number;   // Dealer's original asking price
```

## Email Formats

### 1. CUSTOMER FORMAT (Default)
**Sections Included:**
1. ✅ Title: "VEHICLE OFFER SUMMARY"
2. ✅ CUSTOMER OFFER (with savings if negotiated below asking)
3. ✅ VEHICLE DETAILS
4. ✅ DEALER INFORMATION
5. ✅ FINANCING DETAILS (APR, term, monthly payment, rates effective date)
6. ✅ TRADE-IN DETAILS (financial: value, payoff, equity)
7. ✅ FEES & ADDONS (dealer fees, customer addons)
8. ✅ CUSTOMER INFORMATION

**Example:**
```
VEHICLE OFFER SUMMARY
══════════════════════════════════════════════════

CUSTOMER OFFER
══════════════════════════════════════════════════

    💰 $26,500.00

    💵 Savings: $2,000.00 below asking price

══════════════════════════════════════════════════

VEHICLE DETAILS
--------------------------------------------------
Vehicle:           2024 Honda Civic EX
VIN:               1HGCV1F36MA000001
Mileage:           15,000 miles
Condition:         Used
Stock #:           HC24-1234
Dealer Asking:     $28,500.00

DEALER INFORMATION
--------------------------------------------------
Dealer:            Honda of Springfield
Phone:             (555) 123-4567
Address:           123 Main St, Springfield, IL 62701

FINANCING DETAILS
--------------------------------------------------
Monthly Payment:   $450.00
APR:               4.50%
Rates Effective:   December 2024
Term:              72 months (6.0 years)
Down Payment:      $2,000.00

TRADE-IN DETAILS
--------------------------------------------------
Trade-in Value:    $8,000.00
Trade Payoff:      $5,000.00
Trade Equity:      $3,000.00

FEES & ADDONS
--------------------------------------------------
Dealer Fees:       $599.00
Customer Addons:   $1,200.00

CUSTOMER INFORMATION
--------------------------------------------------
Name:              John Doe
Email:             john.doe@example.com
Phone:             (555) 987-6543

══════════════════════════════════════════════════
Generated: 12/15/2024, 10:30:00 AM
```

---

### 2. DEALER FORMAT
**Sections Included:**
1. ✅ Title: "DEALER OFFER SUMMARY"
2. ✅ CUSTOMER OFFER (no savings shown)
3. ✅ VEHICLE DETAILS
4. ✅ DEALER INFORMATION
5. ✅ TRADE-IN DETAILS (vehicle details: year, make, model, VIN, mileage, condition)
6. ✅ CUSTOMER INFORMATION

**Sections EXCLUDED:**
- ❌ Savings calculation
- ❌ FINANCING DETAILS
- ❌ FEES & ADDONS

**Example:**
```
DEALER OFFER SUMMARY
══════════════════════════════════════════════════

CUSTOMER OFFER
══════════════════════════════════════════════════

    💰 $26,500.00

══════════════════════════════════════════════════

VEHICLE DETAILS
--------------------------------------------------
Vehicle:           2024 Honda Civic EX
VIN:               1HGCV1F36MA000001
Mileage:           15,000 miles
Condition:         Used
Stock #:           HC24-1234
Dealer Asking:     $28,500.00

DEALER INFORMATION
--------------------------------------------------
Dealer:            Honda of Springfield
Phone:             (555) 123-4567
Address:           123 Main St, Springfield, IL 62701

TRADE-IN DETAILS
--------------------------------------------------
Vehicle:           2020 Toyota Camry LE
VIN:               4T1B11HK5LU123456
Mileage:           55,000 miles
Trade-in Condition:Excellent

CUSTOMER INFORMATION
--------------------------------------------------
Name:              John Doe
Email:             john.doe@example.com
Phone:             (555) 987-6543

══════════════════════════════════════════════════
Generated: 12/15/2024, 10:30:00 AM
```

---

### 3. LENDER FORMAT (TBD)
**Planned sections (to be defined):**
- Title: "LENDER OFFER SUMMARY"
- Customer offer
- Vehicle details
- Financing details (APR, term, down payment)
- Trade-in equity summary
- Customer credit info (if applicable)

---

## Usage

### Generating Email Text
```typescript
import { generateOfferText, EmailFormat } from './services/leadSubmission';

// Customer email (default)
const customerEmail = generateOfferText(leadData);
// or explicitly
const customerEmail = generateOfferText(leadData, 'customer');

// Dealer email
const dealerEmail = generateOfferText(leadData, 'dealer');

// Lender email (TBD)
const lenderEmail = generateOfferText(leadData, 'lender');
```

### Sending to Multiple Recipients
```typescript
// When sending to dealer
const dealerEmailBody = generateOfferText(leadData, 'dealer');
await sendEmail({
  to: leadData.dealerEmail,
  subject: 'New Vehicle Offer',
  body: dealerEmailBody
});

// When sending to customer
const customerEmailBody = generateOfferText(leadData, 'customer');
await sendEmail({
  to: leadData.customerEmail,
  subject: 'Your Vehicle Offer Summary',
  body: customerEmailBody
});
```

## Database Schema Updates Needed

### customer_offers table
Add new columns:
```sql
ALTER TABLE customer_offers ADD COLUMN dealer_asking_price DECIMAL(10,2);
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_year INTEGER;
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_make TEXT;
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_model TEXT;
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_trim TEXT;
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_vin TEXT;
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_mileage INTEGER;
ALTER TABLE customer_offers ADD COLUMN trade_vehicle_condition TEXT;
```

## Key Implementation Notes

1. **Format Selection**: The format parameter determines which sections are included
2. **Conditional Sections**: Sections check both format AND data availability
3. **Trade-in Logic**:
   - Dealer format shows trade-in **vehicle details**
   - Customer format shows trade-in **financial details**
4. **Savings Display**: Only shown in customer format
5. **Title Variation**: Changes based on recipient type
6. **Backward Compatibility**: Default format is 'customer' if not specified

## Future Enhancements
- Lender format implementation
- HTML email templates
- PDF generation
- Multilingual support
- Custom branding per dealer
