function clearDatasetEntries(dataset, keys = []) {
  if (!dataset) return;
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(dataset, key)) {
      delete dataset[key];
    }
  });
}

function resetSalePriceInput(input) {
  if (!input) return;
  input.value = "";
  clearDatasetEntries(input.dataset, ["askingPrice", "calculatedSalePrice"]);
}

function resetAprInput(input) {
  if (!input) return;
  input.value = "";
  clearDatasetEntries(input.dataset, ["numericValue"]);
  if (Object.prototype.hasOwnProperty.call(input, "readOnly")) {
    input.readOnly = false;
  }
  if (input.classList?.remove) {
    input.classList.remove("input--readonly");
  } else if (input.classList?.contains?.("input--readonly")) {
    // Fallback for tests where classList is a custom object.
    input.classList.remove("input--readonly");
  }
}

function resetMonthlyOutputs(outputs = []) {
  outputs.forEach((output) => {
    if (!output) return;
    if ("textContent" in output) {
      output.textContent = "";
    }
    if ("value" in output) {
      output.value = "";
    }
  });
}

function resetCalculator(ctx) {
  if (!ctx) return;

  resetSalePriceInput(ctx.salePriceInput);
  resetAprInput(ctx.financeAprInput);

  if (ctx.financeTermInput) {
    const defaultTerm = ctx.defaults?.TERM ?? "";
    ctx.financeTermInput.value =
      defaultTerm == null ? "" : String(defaultTerm);
  }

  if (ctx.rateSourceSelect) {
    const defaultSource = ctx.defaults?.USER ?? "";
    ctx.rateSourceSelect.value =
      defaultSource == null ? "" : String(defaultSource);
  }

  if (ctx.rateSourceNameOutput) {
    ctx.rateSourceNameOutput.textContent = "User Defined APR";
  }

  resetMonthlyOutputs(ctx.monthlyPaymentOutputs);

  if (typeof ctx.recomputeDeal === "function") {
    ctx.recomputeDeal();
  }
}

function wireClearButton({ button, ctx }) {
  if (!button || typeof button.addEventListener !== "function") return;
  button.addEventListener("click", (event) => {
    event?.preventDefault?.();
    resetCalculator(ctx);
  });
}

export { resetCalculator, wireClearButton };
