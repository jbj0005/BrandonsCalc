import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Optional modal title */
  title?: string;
  /** Modal content */
  children: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Show close button */
  showCloseButton?: boolean;
  /** Close on backdrop click */
  closeOnBackdropClick?: boolean;
  /** Close on ESC key */
  closeOnEsc?: boolean;
  /** Additional className for content */
  className?: string;
  /** Nested modal with enhanced backdrop */
  isNested?: boolean;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  className = '',
  isNested = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Always call latest onClose without retriggering focus effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Handle ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        onCloseRef.current();
      }
    },
    [closeOnEsc]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdropClick, onClose]
  );

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Store currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Focus the modal content
      modalRef.current?.focus();

      // Add event listener for ESC key
      document.addEventListener('keydown', handleKeyDown);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        // Restore previous focus
        previousFocusRef.current?.focus();

        // Remove event listener
        document.removeEventListener('keydown', handleKeyDown);

        // Restore body scroll
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTabKey);

    return () => {
      modal.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Backdrop - Layer 5 (z-500) or Layer 8 (z-800) for nested */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 ${
          isNested
            ? 'bg-black/75 backdrop-blur-md z-800'
            : 'bg-black/60 backdrop-blur-sm z-500'
        }`}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal Container - Layer 6 (z-600) or Layer 9 (z-900) for nested */}
      <div
        className={`fixed inset-0 flex items-center justify-center p-4 sm:p-6 overflow-y-auto ${
          isNested ? 'z-900' : 'z-600'
        }`}
        onClick={handleBackdropClick}
      >
        {/* Modal Content */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          tabIndex={-1}
          className={`
            relative bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 rounded-2xl shadow-ios-elevated border border-white/10
            w-full ${sizeClasses[size]}
            max-h-[90vh] overflow-y-auto
            transform transition-all duration-300
            ${className}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button - Layer 7 (z-700) or Layer 10 (z-1000) for nested */}
          {showCloseButton && (
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 w-10 h-10 rounded-full
                bg-white/10 hover:bg-white/20 active:bg-white/30
                text-white/60 hover:text-white
                flex items-center justify-center
                transition-all duration-200 hover:rotate-90 border border-white/10 ${
                  isNested ? 'z-1000' : 'z-700'
                }`}
              aria-label="Close modal"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 4l12 12M16 4L4 16" />
              </svg>
            </button>
          )}

          {/* Header */}
          {title && (
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <h2
                id="modal-title"
                className="text-2xl font-semibold text-white"
                style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
              >
                {title}
              </h2>
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </>
  );

  // Render to body using portal
  return createPortal(modalContent, document.body);
};

export default Modal;
