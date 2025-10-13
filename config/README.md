# Lender Configuration

## Overview

The `lenders.json` file controls which lenders are available in the rate fetching system.

## Configuration Structure

```json
{
  "id": "nfcu",              // Unique identifier (used with --provider flag)
  "source": "NFCU",          // Database source identifier
  "longName": "Navy Federal Credit Union",
  "shortName": "NFCU",
  "enabled": true,           // Whether to include in --provider=all
  "scraper": "nfcu",         // Scraper type: "nfcu", "stub", or custom
  "website": "https://...",
  "sourceUrl": "https://...", // URL where rates are found
  "stubRates": [...],        // Required if scraper="stub"
  "notes": "..."             // Human-readable notes
}
```

## Adding a New Lender

### Option 1: Stub Data (Quick Setup)

Add a new entry with `scraper: "stub"` and define static rates:

```json
{
  "id": "mylender",
  "source": "MyLender",
  "longName": "My Lender Name",
  "shortName": "ML",
  "enabled": true,
  "scraper": "stub",
  "website": "https://mylender.com",
  "sourceUrl": "https://mylender.com/auto-rates",
  "stubRates": [
    {
      "loanType": "new",
      "termMin": 60,
      "termMax": 72,
      "baseApr": 5.99
    },
    {
      "loanType": "used",
      "termMin": 60,
      "termMax": 72,
      "baseApr": 6.49
    }
  ],
  "notes": "Using stub data until real scraper is implemented"
}
```

### Option 2: Custom Scraper (Advanced)

1. Add lender config with custom scraper name
2. Implement scraper function in `fetch-rates.mjs`
3. Add case to `fetchLenderRates()` switch statement

## Enabling/Disabling Lenders

- Set `"enabled": true` to include in `--provider=all`
- Set `"enabled": false` to exclude from `--provider=all`
- Individual lenders can still be fetched by ID even if disabled

## Usage Examples

```bash
# Fetch all enabled lenders
npm run fetch:rates -- --provider=all

# Fetch specific lender by ID
npm run fetch:rates -- --provider=nfcu
npm run fetch:rates -- --provider=sccu
npm run fetch:rates -- --provider=penfed

# Fetch disabled lender (will warn but still work)
npm run fetch:rates -- --provider=dcu
```

## Current Lenders

- **NFCU** (enabled): Real web scraping from Navy Federal
- **SCCU** (enabled): Stub data for Space Coast Credit Union
- **PenFed** (disabled): Stub data for Pentagon Federal
- **DCU** (disabled): Stub data for Digital Federal
- **Alliant** (disabled): Stub data for Alliant Credit Union

## Rate Expansion

All base rates are automatically expanded across the credit tiers defined in `credit-tiers.json`. For example:
- 2 base rates × 6 credit tiers = 12 total rates per lender
