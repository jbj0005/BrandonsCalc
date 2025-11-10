import React from 'react';
import { Card } from './Card';

export interface VehicleCardSkeletonProps {
  /** Card variant */
  variant?: 'compact' | 'detailed';
  /** Number of skeletons to render */
  count?: number;
  /** Additional className */
  className?: string;
}

/**
 * Skeleton component for loading vehicle cards
 */
const SkeletonPulse: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

/**
 * VehicleCardSkeleton - Loading placeholder for VehicleCard
 */
export const VehicleCardSkeleton: React.FC<VehicleCardSkeletonProps> = ({
  variant = 'detailed',
  count = 1,
  className = '',
}) => {
  const skeletons = Array.from({ length: count }, (_, i) => (
    <Card
      key={i}
      variant="default"
      padding="none"
      className={className}
    >
      {/* Photo Section (detailed only) */}
      {variant === 'detailed' && (
        <div className="relative aspect-video bg-gray-100">
          <SkeletonPulse className="w-full h-full rounded-t-lg" />
        </div>
      )}

      {/* Content Section */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 space-y-2">
            {/* Nickname skeleton (optional) */}
            {Math.random() > 0.5 && (
              <SkeletonPulse className="h-4 w-24" />
            )}
            {/* Title */}
            <SkeletonPulse className="h-6 w-3/4" />
          </div>
          {/* Badge */}
          <SkeletonPulse className="h-6 w-16 rounded-full" />
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-1">
            <SkeletonPulse className="h-3 w-12" />
            <SkeletonPulse className="h-5 w-20" />
          </div>
          <div className="space-y-1">
            <SkeletonPulse className="h-3 w-12" />
            <SkeletonPulse className="h-5 w-20" />
          </div>
          <div className="space-y-1">
            <SkeletonPulse className="h-3 w-12" />
            <SkeletonPulse className="h-5 w-20" />
          </div>
          <div className="space-y-1">
            <SkeletonPulse className="h-3 w-12" />
            <SkeletonPulse className="h-5 w-20" />
          </div>
        </div>

        {/* VIN (detailed only) */}
        {variant === 'detailed' && (
          <div className="mb-4 space-y-1">
            <SkeletonPulse className="h-3 w-8" />
            <SkeletonPulse className="h-4 w-full" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <SkeletonPulse className="h-9 flex-1 rounded-lg" />
          <SkeletonPulse className="h-9 w-20 rounded-lg" />
          <SkeletonPulse className="h-9 w-20 rounded-lg" />
        </div>
      </div>
    </Card>
  ));

  return count === 1 ? skeletons[0] : <>{skeletons}</>;
};

export default VehicleCardSkeleton;
