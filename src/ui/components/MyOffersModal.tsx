import React, { useState, useEffect, useRef } from 'react';
import { Modal, Card, Button } from './index';
import { supabase } from '../../lib/supabase';
import { formatCurrencyExact } from '../../utils/formatters';

export interface MyOffersModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlightOfferId?: string;
}

type OfferStatus = 'active' | 'sent' | 'accepted' | 'rejected' | 'closed' | 'viewed';
type FilterOption = 'all' | OfferStatus;

interface CustomerOffer {
  id: string;
  customer_profile_id: string;
  user_id: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  vehicle_vin: string | null;
  vehicle_mileage: number | null;
  vehicle_condition: string | null;
  vehicle_stock_number: string | null;
  vehicle_price: number;
  down_payment: number | null;
  term_months: number | null;
  apr: number | null;
  monthly_payment: number | null;
  dealer_fees: number | null;
  customer_addons: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  offer_text: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<OfferStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-blue-100 text-blue-800' },
  sent: { label: 'Sent', className: 'bg-purple-100 text-purple-800' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
  viewed: { label: 'Viewed', className: 'bg-yellow-100 text-yellow-800' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-800' }
};

const FILTER_TABS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' }
];

/**
 * MyOffersModal - View and manage all submitted offers
 *
 * Features:
 * - Load all offers for current user from customer_offers table
 * - Filter by status (All | Active | Sent | Accepted | Rejected | Closed)
 * - Offer cards with vehicle info, price, date, status badge
 * - Action menu: Resend Email, Resend SMS, Share, Close Offer
 * - Empty state when no offers exist
 * - Auto-scroll to highlighted offer (newly submitted)
 *
 * @example
 * <MyOffersModal
 *   isOpen={showMyOffers}
 *   onClose={() => setShowMyOffers(false)}
 *   highlightOfferId={newOfferId}
 * />
 */
export const MyOffersModal: React.FC<MyOffersModalProps> = ({
  isOpen,
  onClose,
  highlightOfferId
}) => {
  const [offers, setOffers] = useState<CustomerOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Load user ID when modal opens
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
    };
    if (isOpen) {
      getUser();
    }
  }, [isOpen]);

  // Load offers when userId is set
  useEffect(() => {
    if (isOpen && userId) {
      loadOffers();
    }
  }, [isOpen, userId, filter]);

  // Auto-scroll to highlighted offer
  useEffect(() => {
    if (isOpen && highlightOfferId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [isOpen, highlightOfferId, offers]);

  // Load offers from database
  const loadOffers = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('customer_offers')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply filter
      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOffers(data || []);
    } catch (error) {
      console.error('Error loading offers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle resend email
  const handleResendEmail = async (offer: CustomerOffer) => {
    try {
      const vehicleInfo = [offer.vehicle_year, offer.vehicle_make, offer.vehicle_model]
        .filter(Boolean)
        .join(' ');

      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          offerId: offer.id,
          recipientEmail: offer.customer_email,
          recipientName: offer.customer_name,
          offerText: offer.offer_text || 'No offer details available',
          vehicleInfo
        }
      });

      if (error) throw error;
      alert('Email sent successfully!');
    } catch (error: any) {
      console.error('Error sending email:', error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setActionMenuOpen(null);
    }
  };

  // Handle resend SMS
  const handleResendSMS = async (offer: CustomerOffer) => {
    try {
      // Check TCPA opt-in status
      if (!offer.customer_phone) {
        alert('No phone number on file for this offer.');
        return;
      }

      const { data: optStatus } = await supabase
        .from('sms_opt_status')
        .select('opted_in')
        .eq('phone_number', offer.customer_phone)
        .maybeSingle();

      if (!optStatus?.opted_in) {
        alert('Customer has not opted in to receive SMS messages. Cannot send.');
        return;
      }

      const { error } = await supabase.functions.invoke('send-sms', {
        body: {
          offerId: offer.id,
          recipientPhone: offer.customer_phone,
          recipientName: offer.customer_name,
          offerText: offer.offer_text || 'No offer details available'
        }
      });

      if (error) throw error;
      alert('SMS sent successfully!');
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      alert(`Failed to send SMS: ${error.message}`);
    } finally {
      setActionMenuOpen(null);
    }
  };

  // Handle share offer (copy link to clipboard)
  const handleShare = (offer: CustomerOffer) => {
    const shareUrl = `${window.location.origin}/offer/${offer.id}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Offer link copied to clipboard!');
    setActionMenuOpen(null);
  };

  // Handle close offer
  const handleCloseOffer = async (offerId: string) => {
    if (!confirm('Are you sure you want to close this offer? A copy will be emailed to you for your records.')) {
      return;
    }

    try {
      // Find the offer to get customer email
      const offer = offers.find(o => o.id === offerId);
      if (!offer) {
        throw new Error('Offer not found');
      }

      // Send copy to customer email before closing
      if (offer.customer_email) {
        const vehicleInfo = [offer.vehicle_year, offer.vehicle_make, offer.vehicle_model]
          .filter(Boolean)
          .join(' ');

        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            offerId: offer.id,
            recipientEmail: offer.customer_email,
            recipientName: offer.customer_name,
            offerText: offer.offer_text || 'No offer details available',
            vehicleInfo: vehicleInfo || 'Vehicle',
            subject: `Closed Offer - ${vehicleInfo}` // Custom subject for closed offers
          }
        });

        if (emailError) {
          console.error('Failed to send email copy:', emailError);
          // Don't block the close operation if email fails
        }
      }

      // Update offer status to closed
      const { error } = await supabase
        .from('customer_offers')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', offerId);

      if (error) throw error;

      // Reload offers
      await loadOffers();
      alert('Offer closed successfully. A copy has been sent to your email.');
    } catch (error: any) {
      console.error('Error closing offer:', error);
      alert(`Failed to close offer: ${error.message}`);
    } finally {
      setActionMenuOpen(null);
    }
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Format vehicle info
  const getVehicleInfo = (offer: CustomerOffer): string => {
    const parts = [offer.vehicle_year, offer.vehicle_make, offer.vehicle_model, offer.vehicle_trim]
      .filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Vehicle details not available';
  };

  // Empty state
  if (!isLoading && offers.length === 0 && filter === 'all') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <div className="text-center py-16 px-6">
          <div className="text-6xl mb-6">📋</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">No Offers Yet</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            You haven't submitted any offers yet. Start by configuring your ideal vehicle
            and financing options, then submit your first offer!
          </p>
          <Button variant="primary" size="lg" onClick={onClose}>
            Create Your First Offer
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">My Offers</h2>
          <p className="text-gray-600">View and manage all your submitted vehicle offers</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                filter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            Loading your offers...
          </div>
        )}

        {/* No Results for Filter */}
        {!isLoading && offers.length === 0 && filter !== 'all' && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">🔍</div>
            No {filter} offers found.
          </div>
        )}

        {/* Offers Grid */}
        {!isLoading && offers.length > 0 && (
          <div className="space-y-4">
            {offers.map((offer) => {
              const isHighlighted = offer.id === highlightOfferId;
              return (
                <div
                  key={offer.id}
                  ref={isHighlighted ? highlightRef : null}
                  className={`transition-all duration-300 ${
                    isHighlighted ? 'ring-4 ring-blue-500 ring-opacity-50' : ''
                  }`}
                >
                  <Card padding="md" className="relative overflow-visible">
                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          STATUS_CONFIG[offer.status].className
                        }`}
                      >
                        {STATUS_CONFIG[offer.status].label}
                      </span>
                    </div>

                    {/* Main Content */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      {/* Vehicle Info */}
                      <div className="md:col-span-2">
                        <h3 className="text-lg font-bold text-gray-900 mb-1 pr-24">
                          {getVehicleInfo(offer)}
                        </h3>
                        <div className="text-sm text-gray-600 space-y-1">
                          {offer.vehicle_vin && (
                            <div>
                              <span className="font-medium">VIN:</span>{' '}
                              <span className="font-mono text-xs">{offer.vehicle_vin}</span>
                            </div>
                          )}
                          {offer.vehicle_stock_number && (
                            <div>
                              <span className="font-medium">Stock #:</span>{' '}
                              <span className="font-mono">{offer.vehicle_stock_number}</span>
                            </div>
                          )}
                          {offer.vehicle_mileage && (
                            <div>
                              <span className="font-medium">Mileage:</span>{' '}
                              {offer.vehicle_mileage.toLocaleString()} miles
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right">
                        <div className="text-sm text-gray-600 mb-1">Offer Price</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {formatCurrencyExact(offer.vehicle_price)}
                        </div>
                        {offer.monthly_payment && (
                          <div className="text-sm text-gray-600 mt-1">
                            {formatCurrencyExact(offer.monthly_payment)}/mo
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financing Details */}
                    {(offer.apr || offer.term_months || offer.down_payment) && (
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4 pt-4 border-t border-gray-200">
                        {offer.apr && (
                          <div>
                            <span className="font-medium">APR:</span> {offer.apr.toFixed(2)}%
                          </div>
                        )}
                        {offer.term_months && (
                          <div>
                            <span className="font-medium">Term:</span> {offer.term_months} months
                          </div>
                        )}
                        {offer.down_payment !== null && offer.down_payment !== undefined && (
                          <div>
                            <span className="font-medium">Down:</span>{' '}
                            {formatCurrencyExact(offer.down_payment)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-500">
                        Submitted {formatDate(offer.created_at)}
                      </div>

                      {/* Action Menu */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuOpen(actionMenuOpen === offer.id ? null : offer.id)
                          }
                          className="text-gray-600 hover:text-gray-900 font-medium text-sm px-3 py-1 rounded hover:bg-gray-100"
                        >
                          Actions ▾
                        </button>

                        {actionMenuOpen === offer.id && (
                          <>
                            {/* Backdrop to close menu */}
                            <div
                              className="fixed inset-0 z-[9998]"
                              onClick={() => setActionMenuOpen(null)}
                            />

                            {/* Dropdown Menu */}
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-[9999]">
                              <button
                                onClick={() => handleResendEmail(offer)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                              >
                                <span>📧</span> Resend Email
                              </button>
                              <button
                                onClick={() => handleResendSMS(offer)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                              >
                                <span>📱</span> Resend SMS
                              </button>
                              <button
                                onClick={() => handleShare(offer)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                              >
                                <span>🔗</span> Share Offer
                              </button>
                              <hr className="my-2 border-gray-200" />
                              <button
                                onClick={() => handleCloseOffer(offer.id)}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <span>✕</span> Close Offer
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

MyOffersModal.displayName = 'MyOffersModal';

export default MyOffersModal;
