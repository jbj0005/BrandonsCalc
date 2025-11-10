# Component Library Documentation

A comprehensive, production-ready React + TypeScript component library built with Tailwind CSS for Brandon's Calculator.

## 📦 Component Inventory (22 Components)

### Foundation Components (11)

#### Button
5 variants, 3 sizes, loading states, icon support
```tsx
import { Button } from './src/ui/components';

<Button variant="primary" size="md" loading={false}>
  Click Me
</Button>
```
**Variants**: `primary` | `secondary` | `outline` | `ghost` | `danger`
**Sizes**: `sm` | `md` | `lg`

#### Input
Text input with validation, icons, error/success states
```tsx
<Input
  label="Email"
  type="email"
  error={emailError}
  icon={<SearchIcon />}
  fullWidth
/>
```

#### Select
Custom dropdown with chevron icon
```tsx
<Select
  label="Vehicle Condition"
  options={[
    { value: 'new', label: 'New' },
    { value: 'used', label: 'Used' },
  ]}
  placeholder="Select..."
/>
```

#### Slider
Range input with visual gradient and value formatting
```tsx
<Slider
  label="Loan Term"
  min={12}
  max={84}
  step={12}
  formatValue={(val) => `${val} months`}
/>
```

#### Label
Form label with required indicator
```tsx
<Label required>Full Name</Label>
```

#### Badge
Status indicators with 5 color variants
```tsx
<Badge variant="success">Active</Badge>
```
**Variants**: `default` | `success` | `warning` | `danger` | `info`

#### FormGroup
Wrapper component combining label + control + error
```tsx
<FormGroup label="Email" required error={error}>
  <Input type="email" />
</FormGroup>
```

#### Checkbox
Checkbox input with indeterminate state support
```tsx
<Checkbox
  label="I accept the terms"
  checked={accepted}
  onChange={(e) => setAccepted(e.target.checked)}
  helperText="Required to continue"
/>
```
**Sizes**: `sm` | `md` | `lg`
**Features**: Indeterminate state, error/helper text, disabled state

#### Radio & RadioGroup
Radio button with group management
```tsx
<RadioGroup
  label="Payment Method"
  name="payment"
  value={paymentMethod}
  onChange={setPaymentMethod}
  options={[
    { value: 'credit', label: 'Credit Card' },
    { value: 'debit', label: 'Debit Card' },
  ]}
/>
```
**Orientations**: `vertical` | `horizontal`
**Sizes**: `sm` | `md` | `lg`
**Features**: Helper text per option, disabled options, error state

#### Switch
Toggle switch component
```tsx
<Switch
  label="Enable notifications"
  checked={enabled}
  onChange={(e) => setEnabled(e.target.checked)}
  labelPosition="right"
/>
```
**Sizes**: `sm` | `md` | `lg`
**Label positions**: `left` | `right`
**Features**: Smooth animations, disabled state, error state

---

### Layout Components (2)

#### Card
Container with 4 visual variants
```tsx
<Card variant="elevated" padding="lg">
  <h3>Card Title</h3>
  <p>Card content</p>
</Card>
```
**Variants**: `default` | `elevated` | `outlined` | `glass`
**Features**: Header/footer support, hoverable, clickable

#### Modal
Accessible dialog with 4 sizes
```tsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Modal Title"
  size="md"
>
  Modal content
</Modal>
```
**Sizes**: `sm` | `md` | `lg` | `xl`
**Features**: Focus trap, ESC key, backdrop click, animations

---

### Feedback Components (2)

#### Toast
Notification system with 4 types
```tsx
const toast = useToast();

toast.push({
  kind: 'success',
  title: 'Success!',
  detail: 'Operation completed',
});
```
**Types**: `success` | `error` | `warning` | `info`
**z-index**: 800

#### ConfirmationDialog
Reusable confirmation modal
```tsx
<ConfirmationDialog
  isOpen={isOpen}
  onClose={handleClose}
  onConfirm={handleConfirm}
  title="Delete Vehicle"
  message="Are you sure?"
  confirmVariant="danger"
/>
```

---

### Utility Components (4)

#### Tabs
Tabbed navigation with 3 variants
```tsx
<Tabs
  variant="line"
  tabs={[
    { id: 'tab1', label: 'Tab 1', content: <div>Content</div> },
    { id: 'tab2', label: 'Tab 2', badge: 5, content: <div>Content</div> },
  ]}
/>
```
**Variants**: `line` | `pills` | `enclosed`
**Features**: Icons, badges, disabled tabs

#### Dropdown
Menu dropdown with items
```tsx
<Dropdown
  trigger={<Button>Actions</Button>}
  items={[
    { id: 'edit', label: 'Edit', icon: <EditIcon />, onClick: handleEdit },
    { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
  ]}
  position="right"
/>
```
**Features**: Icons, dividers, disabled/danger items, auto-close
**z-index**: 200

#### Tooltip
Hover tooltips with 4 positions
```tsx
<Tooltip content="Helpful hint" position="top">
  <Button>Hover me</Button>
</Tooltip>
```
**Positions**: `top` | `bottom` | `left` | `right`
**Features**: Configurable delay, rich content support
**z-index**: 400

#### Accordion
Collapsible content panels
```tsx
<Accordion
  items={[
    { id: '1', title: 'Section 1', content: <div>Content</div> },
    { id: '2', title: 'Section 2', content: <div>Content</div> },
  ]}
  variant="bordered"
  allowMultiple
  defaultExpanded={['1']}
/>
```
**Variants**: `default` | `bordered` | `separated`
**Features**: Icons, disabled items, controlled/uncontrolled, smooth animations

---

### Vehicle Components (2)

#### VehicleCard
Display vehicle information
```tsx
<VehicleCard
  vehicle={vehicleData}
  variant="detailed"
  selected={isSelected}
  onSelect={handleSelect}
  onEdit={handleEdit}
  onDelete={handleDelete}
/>
```
**Variants**: `detailed` (with photo) | `compact`
**Features**: Photos, condition badges, equity calculation, selection state

#### VehicleCardSkeleton
Loading placeholder
```tsx
<VehicleCardSkeleton variant="detailed" count={3} />
```

---

### Modal Components (2)

#### AuthModal
Complete authentication flow
```tsx
<AuthModal
  isOpen={isOpen}
  onClose={handleClose}
  initialMode="signin"
  onSignIn={handleSignIn}
  onSignUp={handleSignUp}
  onForgotPassword={handleForgotPassword}
/>
```
**Modes**: `signin` | `signup` | `forgot`
**Features**: Real-time validation, mode switching, loading states

#### VehicleEditorModal
Add/edit vehicles
```tsx
<VehicleEditorModal
  isOpen={isOpen}
  onClose={handleClose}
  vehicle={vehicleToEdit}
  mode="edit"
  onSave={handleSave}
/>
```
**Modes**: `add` | `edit`
**Features**: Full form validation, live equity calculation, photo URL support

---

## 🚀 Quick Start

### Import Components
```tsx
// Single import for all components
import {
  Button,
  Input,
  Select,
  Checkbox,
  Radio,
  RadioGroup,
  Switch,
  Modal,
  Toast,
  VehicleCard,
  Tabs,
  Dropdown,
  Tooltip,
  Accordion,
} from './src/ui/components';

// Or import individually
import { Button } from './src/ui/components/Button';
import { Checkbox } from './src/ui/components/Checkbox';
import { RadioGroup } from './src/ui/components/Radio';
```

### Toast Provider Setup
Wrap your app with ToastProvider:
```tsx
import { ToastProvider } from './src/ui/components';

function App() {
  return (
    <ToastProvider>
      <YourApp />
    </ToastProvider>
  );
}
```

### Use Toast Notifications
```tsx
import { useToast } from './src/ui/components';

function MyComponent() {
  const toast = useToast();

  const handleAction = () => {
    toast.push({
      kind: 'success',
      title: 'Saved!',
      detail: 'Changes saved successfully',
    });
  };

  return <Button onClick={handleAction}>Save</Button>;
}
```

---

## 🎨 Design System

### Z-Index Layers
```
Layer 1 (100): Interactive elements
Layer 2 (200): Dropdowns
Layer 3 (300): Sticky navigation
Layer 4 (400): Tooltips
Layer 5 (500): Modal backdrops
Layer 6 (600): Modal content
Layer 7 (700): Modal controls
Layer 8 (800): Toast notifications
```

### Color Palette
- **Primary**: Blue (`blue-500`, `blue-600`, `blue-700`)
- **Secondary**: Yellow (`yellow-400`, `yellow-500`)
- **Success**: Green (`green-500`, `green-600`)
- **Warning**: Yellow (`yellow-500`, `yellow-600`)
- **Danger**: Red (`red-500`, `red-600`)
- **Info**: Blue (`blue-500`, `blue-600`)

### Typography
- **Font**: Tailwind default (system fonts)
- **Weights**: `font-medium` (500), `font-semibold` (600), `font-bold` (700)

---

## 📋 Integration Examples

### Real Authentication
See `src/examples/AuthIntegrationExample.tsx` for complete Supabase integration

### Vehicle Management
See `src/examples/VehicleManagementExample.tsx` for SavedVehiclesCache integration

### Component Demo
See `src/examples/ComponentDemo.tsx` for all component showcases

---

## 🛠 Built With

- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS v3** - Styling
- **Vite** - Build tool
- **PostCSS** - CSS processing

---

## 📁 File Structure

```
src/
├── ui/
│   └── components/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       ├── Slider.tsx
│       ├── Label.tsx
│       ├── Badge.tsx
│       ├── FormGroup.tsx
│       ├── Checkbox.tsx
│       ├── Radio.tsx
│       ├── Switch.tsx
│       ├── Card.tsx
│       ├── Modal.tsx
│       ├── Toast.tsx
│       ├── ConfirmationDialog.tsx
│       ├── Tabs.tsx
│       ├── Dropdown.tsx
│       ├── Tooltip.tsx
│       ├── Accordion.tsx
│       ├── VehicleCard.tsx
│       ├── VehicleCardSkeleton.tsx
│       ├── AuthModal.tsx
│       ├── VehicleEditorModal.tsx
│       └── index.ts (barrel export)
├── examples/
│   ├── ComponentDemo.tsx
│   ├── AuthIntegrationExample.tsx
│   └── VehicleManagementExample.tsx
└── types/
    └── index.ts
```

---

## ✨ Features

- ✅ 22 production-ready components
- ✅ Full TypeScript support
- ✅ Accessible (ARIA attributes, keyboard navigation)
- ✅ Responsive and mobile-friendly
- ✅ iOS-inspired design aesthetic
- ✅ Dark mode support (where applicable)
- ✅ Loading states and skeletons
- ✅ Form validation
- ✅ Event-driven architecture
- ✅ Z-index layer system
- ✅ Icon support throughout
- ✅ Animation and transitions
- ✅ Barrel exports for clean imports

---

## 🎯 Next Steps

1. **Connect to Real Data** - Integrate with Supabase and SavedVehiclesCache
2. **Add Tests** - Write unit tests with Vitest/React Testing Library
3. **Add Storybook** - Create interactive component documentation
4. **Add More Components** - DatePicker, TimePicker, FileUpload, ProgressBar, etc.
5. **Add Animations** - Integrate Framer Motion for smooth transitions
6. **Create Design Tokens** - Extract colors, spacing, etc. to config

---

## 📖 View Live Demo

Visit: http://localhost:3000/BrandonsCalc/

All components are interactive and fully functional!

---

## 🤝 Contributing

This component library is part of Brandon's Calculator project. All components follow:
- React best practices
- TypeScript strict mode
- Tailwind CSS utility-first approach
- Accessibility guidelines (WCAG 2.1)
- Mobile-first responsive design

---

## 📝 License

Part of Brandon's Calculator project.

---

**Built with ❤️ using Claude Code**
