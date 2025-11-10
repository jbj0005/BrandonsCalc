import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { FormGroup } from './FormGroup';
import { useToast } from './Toast';
import type { Vehicle, GarageVehicle } from '../../types';
import { formatCurrencyInput, formatCurrencyValue } from '../../utils/formatters';
import { ConflictResolutionModal, type FieldConflict } from './ConflictResolutionModal';

// Import MarketCheck cache for VIN lookup
// @ts-ignore - JS module
import marketCheckCache from '../../features/vehicles/marketcheck-cache.js';

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

  // Conflict detection
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);
  const [freshMarketCheckData, setFreshMarketCheckData] = useState<any>(null);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<Vehicle | GarageVehicle> | null>(null);

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
      setEstimatedValue(
        vehicle.estimated_value != null
          ? formatCurrencyValue(vehicle.estimated_value)
          : ''
      );
      setPayoffAmount(
        vehicle.payoff_amount != null
          ? formatCurrencyValue(vehicle.payoff_amount)
          : ''
      );
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
    const trimmed = vin.trim().toUpperCase();
    if (!trimmed) {
      setVinError('VIN is required');
      return false;
    }
    if (trimmed.length !== 17) {
      setVinError('VIN must be 17 characters');
      return false;
    }
    setVin(trimmed);
    setVinError('');
    return true;
  };

  // Detect conflicts between user edits and fresh MarketCheck data
  const detectConflicts = (userEdits: Partial<Vehicle | GarageVehicle>, freshData: any): FieldConflict[] => {
    const conflicts: FieldConflict[] = [];

    // Fields to check for conflicts
    const fieldsToCheck = [
      { field: 'year', label: 'Year' },
      { field: 'make', label: 'Make' },
      { field: 'model', label: 'Model' },
      { field: 'trim', label: 'Trim' },
      { field: 'mileage', label: 'Mileage', formatter: (v: any) => v ? v.toLocaleString() + ' mi' : 'Not set' },
      { field: 'estimated_value', label: 'Estimated Value', formatter: (v: any) => v ? `$${v.toLocaleString()}` : 'Not set' },
      { field: 'condition', label: 'Condition' },
    ];

    for (const { field, label, formatter } of fieldsToCheck) {
      const userValue = userEdits[field as keyof typeof userEdits];
      const freshValue = freshData[field];

      // Skip if both are null/undefined
      if (userValue == null && freshValue == null) continue;

      // Check if values differ
      if (userValue != freshValue && freshValue != null) {
        conflicts.push({
          field,
          label,
          currentValue: userValue,
          serverValue: freshValue,
          formatter,
        });
      }
    }

    return conflicts;
  };

  // Fetch fresh MarketCheck data for VIN
  const fetchFreshMarketCheckData = async (vinToFetch: string): Promise<any | null> => {
    try {
      const freshData = await marketCheckCache.lookupVIN(vinToFetch, { force: true });
      if (freshData) {
        return freshData;
      }
      return null;
    } catch (error) {
      console.error('Error fetching fresh MarketCheck data:', error);
      return null;
    }
  };

  // Handle conflict resolution - use fresh MarketCheck data
  const handleUseFreshData = async () => {
    if (!freshMarketCheckData || !pendingSaveData) return;

    setShowConflictModal(false);
    setLoading(true);

    try {
      // Merge fresh MarketCheck data with user's non-conflicting edits
      const mergedData: Partial<Vehicle | GarageVehicle> = {
        ...pendingSaveData,
        // Override with fresh MarketCheck data (MarketCheck wins)
        year: freshMarketCheckData.year,
        make: freshMarketCheckData.make,
        model: freshMarketCheckData.model,
        trim: freshMarketCheckData.trim || pendingSaveData.trim,
        mileage: freshMarketCheckData.mileage || pendingSaveData.mileage,
        estimated_value: freshMarketCheckData.estimated_value || pendingSaveData.estimated_value,
        condition: freshMarketCheckData.condition || pendingSaveData.condition,
      };

      await onSave?.(mergedData);

      toast.push({
        kind: 'success',
        title: 'Vehicle updated with fresh data!',
        detail: `${mergedData.year} ${mergedData.make} ${mergedData.model}`,
      });

      resetForm();
      onClose();
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Failed to update vehicle',
        detail: error.message,
      });
    } finally {
      setLoading(false);
      setFreshMarketCheckData(null);
      setPendingSaveData(null);
    }
  };

  // Handle conflict resolution - keep user's edits
  const handleKeepUserEdits = async () => {
    if (!pendingSaveData) return;

    setShowConflictModal(false);
    setLoading(true);

    try {
      await onSave?.(pendingSaveData);

      toast.push({
        kind: 'success',
        title: mode === 'add' ? 'Vehicle added!' : 'Vehicle updated!',
        detail: `${pendingSaveData.year} ${pendingSaveData.make} ${pendingSaveData.model}`,
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
      setFreshMarketCheckData(null);
      setPendingSaveData(null);
    }
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

      // MarketCheck conflict detection: if VIN exists, fetch fresh data
      if (vin && vin.trim().length === 17) {
        const freshData = await fetchFreshMarketCheckData(vin.trim());

        if (freshData) {
          // Detect conflicts between user edits and fresh MarketCheck data
          const detectedConflicts = detectConflicts(vehicleData, freshData);

          if (detectedConflicts.length > 0) {
            // Conflicts detected - show resolution modal
            setPendingSaveData(vehicleData);
            setFreshMarketCheckData(freshData);
            setConflicts(detectedConflicts);
            setShowConflictModal(true);
            setLoading(false);
            return; // Exit early - user will choose via modal
          }
        }
      }

      // No conflicts or no VIN - proceed with save
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
    <>
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
          label="VIN *"
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
          required
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
            type="text"
            placeholder="$25,000"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(formatCurrencyInput(e.target.value))}
            helperText="Current market value"
            fullWidth
          />

          <Input
            label="Payoff Amount (Optional)"
            type="text"
            placeholder="$18,000"
            value={payoffAmount}
            onChange={(e) => setPayoffAmount(formatCurrencyInput(e.target.value))}
            helperText="Remaining loan balance"
            fullWidth
          />
        </div>

        {/* Equity Display (if both values provided) */}
        {estimatedValue && payoffAmount && (() => {
          const estimatedNumeric = parseCurrencyString(estimatedValue);
          const payoffNumeric = parseCurrencyString(payoffAmount);
          if (!estimatedNumeric && !payoffNumeric) return null;
          const equity = estimatedNumeric - payoffNumeric;
          return (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">Estimated Equity:</span>
                <span className={`text-lg font-bold ${equity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {`${equity >= 0 ? '' : '-'}$${Math.abs(equity).toLocaleString()}`}
                </span>
              </div>
            </div>
          );
        })()}

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
      {/* Conflict Resolution Modal */}
      {showConflictModal && (
        <ConflictResolutionModal
          isOpen={showConflictModal}
          onClose={() => setShowConflictModal(false)}
          conflicts={conflicts}
          onCancel={() => {
            // Cancel = go back to editing
            setShowConflictModal(false);
            setConflicts([]);
            setFreshMarketCheckData(null);
            setPendingSaveData(null);
          }}
          onOverwrite={handleKeepUserEdits}
        />
      )}
    </>
  );
};

export default VehicleEditorModal;
