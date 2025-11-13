import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { FormGroup } from './FormGroup';
import { Checkbox } from './Checkbox';
import { useToast } from './Toast';
import type { Vehicle, GarageVehicle } from '../../types';
import { formatCurrencyInput, formatCurrencyValue, formatNumberInput, parseFormattedNumber, parseCurrency } from '../../utils/formatters';
import { ConflictResolutionModal, type FieldConflict } from './ConflictResolutionModal';
import { supabase } from '../../lib/supabase';

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
  /** Use as trade-in handler */
  onUseAsTradeIn?: (vehicle: GarageVehicle) => void;
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
  onUseAsTradeIn,
}) => {
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [useAsTradeIn, setUseAsTradeIn] = useState(false);

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
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
      const response: any = await marketCheckCache.getVehicleData(vinToFetch, {
        forceRefresh: true,
        zip: '32901',
        radius: 100,
        pick: 'all',
      });
      if (response?.listing) {
        return response.listing;
      }
      return response ?? null;
    } catch (error) {
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

  // Handle photo upload
  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('garage-vehicle-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('garage-vehicle-photos')
        .getPublicUrl(filePath);

      setPhotoUrl(publicData.publicUrl);

      toast.push({
        kind: 'success',
        title: 'Photo uploaded',
        detail: 'Vehicle photo has been uploaded successfully'
      });
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Upload failed',
        detail: error.message
      });
      setPhotoFile(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.push({
          kind: 'error',
          title: 'Invalid file',
          detail: 'Please select an image file'
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.push({
          kind: 'error',
          title: 'File too large',
          detail: 'Please select an image smaller than 5MB'
        });
        return;
      }

      setPhotoFile(file);
      handlePhotoUpload(file);
    }
  };

  // Focus next input helper
  const focusNextInput = (currentElement: HTMLElement) => {
    const modal = currentElement.closest('[role="dialog"]');
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );

    const currentIndex = Array.from(focusableElements).indexOf(currentElement);
    const nextElement = focusableElements[currentIndex + 1];

    if (nextElement) {
      nextElement.focus();
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
        mileage: mileage ? parseFormattedNumber(mileage) : undefined,
        condition: condition || undefined,
        estimated_value: estimatedValue ? parseCurrency(estimatedValue) : undefined,
        payoff_amount: payoffAmount ? parseCurrency(payoffAmount) : undefined,
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
  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose]);

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
        {/* Vehicle Preview Card - Only show in edit mode when we have data */}
        {mode === 'edit' && (year || make || model || photoUrl) && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-sm">
            <div className="flex gap-4">
              {/* Photo Section */}
              {photoUrl ? (
                <div className="w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-white shadow-md">
                  <img
                    src={photoUrl}
                    alt={`${year} ${make} ${model}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-32 h-32 flex-shrink-0 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center shadow-md">
                  <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}

              {/* Vehicle Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight">
                      {year && make && model ? `${year} ${make} ${model}` : 'Vehicle Details'}
                    </h3>
                    {trim && <p className="text-sm text-gray-600 mt-0.5">{trim}</p>}
                    {nickname && (
                      <p className="text-xs text-blue-600 font-medium mt-1">"{nickname}"</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  {mileage && (
                    <div className="bg-white/60 rounded-lg px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Mileage</div>
                      <div className="text-sm font-semibold text-gray-900">{formatNumberInput(mileage)}</div>
                    </div>
                  )}
                  {estimatedValue && (
                    <div className="bg-white/60 rounded-lg px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Value</div>
                      <div className="text-sm font-semibold text-green-700">{formatCurrencyInput(estimatedValue)}</div>
                    </div>
                  )}
                  {condition && (
                    <div className="bg-white/60 rounded-lg px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Condition</div>
                      <div className="text-sm font-semibold text-gray-900 capitalize">{condition}</div>
                    </div>
                  )}
                  {payoffAmount && (
                    <div className="bg-white/60 rounded-lg px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Payoff</div>
                      <div className="text-sm font-semibold text-red-700">{formatCurrencyInput(payoffAmount)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
            setVin(e.target.value);
            setVinError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
              setTimeout(() => focusNextInput(e.currentTarget), 0);
            }
          }}
          onBlur={() => {
            setVin(vin.trim().toUpperCase());
            validateVin();
          }}
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
            type="text"
            placeholder="15,000"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                setTimeout(() => focusNextInput(e.currentTarget), 0);
              }
            }}
            onBlur={() => {
              if (mileage) {
                setMileage(formatNumberInput(mileage));
              }
            }}
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
            onChange={(e) => setEstimatedValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                setTimeout(() => focusNextInput(e.currentTarget), 0);
              }
            }}
            onBlur={() => {
              if (estimatedValue) {
                setEstimatedValue(formatCurrencyInput(estimatedValue));
              }
            }}
            helperText="Current market value"
            fullWidth
          />

          <Input
            label="Payoff Amount (Optional)"
            type="text"
            placeholder="$18,000"
            value={payoffAmount}
            onChange={(e) => setPayoffAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                setTimeout(() => focusNextInput(e.currentTarget), 0);
              }
            }}
            onBlur={() => {
              if (payoffAmount) {
                setPayoffAmount(formatCurrencyInput(payoffAmount));
              }
            }}
            helperText="Remaining loan balance"
            fullWidth
          />
        </div>

        {/* Equity Display (if both values provided) */}
        {estimatedValue && payoffAmount && (() => {
          const estimatedNumeric =
            parseFloat(estimatedValue.replace(/[^0-9.-]/g, '')) || 0;
          const payoffNumeric =
            parseFloat(payoffAmount.replace(/[^0-9.-]/g, '')) || 0;
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

        {/* Photo Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Vehicle Photo (Optional)
          </label>

          <div className="flex items-center gap-4">
            <label className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={photoUploading}
                className="hidden"
              />
              <div className={`
                flex items-center justify-center gap-2 px-4 py-2
                border-2 border-dashed rounded-lg cursor-pointer
                transition-colors
                ${photoUploading
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'border-blue-300 bg-blue-50 hover:border-blue-500 hover:bg-blue-100'
                }
              `}>
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-blue-900">
                  {photoUploading ? 'Uploading...' : 'Choose Photo'}
                </span>
              </div>
            </label>

            {photoUrl && (
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200">
                <img
                  src={photoUrl}
                  alt="Vehicle"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl('');
                    setPhotoFile(null);
                  }}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            JPG, PNG, or GIF • Max 5MB
          </p>
        </div>

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

        {/* Use as Trade-In Checkbox (only for editing garage vehicles) */}
        {mode === 'edit' && onUseAsTradeIn && (
          <div className="pt-4 border-t border-gray-200">
            <Checkbox
              label="Use this vehicle as my trade-in"
              checked={useAsTradeIn}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseAsTradeIn(checked);

                if (checked && vehicle) {
                  // Trigger trade-in auto-fill
                  onUseAsTradeIn(vehicle as GarageVehicle);

                  toast.push({
                    kind: 'success',
                    title: 'Trade-In Set',
                    detail: 'Trade allowance and payoff have been populated',
                  });
                }
              }}
            />
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Auto-fills trade allowance ({formatCurrencyValue(vehicle?.estimated_value || 0)}) and payoff ({formatCurrencyValue(vehicle?.payoff_amount || 0)})
            </p>
          </div>
        )}

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
