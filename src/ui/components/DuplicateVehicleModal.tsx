import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { GarageVehicle } from '../../types';

export interface DuplicateVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingVehicle: GarageVehicle | null;
  newVehicle: Partial<GarageVehicle> | null;
  onKeepExisting: () => void;
  onOverwrite: () => void;
}

/**
 * DuplicateVehicleModal - Shows when saving a garage vehicle with VIN collision
 *
 * Displays side-by-side comparison and lets user keep existing or overwrite.
 */
export const DuplicateVehicleModal: React.FC<DuplicateVehicleModalProps> = ({
  isOpen,
  onClose,
  existingVehicle,
  newVehicle,
  onKeepExisting,
  onOverwrite,
}) => {
  const formatCurrency = (value?: number) => {
    if (value == null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatMileage = (mileage?: number) => {
    if (mileage == null) return 'N/A';
    return `${mileage.toLocaleString()} mi`;
  };

  const isFieldChanged = (field: keyof GarageVehicle) => {
    if (!existingVehicle || !newVehicle) return false;
    return existingVehicle[field] !== newVehicle[field];
  };

  const renderField = (
    label: string,
    field: keyof GarageVehicle,
    formatter?: (value: any) => string
  ) => {
    const existingValue = existingVehicle?.[field];
    const newValue = newVehicle?.[field];
    const changed = isFieldChanged(field);

    return (
      <div className={`py-2 ${changed ? 'bg-yellow-50' : ''}`}>
        <div className="text-xs text-gray-500 mb-1">{label}</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-sm text-gray-900">
            {formatter ? formatter(existingValue) : (existingValue || 'N/A')}
          </div>
          <div className={`text-sm font-medium ${changed ? 'text-blue-600' : 'text-gray-900'}`}>
            {formatter ? formatter(newValue) : (newValue || 'N/A')}
          </div>
        </div>
      </div>
    );
  };

  // Expose to window for legacy compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.closeDuplicateVehicleModal = onClose;
    }
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Duplicate Vehicle Detected"
      size="xl"
    >
      <div className="space-y-6">
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
                A vehicle with this VIN already exists
              </h4>
              <p className="text-sm text-yellow-700">
                You already have a vehicle with VIN <span className="font-mono">{existingVehicle?.vin}</span> in your garage.
                Would you like to keep the existing data or overwrite it?
              </p>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm font-semibold text-gray-700">
              <div>Existing Vehicle</div>
              <div className="text-blue-600">New Data</div>
            </div>
          </div>

          {/* Body */}
          <div className="divide-y divide-gray-200 px-4">
            {renderField('Nickname', 'nickname')}
            {renderField('Year', 'year')}
            {renderField('Make', 'make')}
            {renderField('Model', 'model')}
            {renderField('Trim', 'trim')}
            {renderField('Mileage', 'mileage', formatMileage)}
            {renderField('Condition', 'condition')}
            {renderField('Estimated Value', 'estimated_value', formatCurrency)}
            {renderField('Payoff Amount', 'payoff_amount', formatCurrency)}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded"></div>
          <span>Changed fields</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onKeepExisting} fullWidth>
            Keep Existing
          </Button>
          <Button variant="primary" onClick={onOverwrite} fullWidth>
            Overwrite with New Data
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Add type definitions to window
declare global {
  interface Window {
    closeDuplicateVehicleModal?: () => void;
  }
}

export default DuplicateVehicleModal;
