import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export type LibraryDestination = 'saved' | 'garage';

export interface AddToLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (destination: LibraryDestination) => void;
  vehicleName?: string;
}

/**
 * AddToLibraryModal - Prompts user to choose where to save a shared vehicle
 *
 * Options:
 * - My Saved Vehicles (vehicles interested in buying)
 * - My Garage (vehicles user owns)
 */
export const AddToLibraryModal: React.FC<AddToLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  vehicleName,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add to Library"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Where would you like to save{vehicleName ? ` "${vehicleName}"` : ' this vehicle'}?
        </p>

        {/* Option buttons */}
        <div className="space-y-3">
          <button
            onClick={() => onSelect('saved')}
            className="w-full p-4 rounded-lg border border-gray-700 bg-gray-800/50 hover:bg-gray-700/50 hover:border-emerald-500/50 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-medium text-white group-hover:text-emerald-400 transition-colors">
                  My Saved Vehicles
                </h4>
                <p className="text-xs text-gray-500">
                  Vehicles you're interested in buying
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelect('garage')}
            className="w-full p-4 rounded-lg border border-gray-700 bg-gray-800/50 hover:bg-gray-700/50 hover:border-blue-500/50 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-medium text-white group-hover:text-blue-400 transition-colors">
                  My Garage
                </h4>
                <p className="text-xs text-gray-500">
                  Vehicles you own (for trade-in)
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Cancel button */}
        <div className="pt-2">
          <Button variant="outline" onClick={onClose} fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AddToLibraryModal;
