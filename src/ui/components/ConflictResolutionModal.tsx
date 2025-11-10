import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface FieldConflict {
  field: string;
  label: string;
  currentValue: any;
  serverValue: any;
  formatter?: (value: any) => string;
}

export interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: FieldConflict[];
  onCancel: () => void;
  onOverwrite: () => void;
}

/**
 * ConflictResolutionModal - Shows when editing a saved vehicle if Supabase changed fields mid-edit
 *
 * Lists per-field diffs and offers "Cancel" vs "Overwrite".
 */
export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  onCancel,
  onOverwrite,
}) => {
  const defaultFormatter = (value: any) => {
    if (value == null) return 'Not set';
    if (typeof value === 'number') {
      // Try currency formatting for numbers
      if (value > 100) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
        }).format(value);
      }
      return value.toString();
    }
    return String(value);
  };

  // Expose to window for legacy compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.closeConflictResolutionModal = onClose;
    }
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Conflict Detected"
      size="xl"
    >
      <div className="space-y-6">
        {/* Warning Message */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-red-800 mb-1">
                Vehicle data has changed
              </h4>
              <p className="text-sm text-red-700">
                Someone else has modified this vehicle while you were editing it. Review the conflicts
                below and choose whether to overwrite their changes or cancel your edits.
              </p>
            </div>
          </div>
        </div>

        {/* Conflicts Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-sm font-semibold text-gray-700">
              <div>Field</div>
              <div>Your Changes</div>
              <div className="text-red-600">Server Data (Latest)</div>
            </div>
          </div>

          {/* Body */}
          <div className="divide-y divide-gray-200">
            {conflicts.map((conflict) => (
              <div key={conflict.field} className="px-4 py-3 hover:bg-gray-50">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="font-medium text-gray-700">
                    {conflict.label}
                  </div>
                  <div className="text-gray-900">
                    {conflict.formatter
                      ? conflict.formatter(conflict.currentValue)
                      : defaultFormatter(conflict.currentValue)}
                  </div>
                  <div className="text-red-600 font-medium">
                    {conflict.formatter
                      ? conflict.formatter(conflict.serverValue)
                      : defaultFormatter(conflict.serverValue)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Message */}
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          <p>
            <strong>Cancel:</strong> Your edits will be discarded and you'll return to the previous
            screen.
          </p>
          <p className="mt-2">
            <strong>Overwrite:</strong> Your changes will replace the current server data. This
            cannot be undone.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onCancel} fullWidth>
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Cancel My Edits
          </Button>
          <Button variant="danger" onClick={onOverwrite} fullWidth>
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
            Overwrite Server Data
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Add type definitions to window
declare global {
  interface Window {
    closeConflictResolutionModal?: () => void;
  }
}

export default ConflictResolutionModal;
