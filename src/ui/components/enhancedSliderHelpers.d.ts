export interface NormalizeSliderValueOptions {
  rawValue: number;
  baseline?: number | null;
  snapThreshold: number;
  disableSnap?: boolean;
  stepSize?: number;
}

export function normalizeSliderValue(options: NormalizeSliderValueOptions): number;
export function roundToStep(value: number, stepSize?: number): number;
