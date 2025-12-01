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

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, bold = false }) => (
  <div className="flex justify-between items-center py-2 border-b border-white/10 last:border-0">
    <span className="text-sm text-white/60">{label}</span>
    <span className={`text-sm text-white ${bold ? 'font-bold text-base' : ''}`}>
      {value}
    </span>
  </div>
);

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
  const [customerAddress, setCustomerAddress] = useState('');
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

      // Build address string from components
      const addressParts = [
        profile.street_address,
        profile.city,
        profile.state,
        profile.zip_code
      ].filter(Boolean);
      setCustomerAddress(addressParts.join(', '));
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

    // Generate offer text
    const offerText = generateOfferText({
      ...leadData,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      dealerEmail,
      dealerPhone
    });

    // Trigger submission with updated data
    onSubmit({
      ...leadData,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
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
      setCustomerAddress('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="max-h-[80vh] overflow-y-auto">
        {/* 1. Customer Offer Hero */}
        <div className="bg-gradient-to-br from-emerald-600 to-blue-600 text-white p-8 rounded-t-xl text-center -mt-6 -mx-6 mb-6 border-b border-white/10">
          <div className="text-sm font-medium mb-2 opacity-90 uppercase tracking-wider">Your Offer</div>
          <div className="text-5xl font-bold mb-4" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
            {formatCurrencyExact(leadData.vehiclePrice || 0)}
          </div>

          {/* Vehicle Details */}
          <div className="space-y-1.5">
            {/* Year, Make, Model, Trim */}
            {vehicleInfo && (
              <div className="text-lg font-semibold">
                {vehicleInfo}
                {leadData.vehicleTrim && <span> • {leadData.vehicleTrim}</span>}
              </div>
            )}

            {/* Condition and Mileage */}
            {(leadData.vehicleCondition || leadData.vehicleMileage) && (
              <div className="text-sm opacity-90">
                {leadData.vehicleCondition && (
                  <span>{leadData.vehicleCondition.charAt(0).toUpperCase() + leadData.vehicleCondition.slice(1)}</span>
                )}
                {leadData.vehicleCondition && leadData.vehicleMileage && <span> • </span>}
                {leadData.vehicleMileage && (
                  <span>{leadData.vehicleMileage.toLocaleString()} miles</span>
                )}
              </div>
            )}

            {/* VIN - Bottom Row */}
            {leadData.vehicleVIN && (
              <div className="text-xs opacity-80 tracking-wider mt-2" style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>
                VIN: {leadData.vehicleVIN}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 px-1">
          {/* 2. Vehicle Details Card */}
          <Card padding="md">
            <SectionHeader
              title="Vehicle Details"
              subtitle="Confirm the listing info"
              tone="light"
              accent="emerald"
              size="md"
              as="h3"
              className="mb-4"
            />
            <div className="space-y-1">
              <DetailRow
                label="Year / Make / Model"
                value={vehicleInfo || 'Not specified'}
              />
              {leadData.vehicleTrim && (
                <DetailRow label="Trim" value={leadData.vehicleTrim} />
              )}
              {leadData.vehicleVIN && (
                <DetailRow
                  label="VIN"
                  value={
                    <span className="text-xs tracking-wider" style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>
                      {leadData.vehicleVIN}
                    </span>
                  }
                />
              )}
              {leadData.vehicleMileage && (
                <DetailRow
                  label="Mileage"
                  value={`${leadData.vehicleMileage.toLocaleString()} miles`}
                />
              )}
              {leadData.vehicleCondition && (
                <DetailRow
                  label="Condition"
                  value={leadData.vehicleCondition.charAt(0).toUpperCase() + leadData.vehicleCondition.slice(1)}
                />
              )}
              <DetailRow
                label="Stock #"
                value={
                  leadData.stockNumber ? (
                    <span style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>{leadData.stockNumber}</span>
                  ) : (
                    <span className="text-white/40 italic">Not Available</span>
                  )
                }
              />
            </div>
          </Card>

          {/* 3. Itemization of Costs (editable) */}
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
          <Card padding="md">
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
          <Card padding="md">
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
                  label="Address"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="123 Main St, City, State, ZIP"
                />

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
          <div className="pt-4 pb-2">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleSubmit}
              disabled={!isValid}
            >
              Submit Offer
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default OfferPreviewModal;
