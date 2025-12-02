import React, { useState, useEffect } from 'react';
import { Modal, Card, Button, Input, Checkbox, SectionHeader } from '../ui/components';
import { ItemizationCard } from '../ui/components/ItemizationCard';
import { generateOfferText, type LeadData } from '../services/leadSubmission';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { formatPhoneNumber, formatCurrencyExact, formatEffectiveDate } from '../utils/formatters';

export interface OfferPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadData: LeadData;
  onSubmit: (data: LeadData) => void;
  // ItemizationCard props - pass through from main app
  salePrice: number;
  cashDown: number;
  tradeAllowance: number;
  tradePayoff: number;
  dealerFees: number;
  customerAddons: number;
  govtFees: number;
  stateTaxRate: number;
  countyTaxRate: number;
  stateTaxAmount: number;
  countyTaxAmount: number;
  totalTaxes: number;
  unpaidBalance: number;
  amountFinanced: number;
  cashDue: number;
  stateName?: string;
  countyName?: string;
  tradeInApplied?: number;
  tradeInCashout?: number;
  cashoutAmount?: number;
  apr: number;
  loanTerm: number;
  monthlyPayment: number;
  ratesEffectiveDate?: string | null;
  // onChange handlers
  onSalePriceChange?: (value: number) => void;
  onCashDownChange?: (value: number) => void;
  onTradeAllowanceChange?: (value: number) => void;
  onTradePayoffChange?: (value: number) => void;
  onDealerFeesChange?: (value: number) => void;
  onCustomerAddonsChange?: (value: number) => void;
  onGovtFeesChange?: (value: number) => void;
  onTradeInCashoutChange?: (value: number) => void;
}

const heroBackgroundStyle: React.CSSProperties = {
  backgroundColor: '#0f182b',
  boxShadow: '0 24px 70px rgba(0,0,0,0.55), 0 0 32px rgba(16,185,129,0.14)',
  border: '1px solid rgba(255,255,255,0.06)',
};

/**
 * OfferPreviewModal - Preview and submit vehicle offer
 *
 * New layout with:
 * - Customer Offer Hero (sale price)
 * - Vehicle Details (with stock #)
 * - Financing Details
 * - Customer Contact (auto-filled from profile)
 * - Submit button (triggers progress modal)
 */
export const OfferPreviewModal: React.FC<OfferPreviewModalProps> = ({
  isOpen,
  onClose,
  leadData,
  onSubmit,
  // ItemizationCard props
  salePrice,
  cashDown,
  tradeAllowance,
  tradePayoff,
  dealerFees,
  customerAddons,
  govtFees,
  stateTaxRate,
  countyTaxRate,
  stateTaxAmount,
  countyTaxAmount,
  totalTaxes,
  unpaidBalance,
  amountFinanced,
  cashDue,
  stateName,
  countyName,
  tradeInApplied,
  tradeInCashout,
  cashoutAmount,
  apr,
  loanTerm,
  monthlyPayment,
  ratesEffectiveDate,
  // onChange handlers
  onSalePriceChange,
  onCashDownChange,
  onTradeAllowanceChange,
  onTradePayoffChange,
  onDealerFeesChange,
  onCustomerAddonsChange,
  onGovtFeesChange,
  onTradeInCashoutChange,
}) => {
  // Get current user for profile loading
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      }
    };
    if (isOpen) {
      getUser();
    }
  }, [isOpen]);

  // Load user profile
  const { profile, isLoading: profileLoading } = useProfile({
    supabase,
    userId,
    userEmail,
    autoLoad: true
  });

  // Customer info state
  const [useProfileData, setUseProfileData] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerStreet, setCustomerStreet] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [customerZip, setCustomerZip] = useState('');
  const [saveToProfile, setSaveToProfile] = useState(false);

  // Dealer contact info state (for sending offer to specific salesman)
  const [dealerEmail, setDealerEmail] = useState('');
  const [dealerPhone, setDealerPhone] = useState('');

  // Auto-fill from profile when loaded
  useEffect(() => {
    if (profile && useProfileData && isOpen) {
      setCustomerName(profile.full_name || '');
      setCustomerEmail(profile.email || userEmail || '');
      setCustomerPhone(formatPhoneNumber(profile.phone || ''));

      setCustomerStreet(profile.street_address || '');
      setCustomerCity(profile.city || '');
      setCustomerState(profile.state || '');
      setCustomerZip(profile.zip_code || '');
    }
  }, [profile, useProfileData, isOpen, userEmail]);

  // Auto-fill dealer contact from leadData when modal opens
  useEffect(() => {
    if (isOpen && leadData) {
      setDealerEmail(leadData.dealerEmail || '');
      setDealerPhone(formatPhoneNumber(leadData.dealerPhone || ''));
    }
  }, [isOpen, leadData]);

  // Validation
  const isValid = customerName.trim() && customerEmail.trim() && customerEmail.includes('@');

  // Vehicle info string
  const vehicleInfo = `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''}`.trim();

  // Handle submit
  const handleSubmit = () => {
    if (!isValid) return;

    const combinedAddress = [customerStreet, customerCity, customerState, customerZip]
      .filter(Boolean)
      .join(', ');

    const updatedLeadData: LeadData = {
      ...leadData,
      vehiclePrice: salePrice,
      downPayment: cashDown,
      tradeValue: tradeAllowance,
      tradePayoff: tradePayoff,
      dealerFees,
      customerAddons,
      govtFees,
      dealerEmail: dealerEmail || undefined,
      dealerPhone: dealerPhone || undefined,
      apr,
      termMonths: loanTerm,
      monthlyPayment,
      ratesEffectiveDate: ratesEffectiveDate || undefined,
      customerAddress: combinedAddress,
    };

    // Generate offer text
    const offerText = generateOfferText({
      ...updatedLeadData,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress: combinedAddress,
      dealerEmail,
      dealerPhone
    });

    // Trigger submission with updated data
    onSubmit({
      ...updatedLeadData,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress: combinedAddress,
      dealerEmail,
      dealerPhone,
      offerText
    });
  };

  // Toggle profile usage
  const handleToggleProfile = () => {
    setUseProfileData(!useProfileData);
    if (useProfileData) {
      // Switching off - clear fields
      setCustomerName('');
      setCustomerEmail(userEmail || '');
      setCustomerPhone('');
      setCustomerStreet('');
      setCustomerCity('');
      setCustomerState('');
      setCustomerZip('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="max-h-[80vh] overflow-y-auto">
        {/* 1. Customer Offer Hero */}
        <div
          className="relative text-white p-8 rounded-[28px] text-center -mt-6 -mx-6 mb-8 overflow-hidden transition duration-300 hover:-translate-y-[1px] hover:shadow-[0_24px_70px_rgba(0,0,0,0.6),0_0_38px_rgba(16,185,129,0.2)]"
          style={heroBackgroundStyle}
        >
          <div className="relative flex flex-col items-center gap-3">
            <div className="text-5xl md:text-6xl font-bold" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              {formatCurrencyExact(leadData.vehiclePrice || 0)}
            </div>

            {/* Vehicle Details */}
            <div className="space-y-2">
              {vehicleInfo && (
                <div className="text-lg font-semibold drop-shadow-md">
                  {vehicleInfo}
                  {leadData.vehicleTrim && <span> • {leadData.vehicleTrim}</span>}
                </div>
              )}

              {(leadData.vehicleCondition || leadData.vehicleMileage) && (
                <div className="text-sm text-white/80">
                  {leadData.vehicleCondition && (
                    <span>{leadData.vehicleCondition.charAt(0).toUpperCase() + leadData.vehicleCondition.slice(1)}</span>
                  )}
                  {leadData.vehicleCondition && leadData.vehicleMileage && <span> • </span>}
                  {leadData.vehicleMileage && (
                    <span>{leadData.vehicleMileage.toLocaleString()} miles</span>
                  )}
                </div>
              )}

              {leadData.vehicleVIN && (
                <div
                  className="text-xs opacity-85 tracking-[0.24em] mt-2"
                  style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}
                >
                  VIN {leadData.vehicleVIN}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-6">
              <div className="rounded-2xl bg-black/20 border border-white/10 p-3 text-left">
                <div className="text-xs text-white/70 uppercase tracking-[0.12em]">Monthly Payment</div>
                <div className="text-2xl font-semibold mt-1">{formatCurrencyExact(monthlyPayment || 0)}</div>
                <div className="text-xs text-white/60 mt-1">Based on your current terms</div>
              </div>
              <div className="rounded-2xl bg-black/16 border border-white/10 p-3 text-left">
                <div className="text-xs text-white/70 uppercase tracking-[0.12em]">Cash at Signing</div>
                <div className="text-2xl font-semibold mt-1">{formatCurrencyExact(cashDue || 0)}</div>
                <div className="text-xs text-white/60 mt-1">Includes taxes & fees</div>
              </div>
              <div className="rounded-2xl bg-black/16 border border-white/10 p-3 text-left">
                <div className="text-xs text-white/70 uppercase tracking-[0.12em]">Term</div>
                <div className="text-2xl font-semibold mt-1">
                  {loanTerm || 0} mo • {apr?.toFixed(2) ?? '0.00'}% APR
                </div>
                <div className="text-xs text-white/60 mt-1">You can still adjust before sending</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-1">
          {/* 2. Itemization of Costs (editable) */}
          <ItemizationCard
            salePrice={salePrice}
            cashDown={cashDown}
            tradeAllowance={tradeAllowance}
            tradePayoff={tradePayoff}
            dealerFees={dealerFees}
            customerAddons={customerAddons}
            govtFees={govtFees}
            stateTaxRate={stateTaxRate}
            countyTaxRate={countyTaxRate}
            stateTaxAmount={stateTaxAmount}
            countyTaxAmount={countyTaxAmount}
            totalTaxes={totalTaxes}
            unpaidBalance={unpaidBalance}
            amountFinanced={amountFinanced}
            cashDue={cashDue}
            stateName={stateName}
            countyName={countyName}
            tradeInApplied={tradeInApplied}
            tradeInCashout={tradeInCashout}
            cashoutAmount={cashoutAmount}
            onSalePriceChange={onSalePriceChange}
            onCashDownChange={onCashDownChange}
            onTradeAllowanceChange={onTradeAllowanceChange}
            onTradePayoffChange={onTradePayoffChange}
            onDealerFeesChange={onDealerFeesChange}
            onCustomerAddonsChange={onCustomerAddonsChange}
            onGovtFeesChange={onGovtFeesChange}
            onTradeInCashoutChange={onTradeInCashoutChange}
          />

          {/* 4. Dealer Contact (Optional) */}
          <Card padding="lg" variant="glass" className="border-white/15 bg-white/5">
            <SectionHeader
              title="Send to Dealer (Optional)"
              subtitle="Include dealer contact details"
              tone="light"
              accent="emerald"
              size="md"
              as="h3"
              className="mb-4"
            />
            <p className="text-sm text-white/60 mb-4">Enter dealer/salesman contact to send offer directly</p>
            <div className="space-y-4">
              <Input
                label="Dealer Email"
                type="email"
                value={dealerEmail}
                onChange={(e) => setDealerEmail(e.target.value)}
                placeholder="salesman@dealer.com"
              />
              <Input
                label="Dealer Phone"
                type="tel"
                value={dealerPhone}
                onChange={(e) => setDealerPhone(formatPhoneNumber(e.target.value))}
                placeholder="(555) 123-4567"
              />
            </div>
          </Card>

          {/* 5. Customer Contact Information Card */}
          <Card padding="lg" variant="glass" className="border-white/15 bg-white/5">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader
                title="Your Contact Information"
                subtitle="Pre-fill from your profile"
                tone="light"
                accent="emerald"
                size="md"
                as="h3"
              />
              {profile && (
                <button
                  onClick={handleToggleProfile}
                  className="text-sm text-blue-400 hover:text-blue-300 hover:underline font-medium"
                  type="button"
                >
                  {useProfileData ? '✓ Using my profile' : 'Use my profile'}
                </button>
              )}
            </div>

            {profileLoading ? (
              <div className="text-center py-4 text-white/50">Loading profile...</div>
            ) : (
              <div className="space-y-4">
                <Input
                  label="Full Name *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
                <Input
                  label="Email Address *"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  required
                />
                <Input
                  label="Phone Number"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                />
                <Input
                  label="Street Address"
                  value={customerStreet}
                  onChange={(e) => setCustomerStreet(e.target.value)}
                  placeholder="123 Main St"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    label="City"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    placeholder="City"
                  />
                  <Input
                    label="State"
                    value={customerState}
                    onChange={(e) => setCustomerState(e.target.value)}
                    placeholder="State"
                  />
                  <Input
                    label="ZIP"
                    value={customerZip}
                    onChange={(e) => setCustomerZip(e.target.value)}
                    placeholder="ZIP"
                  />
                </div>

                {!useProfileData && profile && (
                  <Checkbox
                    label="Update my profile with these changes"
                    checked={saveToProfile}
                    onChange={(e) => setSaveToProfile(e.target.checked)}
                  />
                )}
              </div>
            )}
          </Card>

          {/* 6. Notification Destinations - Show where offer will be sent */}
          {(dealerEmail || dealerPhone) && (
            <Card padding="md" className="bg-blue-500/10 border-blue-400/30">
              <div className="flex items-start gap-3">
                <div className="text-2xl">📧</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-300 mb-2">
                    Your offer will be sent to the dealer:
                  </h3>
                  <div className="space-y-1.5 text-sm text-blue-200">
                    {dealerEmail && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Email:</span>
                        <span className="bg-black/20 px-2 py-0.5 rounded" style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>{dealerEmail}</span>
                      </div>
                    )}
                    {dealerPhone && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Phone:</span>
                        <span className="bg-black/20 px-2 py-0.5 rounded" style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>{dealerPhone}</span>
                        <span className="text-xs text-blue-400">(SMS if available)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 7. Submit Buttons */}
          <div className="pt-2 pb-2 space-y-3">
            <p className="text-center text-white/70 text-sm">
              You’re one tap away. We’ll package this offer beautifully and send it with the details above.
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleSubmit}
              disabled={!isValid}
            >
              Submit Offer
            </Button>
            <p className="text-center text-white/50 text-xs">
              No credit pull. You can still edit terms after you share.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default OfferPreviewModal;
