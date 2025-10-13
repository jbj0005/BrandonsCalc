export function evaluateExpression(raw) {
  if (raw == null) return null;
  let expr = String(raw).trim();
  if (expr === "") return null;
  expr = expr.replace(/[$,\s]/g, "");
  if (/^\(([^()+\-*/]+)\)$/.test(expr)) {
    expr = `-${RegExp.$1}`;
  }
  expr = expr.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
  if (/[^0-9+\-*/().]/.test(expr)) return null;
  try {
    const result = Function('"use strict";return (' + expr + ");")();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function evaluateCurrencyValue(raw) {
  const value = evaluateExpression(raw);
  if (value == null) return null;
  return Math.round(value * 100) / 100;
}

export function evaluatePercentValue(raw, fallback = null) {
  if (raw == null || String(raw).trim() === "") return fallback;
  const stringValue = String(raw).trim();
  const containsPercent = stringValue.includes("%");
  const value = evaluateExpression(stringValue);
  if (value == null) return fallback;
  if (containsPercent) return value;
  return Math.abs(value) >= 1 ? value / 100 : value;
}

export function calculateMonthlyPayment(
  principal,
  aprRate,
  termMonths,
  defaultApr = 0
) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(termMonths) || termMonths <= 0) return 0;
  const months = Math.round(termMonths);
  const rate = Number.isFinite(aprRate) ? aprRate : defaultApr;
  const monthlyRate = rate / 12;
  if (Math.abs(monthlyRate) < 1e-9) {
    return principal / months;
  }
  const factor = Math.pow(1 + monthlyRate, months);
  const denominator = factor - 1;
  if (Math.abs(denominator) < 1e-9) {
    return principal / months;
  }
  return principal * ((monthlyRate * factor) / denominator);
}

export function paymentForPrincipal(
  principal,
  aprRate,
  termMonths,
  defaultApr = 0
) {
  return calculateMonthlyPayment(principal, aprRate, termMonths, defaultApr);
}

export function principalFromPayment(payment, aprRate, termMonths) {
  if (!Number.isFinite(payment) || payment <= 0) return 0;
  if (!Number.isFinite(termMonths) || termMonths <= 0) return 0;
  const months = Math.round(termMonths);
  const monthlyRate = aprRate / 12;
  if (Math.abs(monthlyRate) < 1e-9) {
    return payment * months;
  }
  const factor = Math.pow(1 + monthlyRate, months);
  const numerator = payment * (factor - 1);
  const denominator = monthlyRate * factor;
  if (Math.abs(denominator) < 1e-12) {
    return payment * months;
  }
  return numerator / denominator;
}

export function solveTermForPayment(principal, payment, aprRate) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(payment) || payment <= 0) return Infinity;
  const monthlyRate = aprRate / 12;
  if (Math.abs(monthlyRate) < 1e-9) {
    return principal / payment;
  }
  const ratio = 1 - (principal * monthlyRate) / payment;
  if (ratio <= 0) {
    return Infinity;
  }
  return -Math.log(ratio) / Math.log(1 + monthlyRate);
}
