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
export { Toast, ToastProvider, useToast } from './Toast';
export type { ToastMessage } from './Toast';

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

// Modal Components
export { AuthModal } from './AuthModal';
export type { AuthModalProps } from './AuthModal';

export { VehicleEditorModal } from './VehicleEditorModal';
export type { VehicleEditorModalProps } from './VehicleEditorModal';

export { ConfirmationDialog } from './ConfirmationDialog';
export type { ConfirmationDialogProps } from './ConfirmationDialog';
