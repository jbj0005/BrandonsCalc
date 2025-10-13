import { matchProgram } from "../rates/provider-engine.mjs";

const baseRate = {
  providerId: "demo",
  providerSource: "DEMO",
  termLabel: "60-72 mos.",
  programLabel: "Standard",
  effectiveAt: "2025-01-15",
};

const unbandedRates = [
  {
    ...baseRate,
    vehicleCondition: "new",
    termMin: 60,
    termMax: 72,
    creditScoreMin: 300,
    creditScoreMax: 850,
    aprPercent: 5.49,
  },
  {
    ...baseRate,
    vehicleCondition: "new",
    termMin: 60,
    termMax: 72,
    creditScoreMin: 300,
    creditScoreMax: 850,
    aprPercent: 4.99,
    programLabel: "Promo",
  },
  {
    ...baseRate,
    vehicleCondition: "used",
    termMin: 60,
    termMax: 84,
    creditScoreMin: 300,
    creditScoreMax: 850,
    aprPercent: 6.25,
    programLabel: "Used Special",
  },
];

const bandedRates = [
  {
    ...baseRate,
    vehicleCondition: "new",
    termMin: 60,
    termMax: 72,
    creditScoreMin: 300,
    creditScoreMax: 659,
    aprPercent: 7.99,
    programLabel: "Tier 3",
  },
  {
    ...baseRate,
    vehicleCondition: "new",
    termMin: 60,
    termMax: 72,
    creditScoreMin: 660,
    creditScoreMax: 749,
    aprPercent: 5.99,
    programLabel: "Tier 2",
  },
  {
    ...baseRate,
    vehicleCondition: "new",
    termMin: 60,
    termMax: 72,
    creditScoreMin: 750,
    creditScoreMax: 850,
    aprPercent: 4.49,
    programLabel: "Tier 1",
  },
];

describe("matchProgram", () => {
  test.each([
    {
      name: "selects lowest APR for unbanded provider",
      cache: {
        rates: unbandedRates,
        isCreditBanded: false,
      },
      criteria: { term: 72, condition: "new" },
      expected: { status: "matched", aprPercent: 4.99, programLabel: "Promo" },
    },
    {
      name: "requires credit score for banded dataset",
      cache: {
        rates: bandedRates,
        isCreditBanded: true,
      },
      criteria: { term: 60, condition: "new" },
      expected: { status: "needsCreditScore" },
    },
    {
      name: "matches correct credit tier when score provided",
      cache: {
        rates: bandedRates,
        isCreditBanded: true,
      },
      criteria: { term: 72, condition: "new", creditScore: 705 },
      expected: { status: "matched", aprPercent: 5.99, programLabel: "Tier 2" },
    },
    {
      name: "matches at inclusive term boundaries",
      cache: {
        rates: unbandedRates,
        isCreditBanded: false,
      },
      criteria: { term: 60, condition: "new" },
      expected: { status: "matched", aprPercent: 4.99, programLabel: "Promo" },
    },
    {
      name: "matches used program when available",
      cache: {
        rates: unbandedRates,
        isCreditBanded: false,
      },
      criteria: { term: 60, condition: "used" },
      expected: {
        status: "matched",
        aprPercent: 6.25,
        programLabel: "Used Special",
      },
    },
    {
      name: "returns noMatch when condition unavailable",
      cache: {
        rates: unbandedRates.filter((rate) => rate.vehicleCondition === "new"),
        isCreditBanded: false,
      },
      criteria: { term: 60, condition: "used" },
      expected: { status: "noMatch" },
    },
    {
      name: "returns noMatch when term outside range",
      cache: {
        rates: unbandedRates,
        isCreditBanded: false,
      },
      criteria: { term: 48, condition: "new" },
      expected: { status: "noMatch" },
    },
  ])("handles case: $name", ({ cache, criteria, expected }) => {
    const result = matchProgram(cache, criteria);
    expect(result.status).toBe(expected.status);
    if (expected.status === "matched") {
      expect(result.match).toBeDefined();
      expect(result.match.aprPercent).toBeCloseTo(expected.aprPercent, 5);
      expect(result.match.programLabel).toBe(expected.programLabel);
    } else {
      expect(result.match).toBeUndefined();
    }
  });
});
