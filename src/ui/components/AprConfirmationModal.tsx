import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Badge } from './Badge';

export interface AprConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lenderApr: number;
  customApr: number;
  isNewVehicle?: boolean;
  onResetApr: () => void;
  onConfirm: () => void;
}

/**
 * AprConfirmationModal - Surfaces when custom APR override exists before review/submit
 *
 * Shows lender APR vs custom APR with diff badges and reset buttons.
 */
export const AprConfirmationModal: React.FC<AprConfirmationModalProps> = ({
  isOpen,
  onClose,
  lenderApr,
  customApr,
  isNewVehicle = false,
  onResetApr,
  onConfirm,
}) => {
  const aprDiff = customApr - lenderApr;
  const isDiffSignificant = Math.abs(aprDiff) >= 0.0001;

  const formatApr = (apr: number) => {
    return `${(apr * 100).toFixed(2)}%`;
  };

  const handleReset = () => {
    onResetApr();
    onClose();
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  // Expose to window for legacy compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.closeAprConfirmationModal = onClose;
    }
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="APR Override Detected"
      size="md"
    >
      <div className="space-y-6">
        {/* Warning Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-blue-800 mb-2">
                You've manually adjusted the APR
              </h4>
              <p className="text-sm text-blue-700">
                Would you like to continue with your custom APR, or reset to the recommended lender rate?
              </p>
            </div>
          </div>
        </div>

        {/* APR Comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Lender APR */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Lender APR</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatApr(lenderApr)}
            </div>
            <Badge variant="default" size="sm">
              Recommended
            </Badge>
          </div>

          {/* Custom APR */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-xs text-blue-600 mb-1">Your Custom APR</div>
            <div className="text-2xl font-bold text-blue-900 mb-1 flex items-baseline gap-2">
              {formatApr(customApr)}
              {isDiffSignificant && (
                <span
                  className={`text-sm font-semibold ${
                    aprDiff < 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {aprDiff < 0 ? '' : '+'}
                  {formatApr(aprDiff)}
                </span>
              )}
            </div>
            <Badge
              variant={aprDiff < 0 ? 'success' : 'warning'}
              size="sm"
            >
              {aprDiff < 0 ? 'Better Rate' : 'Higher Rate'}
            </Badge>
          </div>
        </div>

        {/* Impact Message */}
        {isDiffSignificant && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            {aprDiff < 0 ? (
              <p>
                Your custom APR is <strong>{formatApr(Math.abs(aprDiff))}</strong> lower than the
                lender rate. This will result in lower monthly payments.
              </p>
            ) : (
              <p>
                Your custom APR is <strong>{formatApr(aprDiff)}</strong> higher than the lender
                rate. This will result in higher monthly payments.
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={handleReset} fullWidth>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reset to {formatApr(lenderApr)}
          </Button>
          <Button variant="primary" onClick={handleConfirm} fullWidth>
            Continue with {formatApr(customApr)}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Add type definitions to window
declare global {
  interface Window {
    closeAprConfirmationModal?: () => void;
  }
}

export default AprConfirmationModal;
