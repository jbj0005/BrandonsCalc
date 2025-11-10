import React, { useState, useEffect } from 'react';
import { Input, Select, Slider, Button, Card } from './ui/components';
import { useToast } from './ui/components/Toast';
import type { SelectOption } from './ui/components/Select';

/**
 * CalculatorApp - Main auto loan calculator application
 *
 * This is a full React rewrite of the vanilla JS calculator,
 * using the component library we built.
 */
export const CalculatorApp: React.FC = () => {
  const toast = useToast();

  // Location & Vehicle State
  const [location, setLocation] = useState('');
  const [vin, setVin] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  // Financing State
  const [lender, setLender] = useState('lowest');
  const [loanTerm, setLoanTerm] = useState(72);
  const [creditScore, setCreditScore] = useState('excellent');

  // Slider State (all in dollars except term)
  const [salePrice, setSalePrice] = useState(30000);
  const [cashDown, setCashDown] = useState(5000);
  const [tradeAllowance, setTradeAllowance] = useState(0);
  const [tradePayoff, setTradePayoff] = useState(0);
  const [dealerFees, setDealerFees] = useState(0);
  const [customerAddons, setCustomerAddons] = useState(0);

  // Calculated values
  const [apr, setApr] = useState(5.99);
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const [amountFinanced, setAmountFinanced] = useState(0);
  const [financeCharge, setFinanceCharge] = useState(0);
  const [totalOfPayments, setTotalOfPayments] = useState(0);

  // Lender options (will be populated from real data)
  const lenderOptions: SelectOption[] = [
    { value: 'lowest', label: 'Lowest Price by APR' },
    { value: 'nfcu', label: 'Navy Federal Credit Union' },
    { value: 'dcu', label: 'DCU' },
    { value: 'launch', label: 'Launch FCU' },
  ];

  // Loan term options
  const termOptions: SelectOption[] = [
    { value: '36', label: '36 months (3 years)' },
    { value: '48', label: '48 months (4 years)' },
    { value: '60', label: '60 months (5 years)' },
    { value: '72', label: '72 months (6 years)' },
    { value: '84', label: '84 months (7 years)' },
  ];

  // Credit score options
  const creditScoreOptions: SelectOption[] = [
    { value: 'excellent', label: 'Excellent (750+)' },
    { value: 'good', label: 'Good (700-749)' },
    { value: 'fair', label: 'Fair (650-699)' },
    { value: 'poor', label: 'Building Credit (< 650)' },
  ];

  // Calculate loan on any change
  useEffect(() => {
    calculateLoan();
  }, [salePrice, cashDown, tradeAllowance, tradePayoff, dealerFees, customerAddons, loanTerm, apr]);

  const calculateLoan = () => {
    // Calculate amount financed
    const totalPrice = salePrice + dealerFees + customerAddons;
    const downPayment = cashDown + (tradeAllowance - tradePayoff);
    const financed = totalPrice - downPayment;
    setAmountFinanced(financed);

    if (financed <= 0 || apr <= 0 || loanTerm <= 0) {
      setMonthlyPayment(0);
      setFinanceCharge(0);
      setTotalOfPayments(0);
      return;
    }

    // Monthly interest rate
    const monthlyRate = apr / 100 / 12;

    // Monthly payment formula: P * [r(1 + r)^n] / [(1 + r)^n - 1]
    const payment = financed * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) /
                    (Math.pow(1 + monthlyRate, loanTerm) - 1);

    setMonthlyPayment(payment);

    const total = payment * loanTerm;
    setTotalOfPayments(total);
    setFinanceCharge(total - financed);
  };

  const handleAprChange = (delta: number) => {
    const newApr = Math.max(0, Math.min(99.99, apr + delta));
    setApr(parseFloat(newApr.toFixed(2)));
  };

  const handleTermChange = (delta: number) => {
    const terms = [36, 48, 60, 72, 84];
    const currentIndex = terms.indexOf(loanTerm);
    const newIndex = Math.max(0, Math.min(terms.length - 1, currentIndex + delta));
    setLoanTerm(terms[newIndex]);
  };

  const handleSubmit = () => {
    toast.push({
      kind: 'success',
      title: 'Offer Submitted!',
      detail: 'Your loan application has been submitted successfully.',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Brandon's Calculator
          </h1>
          <p className="text-lg text-gray-600">
            Find the best auto loan rates in seconds
          </p>
        </div>

        {/* Main Grid - Left column (inputs) + Right column (summary) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN: Inputs (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Location & Vehicle Section */}
            <Card variant="elevated" padding="lg">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                Location & Vehicle
              </h2>

              <div className="space-y-4">
                <Input
                  label="Your Location"
                  type="text"
                  placeholder="Enter your address or ZIP code..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                  fullWidth
                />

                <Input
                  label="VIN or Search Saved Vehicles"
                  type="text"
                  placeholder="Paste VIN or select saved vehicle..."
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  }
                  helperText="Enter a VIN or click to search your saved vehicles"
                  fullWidth
                />
              </div>
            </Card>

            {/* Financing Details Section */}
            <Card variant="elevated" padding="lg">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                Financing Details
              </h2>

              <div className="space-y-4">
                <Select
                  label="Preferred Lender"
                  value={lender}
                  onChange={(e) => setLender(e.target.value)}
                  options={lenderOptions}
                  fullWidth
                />

                <Select
                  label="Loan Term"
                  value={loanTerm.toString()}
                  onChange={(e) => setLoanTerm(Number(e.target.value))}
                  options={termOptions}
                  fullWidth
                />

                <Select
                  label="Credit Score Range"
                  value={creditScore}
                  onChange={(e) => setCreditScore(e.target.value)}
                  options={creditScoreOptions}
                  fullWidth
                />
              </div>
            </Card>

          </div>

          {/* RIGHT COLUMN: Summary (1/3 width, sticky) */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <Card variant="elevated" padding="lg">
                {/* Monthly Payment Hero */}
                <div className="text-center mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    Estimated Monthly Payment
                  </div>
                  <div className="text-5xl font-bold text-gray-900 mb-2">
                    {formatCurrency(monthlyPayment)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {loanTerm} months • {apr.toFixed(2)}% APR
                  </div>
                </div>

                {/* Truth-in-Lending Disclosures */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                    Truth-in-Lending Disclosures
                  </h3>

                  {/* APR with +/- controls */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">
                      Annual Percentage Rate
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleAprChange(-0.01)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                        aria-label="Decrease APR"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                      <div className="text-3xl font-bold text-gray-900 min-w-[120px] text-center">
                        {apr.toFixed(2)}%
                      </div>
                      <button
                        onClick={() => handleAprChange(0.01)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                        aria-label="Increase APR"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-1">
                      Cost of credit as yearly rate
                    </div>
                  </div>

                  {/* Term with +/- controls */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">
                      Term (Months)
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleTermChange(-1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                        aria-label="Decrease term"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                      <div className="text-3xl font-bold text-gray-900 min-w-[120px] text-center">
                        {loanTerm}
                      </div>
                      <button
                        onClick={() => handleTermChange(1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                        aria-label="Increase term"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-1">
                      Length of loan agreement
                    </div>
                  </div>

                  {/* Other TIL values */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Finance Charge</span>
                      <span className="text-lg font-semibold text-gray-900">
                        {formatCurrency(financeCharge)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Amount Financed</span>
                      <span className="text-lg font-semibold text-gray-900">
                        {formatCurrency(amountFinanced)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-sm font-medium text-blue-900">Total of Payments</span>
                      <span className="text-lg font-bold text-blue-900">
                        {formatCurrency(totalOfPayments)}
                      </span>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={handleSubmit}
                  >
                    Preview Offer
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Sliders Section - Full Width Below */}
        <div className="mt-6">
          <Card variant="elevated" padding="lg">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Adjust Pricing & Terms
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Slider
                label="Sale Price"
                min={0}
                max={150000}
                step={500}
                value={salePrice}
                onChange={(e) => setSalePrice(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                fullWidth
              />

              <Slider
                label="Cash Down"
                min={0}
                max={50000}
                step={500}
                value={cashDown}
                onChange={(e) => setCashDown(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                fullWidth
              />

              <Slider
                label="Trade-In Allowance"
                min={0}
                max={75000}
                step={500}
                value={tradeAllowance}
                onChange={(e) => setTradeAllowance(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Value of your trade-in vehicle"
                fullWidth
              />

              <Slider
                label="Trade-In Payoff"
                min={0}
                max={75000}
                step={500}
                value={tradePayoff}
                onChange={(e) => setTradePayoff(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Amount owed on trade-in"
                fullWidth
              />

              <Slider
                label="Total Dealer Fees"
                min={0}
                max={5000}
                step={50}
                value={dealerFees}
                onChange={(e) => setDealerFees(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Doc fees, title, registration"
                fullWidth
              />

              <Slider
                label="Total Customer Add-ons"
                min={0}
                max={10000}
                step={100}
                value={customerAddons}
                onChange={(e) => setCustomerAddons(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Warranties, protection packages"
                fullWidth
              />
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default CalculatorApp;
