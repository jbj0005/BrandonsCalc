import React from 'react';
import { Card } from './Card';
import { Badge } from './Badge';
import { Button } from './Button';
import type { Vehicle, GarageVehicle, CreditScore } from '../../types';

export interface VehicleCardProps {
  /** Vehicle data (Vehicle or GarageVehicle) */
  vehicle: Vehicle | GarageVehicle;
  /** Card variant */
  variant?: 'compact' | 'detailed';
  /** Show action buttons */
  showActions?: boolean;
  /** Is this vehicle currently selected */
  selected?: boolean;
  /** Select vehicle handler */
  onSelect?: (vehicle: Vehicle | GarageVehicle) => void;
  /** Edit vehicle handler */
  onEdit?: (vehicle: Vehicle | GarageVehicle) => void;
  /** Delete vehicle handler */
  onDelete?: (vehicle: Vehicle | GarageVehicle) => void;
  /** Additional className */
  className?: string;
}

/**
 * Get condition badge variant based on condition
 */
const getConditionBadge = (condition?: CreditScore | string): { variant: 'success' | 'info' | 'warning' | 'default'; label: string } => {
  if (!condition) return { variant: 'default', label: 'Unknown' };

  const conditionMap: Record<string, { variant: 'success' | 'info' | 'warning' | 'default'; label: string }> = {
    excellent: { variant: 'success', label: 'Excellent' },
    good: { variant: 'info', label: 'Good' },
    fair: { variant: 'warning', label: 'Fair' },
    poor: { variant: 'warning', label: 'Poor' },
    new: { variant: 'success', label: 'New' },
    used: { variant: 'info', label: 'Used' },
    certified: { variant: 'success', label: 'Certified Pre-Owned' },
  };

  return conditionMap[condition.toLowerCase()] || { variant: 'default', label: condition };
};

/**
 * Check if vehicle is a GarageVehicle
 */
const isGarageVehicle = (vehicle: Vehicle | GarageVehicle): vehicle is GarageVehicle => {
  return 'user_id' in vehicle;
};

/**
 * VehicleCard - Display vehicle information in a card format
 */
export const VehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  variant = 'detailed',
  showActions = true,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
  className = '',
}) => {
  const garageVehicle = isGarageVehicle(vehicle) ? vehicle : null;
  const conditionBadge = getConditionBadge(vehicle.condition);

  // Build vehicle title
  const vehicleTitle = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
  ].filter(Boolean).join(' ');

  // Format currency
  const formatCurrency = (value?: number) => {
    if (value == null) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format mileage
  const formatMileage = (mileage?: number) => {
    if (mileage == null) return null;
    return `${mileage.toLocaleString()} mi`;
  };

  return (
    <Card
      variant={selected ? 'elevated' : 'default'}
      padding="none"
      className={`
        transition-all duration-200
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${onSelect ? 'cursor-pointer hover:shadow-lg' : ''}
        ${className}
      `}
    >
      {/* Photo Section */}
      {variant === 'detailed' && (
        <div className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
          {vehicle.photo_url ? (
            <img
              src={vehicle.photo_url}
              alt={vehicleTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <svg
                className="w-20 h-20 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12"
                />
              </svg>
            </div>
          )}

          {/* Selected indicator */}
          {selected && (
            <div className="absolute top-3 right-3 bg-blue-500 text-white rounded-full p-2 shadow-lg">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Content Section */}
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {/* Nickname (for garage vehicles) */}
            {garageVehicle?.nickname && (
              <p className="text-sm font-semibold text-blue-600 mb-1 truncate">
                {garageVehicle.nickname}
              </p>
            )}

            {/* Vehicle Title */}
            <h3 className="text-lg font-bold text-gray-900 truncate">
              {vehicleTitle}
            </h3>

            {/* VIN (compact display) */}
            {vehicle.vin && variant === 'compact' && (
              <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                VIN: {vehicle.vin}
              </p>
            )}
          </div>

          {/* Condition Badge */}
          {vehicle.condition && (
            <Badge variant={conditionBadge.variant} size="sm">
              {conditionBadge.label}
            </Badge>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          {/* Asking Price (for saved vehicles) */}
          {vehicle.asking_price != null && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Asking Price</p>
              <p className="font-semibold text-blue-600">{formatCurrency(vehicle.asking_price)}</p>
            </div>
          )}

          {/* Mileage */}
          {vehicle.mileage != null && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Mileage</p>
              <p className="font-semibold text-gray-900">{formatMileage(vehicle.mileage)}</p>
            </div>
          )}

          {/* Estimated Value (for garage vehicles) */}
          {vehicle.estimated_value != null && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Est. Value</p>
              <p className="font-semibold text-green-600">{formatCurrency(vehicle.estimated_value)}</p>
            </div>
          )}

          {/* Payoff Amount */}
          {vehicle.payoff_amount != null && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Payoff</p>
              <p className="font-semibold text-orange-600">{formatCurrency(vehicle.payoff_amount)}</p>
            </div>
          )}

          {/* Equity (calculated from estimated_value - payoff_amount) */}
          {vehicle.estimated_value != null && vehicle.payoff_amount != null && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Equity</p>
              <p className={`font-semibold ${
                vehicle.estimated_value - vehicle.payoff_amount >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {formatCurrency(vehicle.estimated_value - vehicle.payoff_amount)}
              </p>
            </div>
          )}
        </div>

        {/* VIN (detailed display) */}
        {vehicle.vin && variant === 'detailed' && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-0.5">VIN</p>
            <p className="text-sm font-mono text-gray-700 truncate">{vehicle.vin}</p>
          </div>
        )}

        {/* Notes */}
        {vehicle.notes && variant === 'detailed' && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-600 line-clamp-2">{vehicle.notes}</p>
          </div>
        )}

        {/* Usage Stats (for garage vehicles) */}
        {garageVehicle && variant === 'detailed' && (garageVehicle.times_used || garageVehicle.last_used_at) && (
          <div className="border-t border-gray-200 pt-3 mb-4">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {garageVehicle.times_used != null && (
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>Used {garageVehicle.times_used}x</span>
                </div>
              )}
              {garageVehicle.last_used_at && (
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Last: {new Date(garageVehicle.last_used_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {showActions && (
          <div className="flex gap-2">
            {onSelect && (
              <Button
                variant={selected ? 'primary' : 'outline'}
                size="sm"
                fullWidth
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(vehicle);
                }}
              >
                {selected ? 'Selected' : 'Select'}
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(vehicle);
                }}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(vehicle);
                }}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default VehicleCard;
