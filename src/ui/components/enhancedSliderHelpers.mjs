const roundToStep = (value, stepSize) => {
  if (!Number.isFinite(stepSize) || stepSize <= 0) {
    return Math.round(value * 100) / 100;
  }
  const normalizedStep = Math.abs(stepSize);
  return Math.round(value / normalizedStep) * normalizedStep;
};

/**
 * Normalize a slider value for calculator controls.
 * - Snap to the provided baseline when within the snap threshold
 * - Otherwise round to the slider's step size (or cents as a fallback)
 *
 * @param {Object} options
 * @param {number} options.rawValue - The raw slider value emitted by the input event
 * @param {number | null | undefined} options.baseline - Baseline value (State 1) to snap to
 * @param {number} options.snapThreshold - Distance from baseline that should snap instead of round
 * @param {boolean} [options.disableSnap=false] - Skip snapping (used for initial arrow-key move away from baseline)
 * @param {number} [options.stepSize] - Slider step size for rounding negotiations
 * @returns {number} Normalized slider value
 */
export const normalizeSliderValue = ({
  rawValue,
  baseline,
  snapThreshold,
  disableSnap = false,
  stepSize,
}) => {
  let normalizedValue = roundToStep(rawValue, stepSize);

  if (
    !disableSnap &&
    baseline != null &&
    Number.isFinite(baseline) &&
    Math.abs(normalizedValue - baseline) <= snapThreshold
  ) {
    return baseline;
  }

  return normalizedValue;
};

export { roundToStep };
