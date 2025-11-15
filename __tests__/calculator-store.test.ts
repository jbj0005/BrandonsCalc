import { jest } from "@jest/globals";
import { useCalculatorStore } from "../src/stores/calculatorStore";

const seedSliders = () => ({
  salePrice: { value: 10000, baseline: 10000 },
  cashDown: { value: 2000, baseline: 2000 },
  tradeAllowance: { value: 1500, baseline: 1500 },
  dealerFees: { value: 800, baseline: 800 },
  customerAddons: { value: 600, baseline: 600 },
  govtFees: { value: 400, baseline: 400 },
});

describe("setSliderValueWithSettling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useCalculatorStore.setState((state) => ({
      ...state,
      sliders: seedSliders(),
      settlingTimerId: null,
      lastSliderInteraction: 0,
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("updates baselines for every slider after the delay", () => {
    const { setSliderValueWithSettling } = useCalculatorStore.getState();
    setSliderValueWithSettling("salePrice", 12000);

    const immediateState = useCalculatorStore.getState().sliders.salePrice;
    expect(immediateState.value).toBe(12000);
    expect(immediateState.baseline).toBe(10000);

    jest.advanceTimersByTime(2999);
    expect(useCalculatorStore.getState().sliders.salePrice.baseline).toBe(10000);

    jest.advanceTimersByTime(1);
    const updatedSliders = useCalculatorStore.getState().sliders;
    expect(updatedSliders.salePrice.baseline).toBe(12000);
    expect(updatedSliders.salePrice.value).toBe(12000);

    Object.values(updatedSliders).forEach((sliderState) => {
      expect(sliderState.baseline).toBe(sliderState.value);
    });
    expect(useCalculatorStore.getState().settlingTimerId).toBeNull();
  });

  test("clears the pending timer when another change happens", () => {
    const { setSliderValueWithSettling } = useCalculatorStore.getState();

    setSliderValueWithSettling("salePrice", 12500);
    const firstTimer = useCalculatorStore.getState().settlingTimerId;

    setSliderValueWithSettling("salePrice", 13000);
    const secondTimer = useCalculatorStore.getState().settlingTimerId;

    expect(firstTimer).not.toBe(secondTimer);

    jest.advanceTimersByTime(3000);
    expect(useCalculatorStore.getState().sliders.salePrice.baseline).toBe(13000);
  });
});
