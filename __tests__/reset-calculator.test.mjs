import { jest } from "@jest/globals";
import * as resetModule from "../src/reset-calculator.mjs";

const { resetCalculator, wireClearButton } = resetModule;

const createClassList = (initial = []) => {
  const classes = new Set(initial);
  return {
    add: (token) => classes.add(token),
    remove: (token) => classes.delete(token),
    contains: (token) => classes.has(token),
  };
};

function buildContext() {
  const salePriceInput = {
    value: "$45,000",
    dataset: {
      askingPrice: "45000",
      calculatedSalePrice: "44000",
    },
  };

  const financeAprInput = {
    value: "5.99%",
    dataset: { numericValue: "0.0599" },
    readOnly: true,
    classList: createClassList(["input--readonly"]),
  };

  const financeTermInput = {
    value: "60",
  };

  const rateSourceSelect = {
    value: "nfcu",
  };

  const rateSourceNameOutput = {
    textContent: "NFCU Rates",
  };

  const monthlyOutputHtml = { textContent: "$700" };
  const monthlyOutputValue = { value: "$710" };

  const recomputeDeal = jest.fn();

  return {
    ctx: {
      salePriceInput,
      financeAprInput,
      financeTermInput,
      rateSourceSelect,
      rateSourceNameOutput,
      monthlyPaymentOutputs: [monthlyOutputHtml, monthlyOutputValue],
      defaults: { TERM: 84, USER: "userDefined" },
      recomputeDeal,
    },
    salePriceInput,
    financeAprInput,
    financeTermInput,
    rateSourceSelect,
    rateSourceNameOutput,
    monthlyOutputHtml,
    monthlyOutputValue,
    recomputeDeal,
  };
}

describe("resetCalculator", () => {
  test("clears inputs, resets metadata, and triggers recompute", () => {
    const {
      ctx,
      salePriceInput,
      financeAprInput,
      financeTermInput,
      rateSourceSelect,
      rateSourceNameOutput,
      monthlyOutputHtml,
      monthlyOutputValue,
      recomputeDeal,
    } = buildContext();

    resetCalculator(ctx);

    expect(salePriceInput.value).toBe("");
    expect(salePriceInput.dataset.askingPrice).toBeUndefined();
    expect(salePriceInput.dataset.calculatedSalePrice).toBeUndefined();

    expect(financeAprInput.value).toBe("");
    expect(financeAprInput.dataset.numericValue).toBeUndefined();
    expect(financeAprInput.readOnly).toBe(false);
    expect(financeAprInput.classList.contains("input--readonly")).toBe(false);

    expect(financeTermInput.value).toBe("84");
    expect(rateSourceSelect.value).toBe("userDefined");
    expect(rateSourceNameOutput.textContent).toBe("User Defined APR");

    expect(monthlyOutputHtml.textContent).toBe("");
    expect(monthlyOutputValue.value).toBe("");

    expect(recomputeDeal).toHaveBeenCalledTimes(1);
  });

  test("wireClearButton prevents default and fires reset", () => {
    const listeners = new Map();
    const button = {
      addEventListener: (type, handler) => listeners.set(type, handler),
    };
    const { ctx, salePriceInput, financeAprInput } = buildContext();

    wireClearButton({ button, ctx });

    const handler = listeners.get("click");
    expect(typeof handler).toBe("function");

    const preventDefault = jest.fn();
    handler({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(salePriceInput.value).toBe("");
    expect(financeAprInput.value).toBe("");
    expect(ctx.recomputeDeal).toHaveBeenCalledTimes(1);
  });
});
