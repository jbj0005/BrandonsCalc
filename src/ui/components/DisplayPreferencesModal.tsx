import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { DisplayPreferences, VehicleCardFieldPreferences, OfferSectionPreferences } from '../../types';
import { DEFAULT_DISPLAY_PREFERENCES } from '../../types';

export interface DisplayPreferencesModalProps {
  /** Is modal open */
  isOpen: boolean;
  /** Close modal handler */
  onClose: () => void;
  /** Current preferences */
  initialPreferences?: DisplayPreferences;
  /** Save handler */
  onSave: (preferences: DisplayPreferences) => Promise<void>;
}

type Tab = 'vehicle-card' | 'preview-offer';

/**
 * DisplayPreferencesModal - Customize which vehicle attributes and offer sections to display
 *
 * Features:
 * - Vehicle Card: Choose which of 13-14 smart fields to show
 * - Preview Offer: Toggle Trade-In and Fees sections (with protected field warnings)
 */
export const DisplayPreferencesModal: React.FC<DisplayPreferencesModalProps> = ({
  isOpen,
  onClose,
  initialPreferences = DEFAULT_DISPLAY_PREFERENCES,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('vehicle-card');
  const [loading, setLoading] = useState(false);

  // Local state for preferences
  const [vehicleCardPrefs, setVehicleCardPrefs] = useState<VehicleCardFieldPreferences>(
    initialPreferences.selectedVehicleCard
  );
  const [offerPrefs, setOfferPrefs] = useState<OfferSectionPreferences>(
    initialPreferences.previewOffer
  );

  // Update local state when initial preferences change
  useEffect(() => {
    setVehicleCardPrefs(initialPreferences.selectedVehicleCard);
    setOfferPrefs(initialPreferences.previewOffer);
  }, [initialPreferences]);

  // Handle vehicle card field toggle
  const toggleVehicleField = (field: keyof VehicleCardFieldPreferences) => {
    setVehicleCardPrefs(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // Handle offer section toggle
  const toggleOfferSection = (field: keyof OfferSectionPreferences) => {
    setOfferPrefs(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // Handle save
  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave({
        selectedVehicleCard: vehicleCardPrefs,
        previewOffer: offerPrefs,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save display preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle reset to defaults
  const handleReset = () => {
    setVehicleCardPrefs(DEFAULT_DISPLAY_PREFERENCES.selectedVehicleCard);
    setOfferPrefs(DEFAULT_DISPLAY_PREFERENCES.previewOffer);
  };

  // Field definitions for vehicle card
  const vehicleCardFields: Array<{
    key: keyof VehicleCardFieldPreferences;
    label: string;
    category: string;
    description: string;
  }> = [
    // Core fields
    { key: 'year', label: 'Year', category: 'Core', description: 'Vehicle year' },
    { key: 'make', label: 'Make', category: 'Core', description: 'Vehicle manufacturer' },
    { key: 'model', label: 'Model', category: 'Core', description: 'Vehicle model name' },
    { key: 'trim', label: 'Trim', category: 'Core', description: 'Trim level/package' },

    // Financial fields
    { key: 'askingPrice', label: 'Asking Price', category: 'Financial', description: 'Listed price or sale price' },
    { key: 'estimatedValue', label: 'Estimated Value', category: 'Financial', description: 'Market/trade value estimate' },
    { key: 'payoffAmount', label: 'Payoff Amount', category: 'Financial', description: 'Amount owed (My Garage only)' },

    // Detail fields
    { key: 'vin', label: 'VIN', category: 'Details', description: '17-character vehicle ID' },
    { key: 'mileage', label: 'Mileage', category: 'Details', description: 'Odometer reading' },
    { key: 'condition', label: 'Condition', category: 'Details', description: 'Vehicle condition rating' },

    // Dealer fields
    { key: 'dealerName', label: 'Dealer Name', category: 'Dealer Info', description: 'Dealership name (Saved Vehicles only)' },
    { key: 'dealerCity', label: 'Dealer City', category: 'Dealer Info', description: 'Dealer city location' },
    { key: 'dealerState', label: 'Dealer State', category: 'Dealer Info', description: 'Dealer state location' },
    { key: 'dealerPhone', label: 'Dealer Phone', category: 'Dealer Info', description: 'Dealer contact number' },
  ];

  // Group fields by category
  const fieldsByCategory = vehicleCardFields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof vehicleCardFields>);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Display Preferences"
      size="xl"
      className="max-w-5xl"
    >
      <div className="flex flex-col h-full">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('vehicle-card')}
              className={`${
                activeTab === 'vehicle-card'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Selected Vehicle Card
            </button>
            <button
              onClick={() => setActiveTab('preview-offer')}
              className={`${
                activeTab === 'preview-offer'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Preview Offer Sections
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto py-6">
          {activeTab === 'vehicle-card' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600">
                Choose which vehicle attributes to display in the Selected Vehicle card.
                Essentials (Year/Make/Model/Trim/Price/VIN) are checked by default.
              </p>

              {Object.entries(fieldsByCategory).map(([category, fields]) => (
                <div key={category} className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {fields.map(field => (
                      <label
                        key={field.key}
                        className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={vehicleCardPrefs[field.key]}
                          onChange={() => toggleVehicleField(field.key)}
                          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{field.label}</div>
                          <div className="text-xs text-gray-500">{field.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'preview-offer' && (
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800">Protected Information</h3>
                    <p className="mt-1 text-sm text-yellow-700">
                      Hiding trade-in and fee details can protect your negotiating power when sending offers to dealers.
                      These sections contain sensitive financial information like trade value, payoff amounts, and down payment.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                Choose which sections to include in the Preview Offer modal. Vehicle Details, Dealer Information,
                Financing Details, and Customer Information are always shown.
              </p>

              <div className="space-y-4">
                <label className="flex items-start space-x-3 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offerPrefs.showTradeInSection}
                    onChange={() => toggleOfferSection('showTradeInSection')}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">Show Trade-In Details Section</div>
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        Sensitive
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      Includes: Trade-in value, payoff amount, calculated equity
                    </div>
                    <div className="mt-2 text-xs text-red-600">
                      ⚠️ Revealing trade details may limit dealer negotiation flexibility
                    </div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offerPrefs.showFeesSection}
                    onChange={() => toggleOfferSection('showFeesSection')}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">Show Fees & Add-ons Section</div>
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                        Negotiable
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      Includes: Dealer fees, customer add-ons (warranties, packages)
                    </div>
                    <div className="mt-2 text-xs text-yellow-600">
                      💡 These items are often negotiable and may limit dealer flexibility
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 pt-4 flex justify-between">
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={loading}
          >
            Reset to Defaults
          </Button>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DisplayPreferencesModal;
