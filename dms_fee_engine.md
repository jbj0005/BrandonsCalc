# DMS Scenario Engine – JSON Schema Design

**File:** `dms_scenario_engine.md`  
**Purpose:** Define a JSON-based scenario engine and data model that behaves like a Dealer Management System (DMS) for accurate fee and tax calculations (initial focus: U.S. auto retail with Florida as the first fully supported state).

The design is split into:

1. Data flow and architecture
2. JSON Schemas for core objects
3. Rule evaluation model
4. Example Florida-specific configuration
5. Versioning and extension notes

All JSON examples are illustrative and can be converted into standalone `.schema.json` files as needed.

---

## 1. High-Level Architecture

### 1.1 Overview

The engine computes all government and dealer-controlled fees for a vehicle transaction scenario.

Data flow:

1. **Scenario Input**  
   User, vehicle, deal, and registration data are captured in a `ScenarioInput` object.

2. **Dealer Configuration**  
   Dealer-specific private fees and presets are loaded from `DealerConfig`.

3. **Jurisdiction Rules**  
   State, county, and other government rules are loaded from `JurisdictionRules`.

4. **Scenario Evaluation**  
   A deterministic evaluation pipeline applies jurisdiction rules and dealer config to the scenario input, producing a `ScenarioResult`.

5. **Result Output**  
   The engine returns line items, totals, and explanation metadata in `ScenarioResult`.

---

## 2. Core JSON Models

This section defines the main schemas (conceptual). They can be implemented using JSON Schema Draft 2020-12.

### 2.1 ScenarioInput

**File hint:** `scenario-input.schema.json`

Represents one “pencil” or deal structure a DMS would calculate.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://brandonscalc.com/schema/scenario-input.json",
  "title": "ScenarioInput",
  "type": "object",
  "required": ["jurisdiction", "deal", "vehicle", "customer", "dealerContext"],
  "properties": {
    "scenarioId": {
      "type": "string",
      "description": "Unique id for this scenario instance."
    },
    "timestampUtc": {
      "type": "string",
      "format": "date-time",
      "description": "Scenario creation time in UTC."
    },

    "jurisdiction": {
      "type": "object",
      "description": "Location-based taxation and registration context.",
      "required": ["countryCode", "stateCode"],
      "properties": {
        "countryCode": { "type": "string", "example": "US" },
        "stateCode": { "type": "string", "example": "FL" },
        "countyName": { "type": "string" },
        "cityName": { "type": "string" },
        "postalCode": { "type": "string" }
      }
    },

    "dealerContext": {
      "type": "object",
      "required": ["dealerId", "configVersion"],
      "properties": {
        "dealerId": { "type": "string" },
        "configVersion": {
          "type": "string",
          "description": "Version of DealerConfig to use."
        },
        "feePackageId": {
          "type": "string",
          "description": "Optional preset dealer fee package (e.g., retail default)."
        }
      }
    },

    "deal": {
      "type": "object",
      "description": "Deal-level economics.",
      "required": ["dealType", "sellingPrice"],
      "properties": {
        "dealType": {
          "type": "string",
          "enum": ["retail", "lease", "cash", "balloon"],
          "description": "Type of transaction."
        },
        "sellingPrice": {
          "type": "number",
          "minimum": 0
        },
        "msrp": {
          "type": "number",
          "minimum": 0
        },
        "capCostReduction": {
          "type": "number",
          "minimum": 0,
          "description": "Down payment / cap cost reduction."
        },
        "rebates": {
          "type": "number",
          "minimum": 0,
          "description": "Rebates applied to reduce taxable base if applicable."
        },
        "cashDown": {
          "type": "number",
          "minimum": 0
        },
        "termMonths": {
          "type": "integer",
          "minimum": 0
        },
        "apr": {
          "type": "number",
          "minimum": 0,
          "description": "Annual percentage rate (retail)."
        },
        "moneyFactor": {
          "type": "number",
          "minimum": 0,
          "description": "Lease money factor, if applicable."
        },
        "lenderName": { "type": "string" },
        "lenderType": {
          "type": "string",
          "enum": ["captive", "bank", "credit_union", "other"],
          "description": "Type of financing source."
        }
      }
    },

    "vehicle": {
      "type": "object",
      "required": ["vin", "year", "newOrUsed", "bodyType"],
      "properties": {
        "vin": { "type": "string" },
        "year": { "type": "integer" },
        "make": { "type": "string" },
        "model": { "type": "string" },
        "trim": { "type": "string" },
        "bodyType": {
          "type": "string",
          "description": "Sedan, SUV, truck, etc."
        },
        "newOrUsed": {
          "type": "string",
          "enum": ["new", "used"]
        },
        "odometer": {
          "type": "integer",
          "minimum": 0
        },
        "weightLbs": {
          "type": "integer",
          "minimum": 0,
          "description": "Used for weight-based registration fees."
        },
        "useType": {
          "type": "string",
          "enum": ["personal", "commercial", "fleet"],
          "default": "personal"
        }
      }
    },

    "tradeIns": {
      "type": "array",
      "description": "Zero or more trade-in vehicles.",
      "items": {
        "type": "object",
        "required": ["estimatedValue", "payoffAmount"],
        "properties": {
          "vin": { "type": "string" },
          "estimatedValue": {
            "type": "number",
            "minimum": 0
          },
          "payoffAmount": {
            "type": "number",
            "minimum": 0
          },
          "lienHolderName": { "type": "string" },
          "titleStateCode": {
            "type": "string",
            "description": "State the trade title is held in."
          }
        }
      }
    },

    "registration": {
      "type": "object",
      "description": "Plate and registration scenario.",
      "required": ["plateScenario"],
      "properties": {
        "plateScenario": {
          "type": "string",
          "enum": [
            "new_plate",
            "transfer_existing_plate",
            "temp_tag",
            "no_plate" /* non-road use, export, etc. */
          ]
        },
        "existingPlateNumber": {
          "type": "string"
        },
        "firstTimeRegisteredInState": {
          "type": "boolean",
          "description": "True if this is the customer's first registration in this state (e.g., FL $225 initial reg)."
        },
        "garagingAddressPostalCode": {
          "type": "string"
        }
      }
    },

    "customer": {
      "type": "object",
      "required": ["residentStatus"],
      "properties": {
        "residentStatus": {
          "type": "string",
          "enum": ["resident", "non_resident", "military_temp"],
          "description": "State residency classification for tax/fee rules."
        },
        "hasExistingStateRegistration": {
          "type": "boolean",
          "description": "Used to infer first registration fee eligibility."
        },
        "exemptions": {
          "type": "array",
          "description": "Applied legal exemptions (disability, military, etc.).",
          "items": {
            "type": "string",
            "enum": [
              "disabled_veteran",
              "disabled_non_veteran",
              "active_duty_military",
              "government_entity",
              "non_profit",
              "other"
            ]
          }
        }
      }
    },

    "overrides": {
      "type": "object",
      "description": "Optional manual overrides to resolve ambiguous logic.",
      "properties": {
        "isInitialRegistration": {
          "type": "boolean",
          "description": "Direct override for initial registration determination."
        },
        "forceGovFeeCodeInclusion": {
          "type": "array",
          "items": { "type": "string" }
        },
        "forceGovFeeCodeExclusion": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```
