import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { SupabaseClient } from '@supabase/supabase-js';

export interface UnavailableVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: {
    id?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    mileage?: number;
    vin?: string;
  } | null;
  supabase: SupabaseClient | null;
  currentUserId: string | null;
  onVehicleRemoved?: () => void;
}

/**
 * UnavailableVehicleModal - Shows when MarketCheck reports a saved listing vanished
 *
 * Displays vehicle details and offers to remove it from saved vehicles.
 */
export const UnavailableVehicleModal: React.FC<UnavailableVehicleModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  supabase,
  currentUserId,
  onVehicleRemoved,
}) => {
  const handleRemoveVehicle = async () => {
    if (!vehicle || !vehicle.vin || !supabase || !currentUserId) {
      console.error('[UnavailableVehicleModal] Missing required data');
      return;
    }

    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('user_id', currentUserId)
        .eq('vin', vehicle.vin);

      if (error) {
        console.error('[UnavailableVehicleModal] Error removing vehicle:', error);
        if (window.showToast) {
          window.showToast('Failed to remove vehicle from database', 'error');
        }
        return;
      }

      // Notify parent
      if (onVehicleRemoved) {
        onVehicleRemoved();
      }

      // Close modal
      onClose();

      // Show success message
      if (window.showToast) {
        window.showToast('Vehicle removed from your saved vehicles', 'success');
      }
    } catch (error) {
      console.error('[UnavailableVehicleModal] Error:', error);
      if (window.showToast) {
        window.showToast('Failed to remove vehicle', 'error');
      }
    }
  };

  // Expose to window for legacy compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.closeUnavailableVehicleModal = onClose;
      window.removeUnavailableVehicle = handleRemoveVehicle;
    }
  }, [onClose, handleRemoveVehicle]);

  if (!vehicle) return null;

  const formatMileage = (mileage?: number) => {
    if (mileage == null) return 'N/A';
    return `${mileage.toLocaleString()} miles`;
  };

  const formatVIN = (vin?: string) => {
    if (!vin) return 'N/A';
    return vin.toUpperCase();
  };

  const capitalizeWords = (str?: string) => {
    if (!str) return '';
    return str.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vehicle No Longer Available"
      size="md"
    >
      <div className="space-y-4">
        {/* Warning Message */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-yellow-800 mb-1">
                This vehicle is no longer available
              </h4>
              <p className="text-sm text-yellow-700">
                The listing for this vehicle has been removed or sold. You can remove it from your saved vehicles.
              </p>
            </div>
          </div>
        </div>

        {/* Vehicle Details */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-3">Vehicle Information:</h5>

          <div className="space-y-2">
            <div className="vehicle-info text-base font-medium text-gray-900">
              {vehicle.year || 'N/A'} {capitalizeWords(vehicle.make)} {capitalizeWords(vehicle.model)}
            </div>

            {vehicle.trim && (
              <div className="vehicle-info text-sm text-gray-600">
                Trim: {capitalizeWords(vehicle.trim)}
              </div>
            )}

            {vehicle.mileage != null && (
              <div className="vehicle-info text-sm text-gray-600">
                Mileage: {formatMileage(vehicle.mileage)}
              </div>
            )}

            <div className="vehicle-info text-sm text-gray-600 font-mono">
              VIN: {formatVIN(vehicle.vin)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            fullWidth
          >
            Close
          </Button>
          <Button
            variant="danger"
            onClick={handleRemoveVehicle}
            fullWidth
          >
            Remove Vehicle
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Add type definitions to window
declare global {
  interface Window {
    closeUnavailableVehicleModal?: () => void;
    removeUnavailableVehicle?: () => Promise<void>;
  }
}

export default UnavailableVehicleModal;
