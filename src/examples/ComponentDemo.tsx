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
import { VehicleCard } from '../ui/components/VehicleCard';
import { VehicleCardSkeleton } from '../ui/components/VehicleCardSkeleton';
import { AuthModal } from '../ui/components/AuthModal';
import { VehicleEditorModal } from '../ui/components/VehicleEditorModal';
import { ConfirmationDialog } from '../ui/components/ConfirmationDialog';
import { Tabs } from '../ui/components/Tabs';
import { Dropdown } from '../ui/components/Dropdown';
import { Tooltip } from '../ui/components/Tooltip';
import type { GarageVehicle } from '../types';

export const ComponentDemo: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [vehicleEditorOpen, setVehicleEditorOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<GarageVehicle | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState<GarageVehicle | null>(null);
  const [size, setSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const toast = useToast();

  // Form demo state
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loanTerm, setLoanTerm] = useState(60);
  const [vehicleCondition, setVehicleCondition] = useState('');
  const [loading, setLoading] = useState(false);

  // Vehicle demo state
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>('veh-1');
  const [showVehicleSkeleton, setShowVehicleSkeleton] = useState(false);

  // Sample vehicles
  const sampleVehicles: GarageVehicle[] = [
    {
      id: 'veh-1',
      user_id: 'user-123',
      nickname: 'My Daily Driver',
      year: 2022,
      make: 'Honda',
      model: 'Civic',
      trim: 'Sport',
      vin: '2HGFC2F59NH123456',
      mileage: 15420,
      condition: 'excellent',
      estimated_value: 24500,
      payoff_amount: 18000,
      photo_url: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800&auto=format&fit=crop',
      notes: 'Great fuel economy, well maintained, regular oil changes',
      times_used: 5,
      last_used_at: '2025-01-08T10:30:00Z',
      created_at: '2024-06-15T08:00:00Z',
      updated_at: '2025-01-08T10:30:00Z',
    },
    {
      id: 'veh-2',
      user_id: 'user-123',
      year: 2019,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      vin: '2T3P1RFV8KC123789',
      mileage: 42350,
      condition: 'good',
      estimated_value: 28000,
      payoff_amount: 22500,
      notes: 'Family SUV, great for road trips',
      times_used: 3,
      last_used_at: '2024-12-20T14:15:00Z',
      created_at: '2024-03-10T12:00:00Z',
      updated_at: '2024-12-20T14:15:00Z',
    },
    {
      id: 'veh-3',
      user_id: 'user-123',
      nickname: 'Weekend Truck',
      year: 2021,
      make: 'Ford',
      model: 'F-150',
      trim: 'Lariat',
      vin: '1FTEW1EP5MKF12345',
      mileage: 28900,
      condition: 'excellent',
      estimated_value: 45000,
      payoff_amount: 38000,
      photo_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop',
      times_used: 2,
      created_at: '2024-08-22T16:45:00Z',
      updated_at: '2025-01-01T09:00:00Z',
    },
  ];

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

        {/* Vehicle Cards Demo Section */}
        <Card variant="elevated" padding="lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Vehicle Cards
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Display saved vehicles, trade-ins, and search results
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setEditingVehicle(null);
                  setVehicleEditorOpen(true);
                }}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                Add Vehicle
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowVehicleSkeleton(true);
                  setTimeout(() => setShowVehicleSkeleton(false), 2000);
                }}
              >
                Show Loading State
              </Button>
            </div>
          </div>

          {/* Detailed Variant */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed View</h3>
            {showVehicleSkeleton ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <VehicleCardSkeleton variant="detailed" count={3} />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sampleVehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    variant="detailed"
                    selected={selectedVehicleId === vehicle.id}
                    onSelect={(v) => {
                      setSelectedVehicleId(v.id!);
                      toast.push({
                        kind: 'success',
                        title: 'Vehicle Selected',
                        detail: `${v.year} ${v.make} ${v.model}`,
                      });
                    }}
                    onEdit={(v) => {
                      setEditingVehicle(v as GarageVehicle);
                      setVehicleEditorOpen(true);
                    }}
                    onDelete={(v) => {
                      setDeletingVehicle(v as GarageVehicle);
                      setConfirmDeleteOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Compact Variant */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Compact View</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sampleVehicles.slice(0, 2).map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  variant="compact"
                  showActions={false}
                  onSelect={(v) => {
                    setSelectedVehicleId(v.id!);
                    toast.push({
                      kind: 'success',
                      title: 'Vehicle Selected',
                      detail: `${v.year} ${v.make} ${v.model}`,
                    });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Features List */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2">Features:</h4>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-blue-800">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Photo display with fallback
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Condition badges with color coding
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Equity calculation (value - payoff)
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Selection state with visual indicator
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Usage statistics for garage vehicles
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Skeleton loading states
              </li>
            </ul>
          </div>

          {/* VehicleEditorModal */}
          <VehicleEditorModal
            isOpen={vehicleEditorOpen}
            onClose={() => {
              setVehicleEditorOpen(false);
              setEditingVehicle(null);
            }}
            vehicle={editingVehicle}
            mode={editingVehicle ? 'edit' : 'add'}
            onSave={async (vehicleData) => {
              // Simulate API call
              await new Promise((resolve) => setTimeout(resolve, 1500));
              console.log(editingVehicle ? 'Updating vehicle:' : 'Adding vehicle:', vehicleData);
            }}
          />

          {/* ConfirmationDialog */}
          <ConfirmationDialog
            isOpen={confirmDeleteOpen}
            onClose={() => {
              setConfirmDeleteOpen(false);
              setDeletingVehicle(null);
            }}
            onConfirm={async () => {
              // Simulate API call
              await new Promise((resolve) => setTimeout(resolve, 1500));
              console.log('Deleting vehicle:', deletingVehicle);
              toast.push({
                kind: 'success',
                title: 'Vehicle Deleted',
                detail: deletingVehicle
                  ? `${deletingVehicle.year} ${deletingVehicle.make} ${deletingVehicle.model}`
                  : 'Vehicle successfully deleted',
              });
            }}
            title="Delete Vehicle"
            message={
              deletingVehicle
                ? `Are you sure you want to delete "${deletingVehicle.nickname || `${deletingVehicle.year} ${deletingVehicle.make} ${deletingVehicle.model}`}"? This action cannot be undone.`
                : 'Are you sure you want to delete this vehicle? This action cannot be undone.'
            }
            confirmText="Delete"
            confirmVariant="danger"
          />
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
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setModalOpen(true)}
                className="px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-medium"
              >
                Open Generic Modal
              </button>
              <button
                onClick={() => {
                  setAuthMode('signin');
                  setAuthModalOpen(true);
                }}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                Open Sign In Modal
              </button>
              <button
                onClick={() => {
                  setAuthMode('signup');
                  setAuthModalOpen(true);
                }}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
              >
                Open Sign Up Modal
              </button>
            </div>
          </div>

          {/* AuthModal Demo */}
          <AuthModal
            isOpen={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
            initialMode={authMode}
            onSignIn={async (email, password) => {
              // Simulate API call
              await new Promise((resolve) => setTimeout(resolve, 1500));
              console.log('Sign in:', email, password);
            }}
            onSignUp={async (email, password, fullName, phone) => {
              // Simulate API call
              await new Promise((resolve) => setTimeout(resolve, 1500));
              console.log('Sign up:', { email, password, fullName, phone });
            }}
            onForgotPassword={async (email) => {
              // Simulate API call
              await new Promise((resolve) => setTimeout(resolve, 1500));
              console.log('Forgot password:', email);
            }}
          />

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

        {/* Utility Components Demo Section */}
        <Card variant="elevated" padding="lg">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Utility Components
          </h2>

          <div className="space-y-8">
            {/* Tabs */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tabs</h3>

              <div className="space-y-6">
                {/* Line Tabs */}
                <div>
                  <p className="text-sm text-gray-600 mb-3">Line Variant (Default)</p>
                  <Tabs
                    variant="line"
                    tabs={[
                      {
                        id: 'overview',
                        label: 'Overview',
                        content: (
                          <div className="text-gray-600">
                            <p>This is the overview tab content. Line tabs use an underline to indicate the active tab.</p>
                          </div>
                        ),
                      },
                      {
                        id: 'details',
                        label: 'Details',
                        badge: 3,
                        content: (
                          <div className="text-gray-600">
                            <p>Details tab with a badge showing 3 items.</p>
                          </div>
                        ),
                      },
                      {
                        id: 'settings',
                        label: 'Settings',
                        icon: (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        ),
                        content: (
                          <div className="text-gray-600">
                            <p>Settings tab with an icon.</p>
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>

                {/* Pills Tabs */}
                <div>
                  <p className="text-sm text-gray-600 mb-3">Pills Variant</p>
                  <Tabs
                    variant="pills"
                    tabs={[
                      { id: 'all', label: 'All', badge: 12, content: <p className="text-gray-600">All items view</p> },
                      { id: 'active', label: 'Active', badge: 8, content: <p className="text-gray-600">Active items only</p> },
                      { id: 'archived', label: 'Archived', badge: 4, content: <p className="text-gray-600">Archived items</p> },
                    ]}
                  />
                </div>

                {/* Enclosed Tabs */}
                <div>
                  <p className="text-sm text-gray-600 mb-3">Enclosed Variant</p>
                  <Tabs
                    variant="enclosed"
                    tabs={[
                      { id: 'info', label: 'Information', content: <p className="text-gray-600">Information content with bordered container</p> },
                      { id: 'history', label: 'History', content: <p className="text-gray-600">History content</p> },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Dropdown */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Dropdown</h3>
              <div className="flex gap-4">
                <Dropdown
                  trigger={
                    <Button variant="outline">
                      Actions
                      <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  }
                  items={[
                    {
                      id: 'edit',
                      label: 'Edit',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      ),
                      onClick: () => toast.push({ kind: 'info', title: 'Edit clicked' }),
                    },
                    {
                      id: 'duplicate',
                      label: 'Duplicate',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      ),
                      onClick: () => toast.push({ kind: 'info', title: 'Duplicate clicked' }),
                    },
                    { id: 'divider1', label: '', divider: true },
                    {
                      id: 'delete',
                      label: 'Delete',
                      danger: true,
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      ),
                      onClick: () => toast.push({ kind: 'warning', title: 'Delete clicked' }),
                    },
                  ]}
                  position="right"
                />

                <Dropdown
                  trigger={
                    <Button variant="ghost">
                      More Options
                    </Button>
                  }
                  items={[
                    { id: 'share', label: 'Share', onClick: () => toast.push({ kind: 'info', title: 'Share' }) },
                    { id: 'export', label: 'Export', onClick: () => toast.push({ kind: 'info', title: 'Export' }) },
                    { id: 'disabled', label: 'Disabled Option', disabled: true },
                  ]}
                />
              </div>
            </div>

            {/* Tooltip */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tooltip</h3>
              <div className="flex gap-6">
                <Tooltip content="This tooltip appears on top" position="top">
                  <Button variant="outline" size="sm">Hover (Top)</Button>
                </Tooltip>
                <Tooltip content="This tooltip appears on bottom" position="bottom">
                  <Button variant="outline" size="sm">Hover (Bottom)</Button>
                </Tooltip>
                <Tooltip content="This tooltip appears on left" position="left">
                  <Button variant="outline" size="sm">Hover (Left)</Button>
                </Tooltip>
                <Tooltip content="This tooltip appears on right" position="right">
                  <Button variant="outline" size="sm">Hover (Right)</Button>
                </Tooltip>
                <Tooltip
                  content={
                    <div>
                      <p className="font-semibold mb-1">Rich Content</p>
                      <p className="text-xs">Tooltips can contain any React element!</p>
                    </div>
                  }
                  position="top"
                >
                  <Badge variant="info">Hover for rich content</Badge>
                </Tooltip>
              </div>
            </div>
          </div>
        </Card>

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
