import React, { useState } from 'react';
import { Modal } from '../ui/components/Modal';
import { Button } from '../ui/components/Button';
import { Input } from '../ui/components/Input';
import { Card } from '../ui/components/Card';
import { submitLead, generateOfferText, type LeadData } from '../services/leadSubmission';
import { useToast } from '../ui/components/Toast';

export interface OfferPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadData: LeadData;
  onSuccess?: (offerId: string) => void;
}

export const OfferPreviewModal: React.FC<OfferPreviewModalProps> = ({
  isOpen,
  onClose,
  leadData,
  onSuccess,
}) => {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState(leadData.customerName || '');
  const [customerEmail, setCustomerEmail] = useState(leadData.customerEmail || '');
  const [customerPhone, setCustomerPhone] = useState(leadData.customerPhone || '');

  const offerText = generateOfferText(leadData);

  const handleSubmit = async () => {
    // Basic validation
    if (!customerName.trim()) {
      toast.push({ kind: 'error', title: 'Name Required', detail: 'Please enter your name' });
      return;
    }

    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      toast.push({ kind: 'error', title: 'Valid Email Required', detail: 'Please enter a valid email address' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update lead data with customer info
      const updatedLeadData: LeadData = {
        ...leadData,
        customerName,
        customerEmail,
        customerPhone,
        offerText,
      };

      const result = await submitLead(updatedLeadData);

      if (result.ok && result.offerId) {
        toast.push({
          kind: 'success',
          title: 'Offer Submitted!',
          detail: 'Your offer has been saved successfully',
        });
        onSuccess?.(result.offerId);
        onClose();
      } else {
        toast.push({
          kind: 'error',
          title: 'Submission Failed',
          detail: result.error || 'Failed to submit offer',
        });
      }
    } catch (error: any) {
      console.error('[OfferPreview] Submit error:', error);
      toast.push({
        kind: 'error',
        title: 'Unexpected Error',
        detail: error.message || 'An unexpected error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preview Your Offer"
    >
      <div className="space-y-6">
        {/* Offer Preview */}
        <Card padding="md">
          <h3 className="text-lg font-semibold mb-3 text-gray-900">Offer Summary</h3>
          <pre className="bg-gray-50 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap border border-gray-200">
            {offerText}
          </pre>
        </Card>

        {/* Customer Information Form */}
        <Card padding="md">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Your Information</h3>
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
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Submitting...
              </>
            ) : (
              'Submit Offer'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
