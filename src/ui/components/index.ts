/**
 * Component Library Barrel Export
 *
 * Centralized export for all UI components.
 * Import components using: import { Button, Input } from '@/ui/components'
 */

// Foundation Components
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { EnhancedSlider } from './EnhancedSlider';
export type { EnhancedSliderProps } from './EnhancedSlider';

export { EnhancedControl } from './EnhancedControl';
export type { EnhancedControlProps } from './EnhancedControl';

export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';

export { Label } from './Label';
export type { LabelProps } from './Label';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { FormGroup } from './FormGroup';
export type { FormGroupProps } from './FormGroup';

export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';

export { Radio, RadioGroup } from './Radio';
export type { RadioProps, RadioGroupProps, RadioOption } from './Radio';

export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

// Layout Components
export { Card } from './Card';
export type { CardProps } from './Card';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

// Feedback Components
export { ToastProvider, useToast } from './Toast';

// Utility Components
export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { Dropdown } from './Dropdown';
export type { DropdownProps, DropdownItem } from './Dropdown';

export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export { Accordion } from './Accordion';
export type { AccordionProps, AccordionItem } from './Accordion';

// Vehicle Components
export { VehicleCard } from './VehicleCard';
export type { VehicleCardProps } from './VehicleCard';

export { VehicleCardSkeleton } from './VehicleCardSkeleton';
export type { VehicleCardSkeletonProps } from './VehicleCardSkeleton';

// Premium Vehicle Components
export { VehicleCardPremium } from './VehicleCardPremium';
export type { VehicleCardPremiumProps } from './VehicleCardPremium';

export { VINSearchPremium } from './VINSearchPremium';
export type { VINSearchPremiumProps, VehicleOption } from './VINSearchPremium';

export { LocationSearchPremium } from './LocationSearchPremium';
export type { LocationSearchPremiumProps, LocationDetails } from './LocationSearchPremium';

// Modal Components
export { AuthModal } from './AuthModal';
export type { AuthModalProps } from './AuthModal';

export { VehicleEditorModal } from './VehicleEditorModal';
export type { VehicleEditorModalProps } from './VehicleEditorModal';

export { ConfirmationDialog } from './ConfirmationDialog';
export type { ConfirmationDialogProps } from './ConfirmationDialog';

// TIL Components
export { TilControl } from './TilControl';
export type { TilControlProps } from './TilControl';

// Additional Modal Components
export { UnavailableVehicleModal } from './UnavailableVehicleModal';
export type { UnavailableVehicleModalProps } from './UnavailableVehicleModal';

export { AprConfirmationModal } from './AprConfirmationModal';
export type { AprConfirmationModalProps } from './AprConfirmationModal';

export { DuplicateVehicleModal } from './DuplicateVehicleModal';
export type { DuplicateVehicleModalProps } from './DuplicateVehicleModal';

export { ConflictResolutionModal } from './ConflictResolutionModal';
export type { ConflictResolutionModalProps, FieldConflict } from './ConflictResolutionModal';

export { EmailHandshakeModal } from './EmailHandshakeModal';
export type { EmailHandshakeModalProps, EmailHandshakeStage } from './EmailHandshakeModal';

export { SendModeModal } from './SendModeModal';
export type { SendModeModalProps, SendMode, SendChannel } from './SendModeModal';

export { DisplayPreferencesModal } from './DisplayPreferencesModal';
export type { DisplayPreferencesModalProps } from './DisplayPreferencesModal';

export { ItemizationCard } from './ItemizationCard';
export type { ItemizationCardProps } from './ItemizationCard';

export { SubmissionProgressModal } from './SubmissionProgressModal';
export type { SubmissionProgressModalProps, ProgressStage } from './SubmissionProgressModal';

export { MyOffersModal } from './MyOffersModal';
export type { MyOffersModalProps } from './MyOffersModal';

export { PositiveEquityModal } from './PositiveEquityModal';
export type { PositiveEquityModalProps } from './PositiveEquityModal';

// User Profile Components
export { UserProfileDropdown } from './UserProfileDropdown';
export type { UserProfileDropdownProps } from './UserProfileDropdown';

export { CurrencyInput } from './CurrencyInput';
export type { CurrencyInputProps } from './CurrencyInput';
