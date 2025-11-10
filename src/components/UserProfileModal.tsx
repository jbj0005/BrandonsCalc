import React, { useState, useEffect } from 'react';
import { Modal, Button, Tabs, Card, VehicleCard, VehicleCardSkeleton, VehicleEditorModal } from '../ui/components';
import { useToast } from '../ui/components/Toast';
import type { GarageVehicle } from '../types';
// @ts-ignore
import savedVehiclesCache from '../features/vehicles/saved-vehicles-cache.js';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  initialTab?: 'garage' | 'offers';
}

/**
 * UserProfileModal - Unified modal for My Garage and My Offers
 */
export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialTab = 'garage',
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [vehicles, setVehicles] = useState<GarageVehicle[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showVehicleEditor, setShowVehicleEditor] = useState(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<GarageVehicle | null>(null);

  // Subscribe to vehicle changes and load initial data
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    // Subscribe to cache changes
    const unsubscribe = savedVehiclesCache.on('change', (updatedVehicles: GarageVehicle[]) => {
      console.log('[UserProfileModal] Cache change event:', updatedVehicles.length, 'vehicles');
      setVehicles(updatedVehicles);
      setIsLoadingVehicles(false);
    });

    // Subscribe to loading events
    const unsubscribeLoading = savedVehiclesCache.on('loading', (loading: boolean) => {
      console.log('[UserProfileModal] Cache loading state:', loading);
      setIsLoadingVehicles(loading);
    });

    // Initial load from cache (will use cached data if available, or fetch if needed)
    const loadInitial = async () => {
      setIsLoadingVehicles(true);
      try {
        const data = await savedVehiclesCache.getVehicles({ forceRefresh: false });
        setVehicles(data || []);
      } catch (error: any) {
        console.error('[UserProfileModal] Failed to load vehicles:', error);
        toast.push({
          kind: 'error',
          title: 'Failed to Load Vehicles',
          detail: error.message || 'Could not load your saved vehicles',
        });
      } finally {
        setIsLoadingVehicles(false);
      }
    };

    loadInitial();

    return () => {
      unsubscribe();
      unsubscribeLoading();
    };
  }, [isOpen, currentUser]);

  const handleAddVehicle = () => {
    setVehicleToEdit(null);
    setShowVehicleEditor(true);
  };

  const handleEditVehicle = (vehicle: any) => {
    setVehicleToEdit(vehicle);
    setShowVehicleEditor(true);
  };

  const handleDeleteVehicle = async (vehicle: any) => {
    if (!confirm(`Are you sure you want to delete "${vehicle.year} ${vehicle.make} ${vehicle.model}"?`)) {
      return;
    }

    try {
      await savedVehiclesCache.deleteVehicle(vehicle.id);
      toast.push({
        kind: 'success',
        title: 'Vehicle Deleted',
        detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      });
    } catch (error: any) {
      console.error('[UserProfileModal] Failed to delete vehicle:', error);
      toast.push({
        kind: 'error',
        title: 'Delete Failed',
        detail: error.message || 'Could not delete vehicle',
      });
    }
  };

  const handleSaveVehicle = async (vehicleData: Partial<GarageVehicle>) => {
    try {
      if (vehicleToEdit) {
        // Update existing vehicle
        await savedVehiclesCache.updateVehicle(vehicleToEdit.id, vehicleData);
        toast.push({
          kind: 'success',
          title: 'Vehicle Updated',
          detail: 'Your vehicle has been updated successfully',
        });
      } else {
        // Add new vehicle
        await savedVehiclesCache.addVehicle(vehicleData);
        toast.push({
          kind: 'success',
          title: 'Vehicle Added',
          detail: 'Your vehicle has been saved to your garage',
        });
      }
      setShowVehicleEditor(false);
      setVehicleToEdit(null);
    } catch (error: any) {
      console.error('[UserProfileModal] Failed to save vehicle:', error);
      toast.push({
        kind: 'error',
        title: 'Save Failed',
        detail: error.message || 'Could not save vehicle',
      });
      throw error; // Re-throw so VehicleEditorModal stays open
    }
  };

  const handleSelectVehicle = (vehicle: any) => {
    setSelectedVehicleId(vehicle.id);

    // Dispatch event for CalculatorApp to listen to
    window.dispatchEvent(
      new CustomEvent('vehicle:selected:from:garage', {
        detail: vehicle,
      })
    );

    toast.push({
      kind: 'success',
      title: 'Vehicle Selected',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const tabs = [
    {
      id: 'garage',
      label: 'My Garage',
      icon: (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      content: (
        <div className="space-y-4">
          {/* Header with Add Button */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Saved Vehicles</h3>
              <p className="text-sm text-gray-600 mt-1">
                Manage your saved vehicles for quick access
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={handleAddVehicle}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Vehicle
            </Button>
          </div>

          {/* Vehicle List */}
          {isLoadingVehicles ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <VehicleCardSkeleton variant="detailed" count={3} />
            </div>
          ) : vehicles.length === 0 ? (
            <Card variant="outlined" padding="lg">
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No vehicles yet</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Get started by adding your first vehicle to your garage
                </p>
                <Button variant="primary" size="md" className="mt-4" onClick={handleAddVehicle}>
                  Add Your First Vehicle
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  variant="detailed"
                  selected={selectedVehicleId === vehicle.id}
                  onSelect={handleSelectVehicle}
                  onEdit={handleEditVehicle}
                  onDelete={handleDeleteVehicle}
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'offers',
      label: 'My Offers',
      icon: (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Saved Offers</h3>
            <p className="text-sm text-gray-600 mt-1">
              View and manage your loan offers
            </p>
          </div>
          <Card variant="outlined" padding="lg">
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No saved offers</h3>
              <p className="mt-2 text-sm text-gray-500">
                Your loan offers will appear here once you create them
              </p>
            </div>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="My Profile"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="text-blue-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">My Profile</h2>
            <p className="text-sm text-gray-600">{currentUser?.email}</p>
          </div>
        </div>

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as 'garage' | 'offers')}
          variant="pills"
        />
      </Modal>

      {/* Vehicle Editor Modal */}
      <VehicleEditorModal
        isOpen={showVehicleEditor}
        onClose={() => {
          setShowVehicleEditor(false);
          setVehicleToEdit(null);
        }}
        vehicle={vehicleToEdit}
        onSave={handleSaveVehicle}
        mode={vehicleToEdit ? 'edit' : 'add'}
      />
    </>
  );
};

export default UserProfileModal;
