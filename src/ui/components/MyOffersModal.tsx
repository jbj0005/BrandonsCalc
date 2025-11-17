import React, { useState, useEffect, useRef } from 'react';
import { Modal, Card, Button } from './index';
import { supabase } from '../../lib/supabase';
import { formatCurrencyExact } from '../../utils/formatters';
import { useToast } from './Toast';

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
  vehicle_photo_url: string | null;
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
  active: { label: 'Active', className: 'bg-blue-500/20 text-blue-300 border border-blue-400/30' },
  sent: { label: 'Sent', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' },
  accepted: { label: 'Accepted', className: 'bg-green-500/20 text-green-300 border border-green-400/30' },
  rejected: { label: 'Rejected', className: 'bg-red-500/20 text-red-300 border border-red-400/30' },
  viewed: { label: 'Viewed', className: 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30' },
  closed: { label: 'Closed', className: 'bg-white/10 text-white/60 border border-white/20' }
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
  const toast = useToast();
  const [offers, setOffers] = useState<CustomerOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const actionMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  useEffect(() => {
    if (!actionMenuOpen) return;
    const menuEl = actionMenuRefs.current.get(actionMenuOpen);
    if (!menuEl) return;
    requestAnimationFrame(() => {
      menuEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [actionMenuOpen]);

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
      // Failed to load offers
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
      toast.push({
        kind: 'success',
        title: 'Email Sent',
        detail: 'Offer email has been sent successfully'
      });
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Failed to Send Email',
        detail: error.message || 'An error occurred'
      });
    } finally {
      setActionMenuOpen(null);
    }
  };

  // Handle resend SMS
  const handleResendSMS = async (offer: CustomerOffer) => {
    try {
      // Check TCPA opt-in status
      if (!offer.customer_phone) {
        toast.push({
          kind: 'warning',
          title: 'No Phone Number',
          detail: 'No phone number on file for this offer'
        });
        return;
      }

      const { data: optStatus } = await supabase
        .from('sms_opt_status')
        .select('opted_in')
        .eq('phone_number', offer.customer_phone)
        .maybeSingle();

      if (!optStatus?.opted_in) {
        toast.push({
          kind: 'warning',
          title: 'Cannot Send SMS',
          detail: 'Customer has not opted in to receive SMS messages'
        });
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
      toast.push({
        kind: 'success',
        title: 'SMS Sent',
        detail: 'Offer SMS has been sent successfully'
      });
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Failed to Send SMS',
        detail: error.message || 'An error occurred'
      });
    } finally {
      setActionMenuOpen(null);
    }
  };

  // Handle share offer (copy link to clipboard)
  const handleShare = (offer: CustomerOffer) => {
    const shareUrl = `${window.location.origin}/offer/${offer.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.push({
      kind: 'success',
      title: 'Link Copied',
      detail: 'Offer link copied to clipboard'
    });
    setActionMenuOpen(null);
  };

  // Handle close offer
  const handleCloseOffer = async (offerId: string) => {
    try {
      // Find the offer to get customer email
      const offer = offers.find(o => o.id === offerId);
      if (!offer) {
        throw new Error('Offer not found');
      }

      // Send copy to customer email before deleting
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
          // Don't block the close operation if email fails
        }
      }

      // Delete the offer
      const { error } = await supabase
        .from('customer_offers')
        .delete()
        .eq('id', offerId);

      if (error) throw error;

      // Remove from local state immediately (no need to reload)
      setOffers(prevOffers => prevOffers.filter(o => o.id !== offerId));

      // Show success toast
      toast.push({
        kind: 'success',
        title: 'Offer Closed',
        detail: 'A copy has been sent to your email'
      });
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Failed to Close Offer',
        detail: error.message || 'An error occurred'
      });
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
          <h3 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>No Offers Yet</h3>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
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
          <h3 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>My Offers</h3>
          <p className="text-white/60">View and manage all your submitted vehicle offers</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-200 ${
                filter === tab.value
                  ? 'bg-gradient-to-r from-emerald-600 to-blue-600 text-white border border-emerald-400/30'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12 text-white/60">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            Loading your offers...
          </div>
        )}

        {/* No Results for Filter */}
        {!isLoading && offers.length === 0 && filter !== 'all' && (
          <div className="text-center py-12 text-white/60">
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
                    {/* Status Badge and Delete Icon */}
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          STATUS_CONFIG[offer.status].className
                        }`}
                      >
                        {STATUS_CONFIG[offer.status].label}
                      </span>
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this offer? A copy will be sent to your email.')) {
                            handleCloseOffer(offer.id);
                          }
                        }}
                        className="p-1.5 rounded-full hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors border border-red-400/30"
                        title="Delete offer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* Main Content */}
                    <div className="flex gap-4 mb-4 pt-8">
                      {/* Vehicle Photo */}
                      {offer.vehicle_photo_url ? (
                        <div className="w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-black/30 shadow-md border border-white/10">
                          <img
                            src={offer.vehicle_photo_url}
                            alt={getVehicleInfo(offer)}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.classList.add('hidden');
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-32 h-32 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-md border border-white/10">
                          <svg className="w-16 h-16 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}

                      {/* Vehicle Info and Price */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Vehicle Info */}
                        <div className="md:col-span-2">
                          <h3 className="text-lg font-semibold text-white mb-2 pr-24" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                            {getVehicleInfo(offer)}
                          </h3>
                          <div className="text-sm text-white/60 space-y-1">
                            {offer.vehicle_vin && (
                              <div>
                                <span className="font-medium">VIN:</span>{' '}
                                <span className="text-xs" style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>{offer.vehicle_vin}</span>
                              </div>
                            )}
                            {offer.vehicle_stock_number && (
                              <div>
                                <span className="font-medium">Stock #:</span>{' '}
                                <span style={{ fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>{offer.vehicle_stock_number}</span>
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
                        <div className="text-right pr-24">
                          <div className="text-sm text-white/60 mb-1">Offer Price</div>
                          <div className="text-2xl font-bold text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                            {formatCurrencyExact(offer.vehicle_price)}
                          </div>
                          {offer.monthly_payment && (
                            <div className="text-sm text-white/60 mt-1">
                              {formatCurrencyExact(offer.monthly_payment)}/mo
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Financing Details */}
                    {(offer.apr || offer.term_months || offer.down_payment) && (
                      <div className="flex flex-wrap gap-4 text-sm text-white/60 mb-4 pt-4 border-t border-white/10">
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
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="text-sm text-white/50">
                        Submitted {formatDate(offer.created_at)}
                      </div>

                      {/* Action Menu */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuOpen(actionMenuOpen === offer.id ? null : offer.id)
                          }
                          className="text-white/70 hover:text-white font-medium text-sm px-3 py-1 rounded hover:bg-white/10 transition-colors"
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
                            <div
                              ref={(el) => {
                                if (el) {
                                  actionMenuRefs.current.set(offer.id, el);
                                } else {
                                  actionMenuRefs.current.delete(offer.id);
                                }
                              }}
                              className="absolute right-0 mt-2 w-56 bg-gradient-to-br from-slate-900 to-slate-950 rounded-lg shadow-lg border border-white/10 py-2 z-[9999]"
                            >
                              <button
                                onClick={() => handleResendEmail(offer)}
                                className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                              >
                                <span>📧</span> Resend Email
                              </button>
                              <button
                                onClick={() => handleResendSMS(offer)}
                                className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                              >
                                <span>📱</span> Resend SMS
                              </button>
                              <button
                                onClick={() => handleShare(offer)}
                                className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                              >
                                <span>🔗</span> Share Offer
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
