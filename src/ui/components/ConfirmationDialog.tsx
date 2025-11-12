import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmationDialogProps {
  /** Is dialog open */
  isOpen: boolean;
  /** Close dialog handler */
  onClose: () => void;
  /** Confirm handler */
  onConfirm: () => void | Promise<void>;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Confirm button variant */
  confirmVariant?: 'primary' | 'danger';
  /** Loading state */
  loading?: boolean;
}

/**
 * ConfirmationDialog - Reusable confirmation modal for destructive or important actions
 *
 * @example
 * <ConfirmationDialog
 *   isOpen={deleteDialogOpen}
 *   onClose={() => setDeleteDialogOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Vehicle"
 *   message="Are you sure you want to delete this vehicle? This action cannot be undone."
 *   confirmText="Delete"
 *   confirmVariant="danger"
 * />
 */
export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
}) => {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // Error handling should be done by the parent component
    } finally {
      setIsProcessing(false);
    }
  };

  const isLoading = loading || isProcessing;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
    >
      <div className="space-y-6">
        {/* Message */}
        <p className="text-gray-600 text-base leading-relaxed">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            size="md"
            onClick={handleConfirm}
            loading={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationDialog;
