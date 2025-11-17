import React from 'react';
import { Modal, Button } from './index';

export type ProgressStage = 'validating' | 'saving' | 'email' | 'sms' | 'complete' | 'error';

export interface SubmissionProgressModalProps {
  isOpen: boolean;
  stage: ProgressStage;
  progress: number;
  error?: string;
  onClose: () => void;
  onViewOffers?: () => void;
}

interface StageConfig {
  title: string;
  message: string;
  icon: string;
  iconClass?: string;
}

const STAGE_CONFIG: Record<ProgressStage, StageConfig> = {
  validating: {
    title: 'Validating offer...',
    message: 'Checking your information and preferences',
    icon: '⏳',
    iconClass: 'animate-pulse'
  },
  saving: {
    title: 'Saving your offer...',
    message: 'Securely storing your offer details',
    icon: '💾',
    iconClass: 'animate-pulse'
  },
  email: {
    title: 'Sending email...',
    message: 'Delivering confirmation to your inbox',
    icon: '📧',
    iconClass: 'animate-pulse'
  },
  sms: {
    title: 'Sending SMS...',
    message: 'Sending text message notification',
    icon: '📱',
    iconClass: 'animate-pulse'
  },
  complete: {
    title: 'Offer submitted!',
    message: 'Your offer has been sent successfully',
    icon: '✓',
    iconClass: 'text-green-400'
  },
  error: {
    title: 'Something went wrong',
    message: 'We encountered an error submitting your offer',
    icon: '!',
    iconClass: 'text-red-400'
  }
};

/**
 * SubmissionProgressModal - Multi-stage progress indicator for offer submission
 *
 * Shows animated progress through stages: validating → saving → email → sms → complete
 * Displays success/error state with action buttons
 *
 * @example
 * <SubmissionProgressModal
 *   isOpen={isSubmitting}
 *   stage="email"
 *   progress={75}
 *   onClose={() => setIsSubmitting(false)}
 *   onViewOffers={() => setShowMyOffers(true)}
 * />
 */
export const SubmissionProgressModal: React.FC<SubmissionProgressModalProps> = ({
  isOpen,
  stage,
  progress,
  error,
  onClose,
  onViewOffers
}) => {
  const config = STAGE_CONFIG[stage];
  const isComplete = stage === 'complete';
  const isError = stage === 'error';
  const showProgress = !isComplete && !isError;
  const handleModalClose = () => {
    if (isComplete || isError) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      size="md"
    >
      <div className="text-center py-8 px-6">
        {/* Animated Icon */}
        <div
          className={`text-7xl mb-6 ${config.iconClass || ''}`}
          role="img"
          aria-label={config.title}
        >
          {config.icon}
        </div>

        {/* Title */}
        <h3 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
          {config.title}
        </h3>

        {/* Message */}
        <p className="text-white/60 mb-8 text-base">
          {error || config.message}
        </p>

        {/* Progress Bar */}
        {showProgress && (
          <div className="w-full bg-white/10 rounded-full h-3 mb-8 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-400 to-blue-500 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}

        {/* Action Buttons (only on complete/error) */}
        {isComplete && (
          <div className="space-y-3 mt-6">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={onViewOffers}
            >
              View My Offers
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        )}

        {isError && (
          <div className="space-y-3 mt-6">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={onClose}
            >
              Try Again
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Progress Stage Indicator (for in-progress states) */}
        {showProgress && (
          <div className="mt-6 text-sm text-white/50">
            {progress}% complete
          </div>
        )}
      </div>
    </Modal>
  );
};

SubmissionProgressModal.displayName = 'SubmissionProgressModal';

export default SubmissionProgressModal;
