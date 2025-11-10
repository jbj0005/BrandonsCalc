import React, { useState } from 'react';
import { Modal } from '../ui/components/Modal';
import { Card } from '../ui/components/Card';
import { useToast } from '../ui/components/Toast';

export const ComponentDemo: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [size, setSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const toast = useToast();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            React Component Library
          </h1>
          <p className="text-gray-600">
            Modal, Card, and Toast components with Tailwind CSS
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
