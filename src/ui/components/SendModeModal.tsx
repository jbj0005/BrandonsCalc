import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Checkbox } from './Checkbox';

export type SendMode = 'production' | 'dev';
export type SendChannel = 'email' | 'sms';

export interface SendModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: SendChannel;
  message?: string;
  onConfirm: (mode: SendMode, remember: boolean) => void;
}

/**
 * SendModeModal - Dev-only prompt for production vs dev simulation
 *
 * Decides whether Email/SMS actions hit Twilio or run dev simulation.
 * Supports "remember" checkbox to pin the mode.
 */
export const SendModeModal: React.FC<SendModeModalProps> = ({
  isOpen,
  onClose,
  channel,
  message,
  onConfirm,
}) => {
  const [remember, setRemember] = useState(false);

  const defaultMessages = {
    email: 'Do you want to send this email in production mode (real email) or dev mode (simulation)?',
    sms: 'Do you want to send this SMS in production mode (real text) or dev mode (simulation)?',
  };

  const displayMessage = message || defaultMessages[channel];

  const handleConfirm = (mode: SendMode) => {
    onConfirm(mode, remember);
    onClose();
  };

  // Expose to window for legacy compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.closeSendModeModal = onClose;
    }
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send Mode - ${channel === 'email' ? 'Email' : 'SMS'}`}
      size="md"
    >
      <div className="space-y-6">
        {/* Info Message */}
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
              <h4 className="text-sm font-semibold text-blue-800 mb-1">
                Choose Send Mode
              </h4>
              <p className="text-sm text-blue-700">{displayMessage}</p>
            </div>
          </div>
        </div>

        {/* Mode Comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Production Mode */}
          <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h5 className="text-sm font-semibold text-green-800">Production</h5>
            </div>
            <ul className="text-xs text-green-700 space-y-1">
              <li>• {channel === 'email' ? 'Real emails sent' : 'Real SMS sent'}</li>
              <li>• Uses actual {channel === 'email' ? 'SMTP' : 'Twilio'}</li>
              <li>• Customer receives message</li>
            </ul>
          </div>

          {/* Dev Mode */}
          <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              <h5 className="text-sm font-semibold text-gray-800">Dev Mode</h5>
            </div>
            <ul className="text-xs text-gray-700 space-y-1">
              <li>• Simulated {channel === 'email' ? 'email' : 'SMS'}</li>
              <li>• No actual delivery</li>
              <li>• Console logs only</li>
            </ul>
          </div>
        </div>

        {/* Remember Checkbox */}
        <div className="border-t border-gray-200 pt-4">
          <Checkbox
            id="remember-send-mode"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            label="Remember my choice for this session"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleConfirm('dev')}
            fullWidth
          >
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
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            Dev Mode
          </Button>
          <Button
            variant="primary"
            onClick={() => handleConfirm('production')}
            fullWidth
          >
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            Production
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Add type definitions to window
declare global {
  interface Window {
    closeSendModeModal?: () => void;
    promptSendMode?: (channel: SendChannel) => Promise<{ mode: SendMode; remember: boolean }>;
  }
}

export default SendModeModal;
