import { jest } from "@jest/globals";

let generateOfferText: any;

beforeAll(async () => {
  await jest.unstable_mockModule("../src/lib/supabase", () => ({
    supabase: {
      auth: { getSession: jest.fn() },
      functions: { invoke: jest.fn() },
    },
  }));

  const mod = await import("../src/services/leadSubmission");
  generateOfferText = mod.generateOfferText;
});

const baseLead = {
  vehicleYear: 2024,
  vehicleMake: "GMC",
  vehicleModel: "Sierra EV Denali",
  vehicleVIN: "1GT401EL6RU402072",
  vehicleMileage: 8281,
  vehicleCondition: "new",
  vehiclePrice: 69000,
  dealerAskingPrice: 75295,
  dealerName: "Delray Buick Gmc",
  dealerPhone: "(555) 111-2222",
  dealerAddress: "2400 S Federal Hwy, Delray Beach, FL 33483",
  apr: 3.99,
  termMonths: 72,
  monthlyPayment: 1079.2,
  downPayment: 5050.19,
  dealerFees: 598,
  customerName: "James B Johns",
  customerEmail: "james.johns83@gmail.com",
  customerPhone: "(256) 655-5655",
};

describe("generateOfferText templates", () => {
  test("customer format includes financing, fees, savings", () => {
    const text = generateOfferText(baseLead, "customer");
    expect(text).toContain("VEHICLE OFFER SUMMARY");
    expect(text).toContain("CUSTOMER OFFER");
    expect(text).toContain("Savings:");
    expect(text).toContain("FINANCING DETAILS");
    expect(text).toContain("Monthly Payment");
    expect(text).toContain("APR");
    expect(text).toContain("Down Payment");
    expect(text).toContain("FEES & ADDONS");
    expect(text).toContain("Dealer Fees");
  });

  test("dealer format omits financing, fees, savings", () => {
    const text = generateOfferText(baseLead, "dealer");
    expect(text).toContain("DEALER OFFER SUMMARY");
    expect(text).not.toContain("Savings:");
    expect(text).not.toContain("FINANCING DETAILS");
    expect(text).not.toContain("Monthly Payment");
    expect(text).not.toContain("APR");
    expect(text).not.toContain("Down Payment");
    expect(text).not.toContain("FEES & ADDONS");
    expect(text).not.toContain("Dealer Fees");
  });
});
import { jest } from "@jest/globals";
import { jest } from "@jest/globals";
