import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { FormGroup } from './FormGroup';
import { useToast } from './Toast';
import type { Vehicle, GarageVehicle } from '../../types';

export interface VehicleEditorModalProps {
  /** Is modal open */
  isOpen: boolean;
  /** Close modal handler */
  onClose: () => void;
  /** Vehicle to edit (undefined for new vehicle) */
  vehicle?: Vehicle | GarageVehicle | null;
  /** Save handler */
  onSave?: (vehicle: Partial<Vehicle | GarageVehicle>) => Promise<void>;
  /** Mode: add or edit */
  mode?: 'add' | 'edit';
}

/**
 * VehicleEditorModal - Modal for adding or editing vehicle information
 */
export const VehicleEditorModal: React.FC<VehicleEditorModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  onSave,
  mode = vehicle ? 'edit' : 'add',
}) => {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Form state
  const [nickname, setNickname] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [condition, setCondition] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [payoffAmount, setPayoffAmount] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');

  // Validation errors
  const [yearError, setYearError] = useState('');
  const [makeError, setMakeError] = useState('');
  const [modelError, setModelError] = useState('');
  const [vinError, setVinError] = useState('');

  // Load vehicle data when modal opens or vehicle changes
  useEffect(() => {
    if (isOpen && vehicle) {
      setNickname((vehicle as GarageVehicle).nickname || '');
      setYear(vehicle.year?.toString() || '');
      setMake(vehicle.make || '');
      setModel(vehicle.model || '');
      setTrim(vehicle.trim || '');
      setVin(vehicle.vin || '');
      setMileage(vehicle.mileage?.toString() || '');
      setCondition(vehicle.condition || '');
      setEstimatedValue(vehicle.estimated_value?.toString() || '');
      setPayoffAmount(vehicle.payoff_amount?.toString() || '');
      setPhotoUrl(vehicle.photo_url || '');
      setNotes(vehicle.notes || '');
    }
  }, [isOpen, vehicle]);

  // Reset form
  const resetForm = () => {
    setNickname('');
    setYear('');
    setMake('');
    setModel('');
    setTrim('');
    setVin('');
    setMileage('');
    setCondition('');
    setEstimatedValue('');
    setPayoffAmount('');
    setPhotoUrl('');
    setNotes('');
    setYearError('');
    setMakeError('');
    setModelError('');
    setVinError('');
    setLoading(false);
  };

  // Validate year
  const validateYear = (): boolean => {
    const yearNum = parseInt(year);
    const currentYear = new Date().getFullYear();

    if (!year) {
      setYearError('Year is required');
      return false;
    }
    if (isNaN(yearNum)) {
      setYearError('Year must be a number');
      return false;
    }
    if (yearNum < 1900 || yearNum > currentYear + 2) {
      setYearError(`Year must be between 1900 and ${currentYear + 2}`);
      return false;
    }
    setYearError('');
    return true;
  };

  // Validate make
  const validateMake = (): boolean => {
    if (!make.trim()) {
      setMakeError('Make is required');
      return false;
    }
    setMakeError('');
    return true;
  };

  // Validate model
  const validateModel = (): boolean => {
    if (!model.trim()) {
      setModelError('Model is required');
      return false;
    }
    setModelError('');
    return true;
  };

  // Validate VIN (optional but format check if provided)
  const validateVin = (): boolean => {
    if (vin && vin.length !== 17) {
      setVinError('VIN must be 17 characters');
      return false;
    }
    setVinError('');
    return true;
  };

  // Handle save
  const handleSave = async () => {
    // Validate required fields
    const yearValid = validateYear();
    const makeValid = validateMake();
    const modelValid = validateModel();
    const vinValid = validateVin();

    if (!yearValid || !makeValid || !modelValid || !vinValid) {
      toast.push({ kind: 'error', title: 'Validation failed', detail: 'Please fix errors and try again' });
      return;
    }

    setLoading(true);
    try {
      const vehicleData: Partial<Vehicle | GarageVehicle> = {
        ...(vehicle?.id && { id: vehicle.id }),
        year: parseInt(year),
        make: make.trim(),
        model: model.trim(),
        trim: trim.trim() || undefined,
        vin: vin.trim() || undefined,
        mileage: mileage ? parseInt(mileage) : undefined,
        condition: condition || undefined,
        estimated_value: estimatedValue ? parseFloat(estimatedValue) : undefined,
        payoff_amount: payoffAmount ? parseFloat(payoffAmount) : undefined,
        photo_url: photoUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      // Add nickname for garage vehicles
      if ('user_id' in (vehicle || {})) {
        (vehicleData as Partial<GarageVehicle>).nickname = nickname.trim() || undefined;
      }

      await onSave?.(vehicleData);

      toast.push({
        kind: 'success',
        title: mode === 'add' ? 'Vehicle added!' : 'Vehicle updated!',
        detail: `${year} ${make} ${model}`,
      });

      resetForm();
      onClose();
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: mode === 'add' ? 'Failed to add vehicle' : 'Failed to update vehicle',
        detail: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Generate year options (current year + 2 down to 1990)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1989 + 2 }, (_, i) => {
    const yr = currentYear + 2 - i;
    return { value: yr.toString(), label: yr.toString() };
  });

  // Condition options
  const conditionOptions = [
    { value: 'excellent', label: 'Excellent' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
    { value: 'poor', label: 'Poor' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={mode === 'add' ? 'Add Vehicle' : 'Edit Vehicle'}
      size="md"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {/* Nickname (optional, for garage vehicles) */}
        <Input
          label="Nickname (Optional)"
          type="text"
          placeholder="My Daily Driver"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          helperText="Give your vehicle a friendly name"
          fullWidth
        />

        {/* Year, Make, Model Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormGroup label="Year" required error={yearError}>
            <Select
              placeholder="Select year..."
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setYearError('');
              }}
              onBlur={validateYear}
              options={yearOptions}
              fullWidth
            />
          </FormGroup>

          <FormGroup label="Make" required error={makeError}>
            <Input
              type="text"
              placeholder="Honda"
              value={make}
              onChange={(e) => {
                setMake(e.target.value);
                setMakeError('');
              }}
              onBlur={validateMake}
              fullWidth
            />
          </FormGroup>

          <FormGroup label="Model" required error={modelError}>
            <Input
              type="text"
              placeholder="Civic"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setModelError('');
              }}
              onBlur={validateModel}
              fullWidth
            />
          </FormGroup>
        </div>

        {/* Trim */}
        <Input
          label="Trim (Optional)"
          type="text"
          placeholder="Sport, EX, Limited, etc."
          value={trim}
          onChange={(e) => setTrim(e.target.value)}
          fullWidth
        />

        {/* VIN */}
        <Input
          label="VIN (Optional)"
          type="text"
          placeholder="17-character VIN"
          value={vin}
          onChange={(e) => {
            setVin(e.target.value.toUpperCase());
            setVinError('');
          }}
          onBlur={validateVin}
          error={vinError}
          helperText="Vehicle Identification Number"
          maxLength={17}
          fullWidth
        />

        {/* Mileage and Condition Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Mileage (Optional)"
            type="number"
            placeholder="15000"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            helperText="Current odometer reading"
            fullWidth
          />

          <Select
            label="Condition (Optional)"
            placeholder="Select condition..."
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            options={conditionOptions}
            fullWidth
          />
        </div>

        {/* Financial Details Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Estimated Value (Optional)"
            type="number"
            placeholder="25000"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            helperText="Current market value"
            icon={
              <span className="text-gray-400">$</span>
            }
            fullWidth
          />

          <Input
            label="Payoff Amount (Optional)"
            type="number"
            placeholder="18000"
            value={payoffAmount}
            onChange={(e) => setPayoffAmount(e.target.value)}
            helperText="Remaining loan balance"
            icon={
              <span className="text-gray-400">$</span>
            }
            fullWidth
          />
        </div>

        {/* Equity Display (if both values provided) */}
        {estimatedValue && payoffAmount && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">Estimated Equity:</span>
              <span className={`text-lg font-bold ${
                parseFloat(estimatedValue) - parseFloat(payoffAmount) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                ${(parseFloat(estimatedValue) - parseFloat(payoffAmount)).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Photo URL */}
        <Input
          label="Photo URL (Optional)"
          type="url"
          placeholder="https://example.com/photo.jpg"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          helperText="Link to vehicle photo"
          fullWidth
        />

        {/* Notes */}
        <FormGroup label="Notes (Optional)" helperText="Any additional information">
          <textarea
            className="block w-full rounded-lg border border-gray-300 px-4 py-2 text-base focus:border-blue-500 focus:ring-blue-500 focus:outline-none focus:ring-2 resize-none"
            placeholder="Great fuel economy, well maintained..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </FormGroup>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            onClick={handleSave}
          >
            {loading ? 'Saving...' : mode === 'add' ? 'Add Vehicle' : 'Save Changes'}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default VehicleEditorModal;
