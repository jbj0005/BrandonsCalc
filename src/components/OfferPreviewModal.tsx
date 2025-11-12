import React, { useState, useEffect } from 'react';
import { Modal, Card, Button, Input, Checkbox } from '../ui/components';
import { generateOfferText, type LeadData } from '../services/leadSubmission';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { formatPhoneNumber, formatCurrencyExact, formatEffectiveDate } from '../utils/formatters';

export interface OfferPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadData: LeadData;
  onSubmit: (data: LeadData) => void;
  onDevSubmit?: (data: LeadData) => void;
  // Financial summary
  amountFinanced?: number;
  cashDue?: number;
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, bold = false }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-600">{label}</span>
    <span className={`text-sm text-gray-900 ${bold ? 'font-bold text-base' : ''}`}>
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
  onDevSubmit,
  amountFinanced,
  cashDue,
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

  // Format currency helper
  const formatCurrency = (value?: number): string => {
    if (!value) return '$0.00';
    return formatCurrencyExact(value);
  };

  // Vehicle info string
  const vehicleInfo = `${leadData.vehicleYear || ''} ${leadData.vehicleMake || ''} ${leadData.vehicleModel || ''}`.trim();

  const ratesEffectiveDateLabel = leadData.ratesEffectiveDate
    ? formatEffectiveDate(leadData.ratesEffectiveDate)
    : null;

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

  const handleDevSubmit = () => {
    if (!isValid || !onDevSubmit) return;

    const offerText = generateOfferText({
      ...leadData,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      dealerEmail,
      dealerPhone
    });

    onDevSubmit({
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
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8 rounded-t-xl text-center -mt-6 -mx-6 mb-6">
          <div className="text-sm font-medium mb-2 opacity-90">Your Offer</div>
          <div className="text-5xl font-bold mb-2">
            {formatCurrency(leadData.vehiclePrice)}
          </div>
          {vehicleInfo && (
            <div className="text-base opacity-90">{vehicleInfo}</div>
          )}
        </div>

        <div className="space-y-4 px-1">
          {/* 2. Vehicle Details Card */}
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Details</h3>
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
                    <span className="font-mono text-xs tracking-wider">
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
                    <span className="font-mono">{leadData.stockNumber}</span>
                  ) : (
                    <span className="text-gray-400 italic">Not Available</span>
                  )
                }
              />
            </div>
          </Card>

          {/* 3. Financing Details Card */}
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financing Details</h3>
            <div className="space-y-1">
              <DetailRow
                label="Monthly Payment"
                value={
                  <>
                    <span className="block text-base font-bold text-gray-900">
                      {formatCurrency(leadData.monthlyPayment)}
                    </span>
                    {ratesEffectiveDateLabel && (
                      <span className="block text-[11px] text-gray-500 mt-0.5">
                        Rates effective {ratesEffectiveDateLabel}
                      </span>
                    )}
                  </>
                }
              />
              {leadData.apr && (
                <DetailRow label="APR" value={`${leadData.apr.toFixed(2)}%`} />
              )}
              {leadData.termMonths && (
                <DetailRow
                  label="Term"
                  value={`${leadData.termMonths} months (${(leadData.termMonths / 12).toFixed(1)} years)`}
                />
              )}
              {leadData.downPayment !== undefined && (
                <DetailRow label="Down Payment" value={formatCurrency(leadData.downPayment)} />
              )}
              {leadData.dealerFees !== undefined && (
                <DetailRow label="Dealer Fees" value={formatCurrency(leadData.dealerFees)} />
              )}
              {leadData.customerAddons !== undefined && (
                <DetailRow label="Customer Add-ons" value={formatCurrency(leadData.customerAddons)} />
              )}
            </div>

            {/* Amount Financed & Cash Due */}
            {amountFinanced !== undefined && (
              <>
                <div className="border-t border-gray-200 my-4"></div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-white uppercase tracking-wide">
                        Amount Financed
                      </span>
                      <span className="text-xl font-bold text-white">
                        {formatCurrency(amountFinanced)}
                      </span>
                    </div>
                  </div>

                  {cashDue !== undefined && (
                    <div className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-white">
                          Cash Due at Signing
                        </span>
                        <span className="text-xl font-bold text-white">
                          {formatCurrency(cashDue)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* 4. Dealer Contact (Optional) */}
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Send to Dealer (Optional)</h3>
            <p className="text-sm text-gray-600 mb-4">Enter dealer/salesman contact to send offer directly</p>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Contact Information</h3>
              {profile && (
                <button
                  onClick={handleToggleProfile}
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                  type="button"
                >
                  {useProfileData ? '✓ Using my profile' : 'Use my profile'}
                </button>
              )}
            </div>

            {profileLoading ? (
              <div className="text-center py-4 text-gray-500">Loading profile...</div>
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
            <Card padding="md" className="bg-blue-50 border-blue-200">
              <div className="flex items-start gap-3">
                <div className="text-2xl">📧</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">
                    Your offer will be sent to the dealer:
                  </h3>
                  <div className="space-y-1.5 text-sm text-blue-800">
                    {dealerEmail && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Email:</span>
                        <span className="font-mono bg-white/50 px-2 py-0.5 rounded">{dealerEmail}</span>
                      </div>
                    )}
                    {dealerPhone && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Phone:</span>
                        <span className="font-mono bg-white/50 px-2 py-0.5 rounded">{dealerPhone}</span>
                        <span className="text-xs text-blue-600">(SMS if available)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 7. Submit Buttons */}
          <div className="pt-4 pb-2 space-y-3">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleSubmit}
              disabled={!isValid}
            >
              Submit Offer
            </Button>
            {onDevSubmit && (
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={handleDevSubmit}
                disabled={!isValid}
                title="Submit without sending email/SMS (dev testing)"
              >
                Dev Submit
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default OfferPreviewModal;
