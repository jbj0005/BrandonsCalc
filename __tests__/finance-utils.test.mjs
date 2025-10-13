import {
  evaluateExpression,
  evaluateCurrencyValue,
  evaluatePercentValue,
  calculateMonthlyPayment,
  paymentForPrincipal,
  principalFromPayment,
  solveTermForPayment,
} from "../utils/finance-utils.mjs";

describe("evaluateExpression", () => {
  const cases = [
    ["1 + 2", 3],
    ["$1,234.56 + 0.44", 1235],
    ["10%", 0.1],
    ["(5000)", -5000],
    ["2 * (3 + 4)", 14],
    ["invalid", null],
  ];

  test.each(cases)("evaluateExpression(%p) -> %p", (input, expected) => {
    const result = evaluateExpression(input);
    if (expected === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toBeCloseTo(expected);
    }
  });
});

describe("evaluateCurrencyValue", () => {
  const cases = [
    ["$10.005", 10.01],
    ["1000", 1000],
    ["", null],
  ];

  test.each(cases)("evaluateCurrencyValue(%p) -> %p", (input, expected) => {
    const result = evaluateCurrencyValue(input);
    if (expected === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toBeCloseTo(expected);
    }
  });
});

describe("evaluatePercentValue", () => {
  const fallback = 0.1234;
  const cases = [
    ["5%", 0.05],
    ["5", 0.05],
    ["0.25", 0.25],
    ["", fallback],
  ];

  test.each(cases)("evaluatePercentValue(%p)", (input, expected) => {
    const result = evaluatePercentValue(input, fallback);
    expect(result).toBeCloseTo(expected);
  });
});

describe("amortization helpers", () => {
  const defaultApr = 0.0599;

  test("calculateMonthlyPayment uses provided APR or fallback", () => {
    const payment = calculateMonthlyPayment(20000, 0.05, 60, defaultApr);
    expect(payment).toBeCloseTo(377.42, 2);

    const fallbackPayment = calculateMonthlyPayment(
      12000,
      Number.NaN,
      48,
      defaultApr
    );
    expect(fallbackPayment).toBeCloseTo(281.77, 2);
  });

  test("paymentForPrincipal delegates to calculateMonthlyPayment", () => {
    const payment = paymentForPrincipal(15000, 0.045, 72, defaultApr);
    const expected = calculateMonthlyPayment(15000, 0.045, 72, defaultApr);
    expect(payment).toBeCloseTo(expected, 10);
  });

  test("principalFromPayment inverts the payment calculation", () => {
    const principal = principalFromPayment(377.42, 0.05, 60);
    expect(principal).toBeCloseTo(20000, 0);

    const zeroRatePrincipal = principalFromPayment(250, 0, 48);
    expect(zeroRatePrincipal).toBeCloseTo(12000, 0);
  });

  test("solveTermForPayment solves for months given target payment", () => {
    const term = solveTermForPayment(10000, 300, 0.07);
    expect(term).toBeCloseTo(37.17, 2);

    const zeroRateTerm = solveTermForPayment(12000, 400, 0);
    expect(zeroRateTerm).toBeCloseTo(30, 6);
  });
});
