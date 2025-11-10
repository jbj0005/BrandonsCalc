import React, { useState } from 'react';
import { Modal } from '../ui/components/Modal';
import { Card } from '../ui/components/Card';
import { useToast } from '../ui/components/Toast';
import { Button } from '../ui/components/Button';
import { Input } from '../ui/components/Input';
import { Select } from '../ui/components/Select';
import { Slider } from '../ui/components/Slider';
import { Badge } from '../ui/components/Badge';
import { FormGroup } from '../ui/components/FormGroup';

export const ComponentDemo: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [size, setSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const toast = useToast();

  // Form demo state
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loanTerm, setLoanTerm] = useState(60);
  const [vehicleCondition, setVehicleCondition] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            React Component Library
          </h1>
          <p className="text-gray-600">
            Form components, Modals, Cards, and Toast notifications with Tailwind CSS
          </p>
        </div>

        {/* Toast Demo Section */}
        <Card variant="elevated" padding="lg">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Toast Notifications
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => toast.push({ kind: 'info', title: 'Info Toast', detail: 'This is an informational message' })}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Show Info Toast
            </button>
            <button
              onClick={() => toast.push({ kind: 'success', title: 'Success!', detail: 'Operation completed successfully' })}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Show Success Toast
            </button>
            <button
              onClick={() => toast.push({ kind: 'warning', title: 'Warning', detail: 'Please review this action' })}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
            >
              Show Warning Toast
            </button>
            <button
              onClick={() => toast.push({ kind: 'error', title: 'Error', detail: 'Something went wrong' })}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Show Error Toast
            </button>
          </div>
        </Card>

        {/* Form Components Demo Section */}
        <Card variant="elevated" padding="lg">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Form Components
          </h2>

          <div className="space-y-8">
            {/* Buttons */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Buttons</h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <Button variant="primary" onClick={() => toast.push({ kind: 'info', title: 'Primary button clicked' })}>
                  Primary
                </Button>
                <Button variant="secondary" onClick={() => toast.push({ kind: 'info', title: 'Secondary button clicked' })}>
                  Secondary
                </Button>
                <Button variant="outline">
                  Outline
                </Button>
                <Button variant="ghost">
                  Ghost
                </Button>
                <Button variant="danger">
                  Danger
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 mb-4">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>

              <div className="flex flex-wrap gap-3 mb-4">
                <Button
                  variant="primary"
                  loading={loading}
                  onClick={() => {
                    setLoading(true);
                    setTimeout(() => setLoading(false), 2000);
                  }}
                >
                  {loading ? 'Loading...' : 'Load Data'}
                </Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
                <Button
                  variant="primary"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0a1 1 0 011 1v6h6a1 1 0 110 2H9v6a1 1 0 11-2 0V9H1a1 1 0 110-2h6V1a1 1 0 011-1z" />
                    </svg>
                  }
                >
                  With Icon
                </Button>
              </div>
            </div>

            {/* Badges */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Badges</h3>
              <div className="flex flex-wrap gap-3">
                <Badge variant="default">Default</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="success" size="sm">Small</Badge>
                <Badge variant="warning" size="lg">Large</Badge>
              </div>
            </div>

            {/* Inputs */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Inputs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  onBlur={() => {
                    if (email && !email.includes('@')) {
                      setEmailError('Please enter a valid email address');
                    }
                  }}
                  error={emailError}
                  helperText="We'll never share your email"
                  fullWidth
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter password"
                  success={true}
                  helperText="Strong password!"
                  fullWidth
                />
                <Input
                  label="Search"
                  type="text"
                  placeholder="Search vehicles..."
                  icon={
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M10.442 10.442a1 1 0 011.415 0l3.85 3.85a1 1 0 01-1.414 1.415l-3.85-3.85a1 1 0 010-1.415z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M6.5 12a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM13 6.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" clipRule="evenodd" />
                    </svg>
                  }
                  fullWidth
                />
                <Input
                  label="Disabled Input"
                  type="text"
                  value="Cannot edit"
                  disabled
                  fullWidth
                />
              </div>
            </div>

            {/* Select */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Dropdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Vehicle Condition"
                  placeholder="Select condition..."
                  value={vehicleCondition}
                  onChange={(e) => setVehicleCondition(e.target.value)}
                  options={[
                    { value: 'new', label: 'New' },
                    { value: 'used', label: 'Used' },
                    { value: 'certified', label: 'Certified Pre-Owned' },
                  ]}
                  helperText="Choose your vehicle condition"
                  fullWidth
                />
                <Select
                  label="Loan Term"
                  value="60"
                  options={[
                    { value: '36', label: '36 months' },
                    { value: '48', label: '48 months' },
                    { value: '60', label: '60 months' },
                    { value: '72', label: '72 months' },
                  ]}
                  fullWidth
                />
              </div>
            </div>

            {/* Slider */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Slider</h3>
              <div className="space-y-4">
                <Slider
                  label="Loan Term (months)"
                  min={12}
                  max={84}
                  step={12}
                  value={loanTerm}
                  onChange={(e) => setLoanTerm(Number(e.target.value))}
                  formatValue={(val) => `${val} months`}
                  helperText="Select your preferred loan term"
                  fullWidth
                />
                <Slider
                  label="Down Payment"
                  min={0}
                  max={50000}
                  step={1000}
                  defaultValue={5000}
                  formatValue={(val) => `$${val.toLocaleString()}`}
                  fullWidth
                />
              </div>
            </div>

            {/* FormGroup */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Form Group (Wrapper)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormGroup
                  label="Full Name"
                  required
                  helperText="Enter your first and last name"
                >
                  <input
                    type="text"
                    className="block w-full rounded-lg border border-gray-300 px-4 py-2 text-base focus:border-blue-500 focus:ring-blue-500 focus:outline-none focus:ring-2"
                    placeholder="John Doe"
                  />
                </FormGroup>
                <FormGroup
                  label="Phone Number"
                  error="Please enter a valid phone number"
                >
                  <input
                    type="tel"
                    className="block w-full rounded-lg border border-red-500 px-4 py-2 text-base focus:border-red-500 focus:ring-red-500 focus:outline-none focus:ring-2"
                    placeholder="(555) 123-4567"
                  />
                </FormGroup>
              </div>
            </div>
          </div>
        </Card>

        {/* Modal Demo Section */}
        <Card variant="elevated" padding="lg">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Modal Dialog
          </h2>
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              <label className="text-sm font-medium text-gray-700">Size:</label>
              {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`px-3 py-1 rounded ${
                    size === s
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  } transition-colors`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-medium"
            >
              Open Modal
            </button>
          </div>

          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Example Modal"
            size={size}
          >
            <div className="space-y-4">
              <p className="text-gray-600">
                This is a fully accessible modal dialog with:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>Focus trap (try pressing Tab)</li>
                <li>ESC key to close</li>
                <li>Click backdrop to close</li>
                <li>Smooth animations</li>
                <li>Z-index layer system (500-700)</li>
                <li>Multiple size options</li>
              </ul>
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => {
                    toast.push({ kind: 'success', title: 'Modal action confirmed!' });
                    setModalOpen(false);
                  }}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        </Card>

        {/* Card Variants Demo Section */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Card Variants
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Default Card */}
            <Card variant="default" padding="lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Default Card
              </h3>
              <p className="text-gray-600">
                Standard card with border and light shadow. Great for general content.
              </p>
            </Card>

            {/* Elevated Card */}
            <Card variant="elevated" padding="lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Elevated Card
              </h3>
              <p className="text-gray-600">
                No border, larger shadow. iOS-inspired design for emphasis.
              </p>
            </Card>

            {/* Outlined Card */}
            <Card variant="outlined" padding="lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Outlined Card
              </h3>
              <p className="text-gray-600">
                Thicker border, no shadow. Clean and minimal appearance.
              </p>
            </Card>

            {/* Glass Card */}
            <Card variant="glass" padding="lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Glass Card
              </h3>
              <p className="text-gray-600">
                Glassmorphism effect with blur. Modern and trendy style.
              </p>
            </Card>

            {/* Card with Header & Footer */}
            <Card
              variant="elevated"
              padding="md"
              header={
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Card with Header
                  </h3>
                  <p className="text-sm text-gray-500">Subtitle goes here</p>
                </div>
              }
              footer={
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                    Action
                  </button>
                  <button className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm">
                    Cancel
                  </button>
                </div>
              }
            >
              <p className="text-gray-600">
                Cards can have optional header and footer sections with automatic borders.
              </p>
            </Card>

            {/* Hoverable & Clickable Card */}
            <Card
              variant="default"
              padding="lg"
              hoverable
              onClick={() => toast.push({ kind: 'info', title: 'Card clicked!', detail: 'This card is interactive' })}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Interactive Card
              </h3>
              <p className="text-gray-600">
                Click me! Hoverable cards lift on hover and scale slightly on click.
              </p>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm pt-8">
          <p>Built with React, TypeScript, and Tailwind CSS</p>
          <p className="mt-1">Z-index Layer System: Modal (500-700) · Toasts (800)</p>
        </div>
      </div>
    </div>
  );
};

export default ComponentDemo;
