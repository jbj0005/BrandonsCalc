import { normalizeSliderValue } from "../src/ui/components/enhancedSliderHelpers.mjs";

describe("normalizeSliderValue", () => {
  test("rounds to nearest cent when no step is provided", () => {
    expect(
      normalizeSliderValue({
        rawValue: 123.4567,
        baseline: null,
        snapThreshold: 50,
      })
    ).toBe(123.46);
  });

  test("snaps exactly to baseline inside threshold window", () => {
    expect(
      normalizeSliderValue({
        rawValue: 100.08,
        baseline: 100,
        snapThreshold: 5,
        stepSize: 100,
      })
    ).toBe(100);
  });

  test("rounds to provided step size when outside snap threshold", () => {
    expect(
      normalizeSliderValue({
        rawValue: 250.555,
        baseline: 200,
        snapThreshold: 10,
        stepSize: 50,
      })
    ).toBe(250);
  });

  test("skips snapping when disableSnap is true", () => {
    expect(
      normalizeSliderValue({
        rawValue: 10150,
        baseline: 10100,
        snapThreshold: 5,
        disableSnap: true,
        stepSize: 100,
      })
    ).toBe(10200);
  });
});
