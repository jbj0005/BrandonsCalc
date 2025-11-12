/**
 * VehicleManagementExample - Shows how to integrate vehicle components with SavedVehiclesCache
 *
 * This example demonstrates:
 * - Loading vehicles from SavedVehiclesCache
 * - Adding new vehicles with VehicleEditorModal
 * - Editing existing vehicles
 * - Deleting vehicles with ConfirmationDialog
 * - Real-time updates via cache events
 */

import React, { useState, useEffect } from 'react';
import { VehicleCard } from '../ui/components/VehicleCard';
import { VehicleCardSkeleton } from '../ui/components/VehicleCardSkeleton';
import { VehicleEditorModal } from '../ui/components/VehicleEditorModal';
import { ConfirmationDialog } from '../ui/components/ConfirmationDialog';
import { Button } from '../ui/components/Button';
import { useToast } from '../ui/components/Toast';
import type { GarageVehicle, Vehicle } from '../types';
// Import your SavedVehiclesCache
// import { savedVehiclesCache } from '../features/vehicles/saved-vehicles-cache';

export const VehicleManagementExample: React.FC = () => {
  const [vehicles, setVehicles] = useState<GarageVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Modal states
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<GarageVehicle | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState<GarageVehicle | null>(null);

  const toast = useToast();

  // Load vehicles on mount
  useEffect(() => {
    loadVehicles();

    // Subscribe to cache changes for real-time updates
    // const unsubscribe = savedVehiclesCache.on('change', (updatedVehicles) => {
    //   setVehicles(updatedVehicles);
    //   setLoading(false);
    // });

    // return () => unsubscribe();
  }, []);

  // Load vehicles from cache
  const loadVehicles = async () => {
    setLoading(true);
    try {
      // Real implementation
      // const vehicleData = await savedVehiclesCache.getVehicles();
      // setVehicles(vehicleData);

      // Demo implementation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const demoVehicles: GarageVehicle[] = [
        {
          id: 'demo-1',
          user_id: 'user-123',
          nickname: 'Daily Driver',
          year: 2022,
          make: 'Honda',
          model: 'Civic',
          trim: 'Sport',
          mileage: 15420,
          condition: 'excellent',
          estimated_value: 24500,
          payoff_amount: 18000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      setVehicles(demoVehicles);
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Failed to load vehicles',
        detail: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle add/update vehicle
  const handleSaveVehicle = async (vehicleData: Partial<GarageVehicle>) => {
    // Real implementation for adding
    // if (!editingVehicle) {
    //   const newVehicle = await savedVehiclesCache.addVehicle(vehicleData);
    //   return newVehicle;
    // }

    // Real implementation for updating
    // if (editingVehicle && vehicleData.id) {
    //   const updated = await savedVehiclesCache.updateVehicle(
    //     vehicleData.id,
    //     vehicleData
    //   );
    //   return updated;
    // }

    // Demo implementation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (editingVehicle) {
      // Update existing
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === editingVehicle.id
            ? { ...v, ...vehicleData, updated_at: new Date().toISOString() }
            : v
        )
      );
    } else {
      // Add new
      const newVehicle: GarageVehicle = {
        id: `demo-${Date.now()}`,
        user_id: 'user-123',
        ...vehicleData,
        year: vehicleData.year || 2024,
        make: vehicleData.make || '',
        model: vehicleData.model || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as GarageVehicle;
      setVehicles((prev) => [...prev, newVehicle]);
    }
  };

  // Handle delete vehicle
  const handleDeleteVehicle = async () => {
    if (!deletingVehicle) return;

    // Real implementation
    // await savedVehiclesCache.deleteVehicle(deletingVehicle.id);

    // Demo implementation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setVehicles((prev) => prev.filter((v) => v.id !== deletingVehicle.id));

    toast.push({
      kind: 'success',
      title: 'Vehicle deleted',
      detail: `${deletingVehicle.year} ${deletingVehicle.make} ${deletingVehicle.model}`,
    });
  };

  // Handle select vehicle (e.g., for use in calculator)
  const handleSelectVehicle = (vehicle: Vehicle | GarageVehicle) => {
    const id = 'id' in vehicle ? vehicle.id : undefined;
    setSelectedVehicleId(id || null);

    // Dispatch event for other parts of app to listen
    window.dispatchEvent(
      new CustomEvent('vehicle:selected', {
        detail: vehicle,
      })
    );

    toast.push({
      kind: 'success',
      title: 'Vehicle selected',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Vehicle Management Example
            </h2>
            <p className="text-gray-600 mt-1">
              Integrated with SavedVehiclesCache
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditingVehicle(null);
              setEditorOpen(true);
            }}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Add Vehicle
          </Button>
        </div>

        {/* Vehicle Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <VehicleCardSkeleton variant="detailed" count={3} />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
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
              Get started by adding your first vehicle
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => {
                setEditingVehicle(null);
                setEditorOpen(true);
              }}
            >
              Add Your First Vehicle
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                variant="detailed"
                selected={selectedVehicleId === vehicle.id}
                onSelect={handleSelectVehicle}
                onEdit={(v) => {
                  setEditingVehicle(v as GarageVehicle);
                  setEditorOpen(true);
                }}
                onDelete={(v) => {
                  setDeletingVehicle(v as GarageVehicle);
                  setConfirmDeleteOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {/* Vehicle Editor Modal */}
        <VehicleEditorModal
          isOpen={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditingVehicle(null);
          }}
          vehicle={editingVehicle}
          mode={editingVehicle ? 'edit' : 'add'}
          onSave={handleSaveVehicle}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={confirmDeleteOpen}
          onClose={() => {
            setConfirmDeleteOpen(false);
            setDeletingVehicle(null);
          }}
          onConfirm={handleDeleteVehicle}
          title="Delete Vehicle"
          message={
            deletingVehicle
              ? `Are you sure you want to delete "${
                  deletingVehicle.nickname ||
                  `${deletingVehicle.year} ${deletingVehicle.make} ${deletingVehicle.model}`
                }"? This action cannot be undone.`
              : 'Are you sure you want to delete this vehicle?'
          }
          confirmText="Delete"
          confirmVariant="danger"
        />
      </div>
    </div>
  );
};

export default VehicleManagementExample;
