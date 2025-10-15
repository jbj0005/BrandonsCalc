/* eslint-disable no-param-reassign */
export function resetCalculator({
  salePriceInput,
  financeAprInput,
  financeTermInput,
  rateSourceSelect,
  rateSourceNameOutput,
  monthlyPaymentOutputs = [],
  defaults = { TERM: 72, USER: "userDefined" },
  recomputeDeal = () => {},
}) {
  if (salePriceInput) {
    salePriceInput.value = "";
    if (salePriceInput.dataset) {
      delete salePriceInput.dataset.askingPrice;
      delete salePriceInput.dataset.calculatedSalePrice;
    }
  }

  if (financeAprInput) {
    financeAprInput.value = "";
    if (financeAprInput.dataset) delete financeAprInput.dataset.numericValue;
    financeAprInput.readOnly = false;
    financeAprInput.classList.remove("input--readonly");
  }

  if (financeTermInput) financeTermInput.value = String(defaults.TERM);

  if (rateSourceSelect) rateSourceSelect.value = defaults.USER;

  if (rateSourceNameOutput) {
    rateSourceNameOutput.textContent = "User Defined APR";
  }

  for (const el of monthlyPaymentOutputs) {
    if (!el) continue;
    if ("value" in el) el.value = "";
    if ("textContent" in el) el.textContent = "";
  }

  try {
    recomputeDeal();
  } catch {
    // swallow recompute errors
  }
}

export function wireClearButton({ button, ctx }) {
  if (!button) return;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    resetCalculator(ctx);
  });
}
