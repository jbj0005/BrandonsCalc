import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export type EmailHandshakeStage = 'saving' | 'sending' | 'success' | 'error';

export interface EmailHandshakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: EmailHandshakeStage;
  errorMessage?: string;
  successMessage?: string;
  onRetry?: () => void;
}

const STAGE_CONFIG: Record<
  EmailHandshakeStage,
  {
    icon: string;
    iconClass: string;
    title: string;
    message: string;
    progress: number;
  }
> = {
  saving: {
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    iconClass: 'text-blue-600',
    title: 'Saving Offer',
    message: 'Preparing your offer...',
    progress: 33,
  },
  sending: {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    iconClass: 'text-blue-600',
    title: 'Sending Email',
    message: 'Delivering your offer...',
    progress: 66,
  },
  success: {
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    iconClass: 'text-green-600',
    title: 'Email Sent!',
    message: 'Your offer has been successfully delivered.',
    progress: 100,
  },
  error: {
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    iconClass: 'text-red-600',
    title: 'Send Failed',
    message: 'We encountered an error while sending your offer.',
    progress: 0,
  },
};

/**
 * EmailHandshakeModal - Shows progress during email sending
 *
 * Displays stages: saving → sending → success/error with progress bar.
 */
export const EmailHandshakeModal: React.FC<EmailHandshakeModalProps> = ({
  isOpen,
  onClose,
  stage,
  errorMessage,
  successMessage,
  onRetry,
}) => {
  const config = STAGE_CONFIG[stage];

  // Expose to window for legacy compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.closeEmailHandshakeModal = onClose;
      window.setEmailHandshakeStage = (newStage: EmailHandshakeStage) => {
        // This would need to be wired up through parent component state
      };
    }
  }, [onClose]);

  // Auto-close on success after delay
  useEffect(() => {
    if (stage === 'success' && isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [stage, isOpen, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      size="md"
      showCloseButton={stage === 'success' || stage === 'error'}
      closeOnBackdropClick={stage === 'success' || stage === 'error'}
      closeOnEsc={stage === 'success' || stage === 'error'}
    >
      <div className="space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center ${
              stage === 'saving' || stage === 'sending'
                ? 'bg-blue-100 animate-pulse'
                : stage === 'success'
                ? 'bg-green-100'
                : 'bg-red-100'
            }`}
          >
            <svg
              className={`w-10 h-10 ${config.iconClass}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={config.icon}
              />
            </svg>
          </div>
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 mb-2">
            {stage === 'success' && successMessage
              ? successMessage
              : stage === 'error' && errorMessage
              ? errorMessage
              : config.message}
          </p>

          {stage === 'error' && errorMessage && (
            <p className="text-sm text-gray-600">{config.message}</p>
          )}
        </div>

        {/* Progress Bar */}
        {stage !== 'error' && (
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                stage === 'success' ? 'bg-green-600' : 'bg-blue-600'
              }`}
              style={{ width: `${config.progress}%` }}
            />
          </div>
        )}

        {/* Action Buttons */}
        {stage === 'success' && (
          <div className="pt-4">
            <Button variant="primary" onClick={onClose} fullWidth>
              Done
            </Button>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} fullWidth>
              Cancel
            </Button>
            {onRetry && (
              <Button variant="primary" onClick={onRetry} fullWidth>
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
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

// Add type definitions to window
declare global {
  interface Window {
    closeEmailHandshakeModal?: () => void;
    setEmailHandshakeStage?: (stage: EmailHandshakeStage) => void;
  }
}

export default EmailHandshakeModal;
