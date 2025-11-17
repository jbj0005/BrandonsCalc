import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useToast } from './Toast';
import type { FeeCategory, FeeSuggestion } from '../../types/fees';
import {
  fetchFeeSuggestions,
  addFeeTemplate,
  updateFeeTemplate,
  deleteFeeTemplate,
} from '../../services/feeSuggestionsService';
import { formatCurrencyExact, formatCurrencyInput, parseCurrency } from '../../utils/formatters';

interface FeeTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditingTemplate {
  id?: string;
  setId?: string | null;
  index?: number;
  description: string;
  amount: string;
  category: FeeCategory;
  isNew: boolean;
}

export const FeeTemplateEditorModal: React.FC<FeeTemplateEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<FeeCategory>('dealer');
  const [templates, setTemplates] = useState<Record<FeeCategory, FeeSuggestion[]>>({
    dealer: [],
    customer: [],
    gov: [],
  });
  const [editing, setEditing] = useState<EditingTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    const [dealer, customer, gov] = await Promise.all([
      fetchFeeSuggestions('dealer'),
      fetchFeeSuggestions('customer'),
      fetchFeeSuggestions('gov'),
    ]);

    setTemplates({ dealer, customer, gov });
    setLoading(false);
  };

  const updateEditingField = (field: keyof EditingTemplate, value: string) => {
    setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleEditingKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTemplate();
    }
  };

  // Start editing a template
  const startEdit = (template: FeeSuggestion, category: FeeCategory) => {
    if (!template.id) {
      setError('This template is read-only and cannot be edited.');
      return;
    }

    setEditing({
      id: template.id,
      setId: template.setId ?? null,
      index: typeof template.index === 'number' ? template.index : undefined,
      description: template.description,
      amount: formatCurrencyInput(template.amount.toString()),
      category,
      isNew: false,
    });
    setError(null);
  };

  // Start adding a new template
  const startAdd = () => {
    setEditing({
      description: '',
      amount: '',
      category: activeTab,
      isNew: true,
    });
    setError(null);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  // Save template
  const saveTemplate = async () => {
    if (!editing) return;

    if (!editing.description.trim()) {
      setError('Description is required');
      return;
    }

    const amount = parseCurrency(editing.amount);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);

    let result;
    if (editing.isNew) {
      result = await addFeeTemplate(editing.category, editing.description.trim(), amount);
    } else {
      if (!editing.id) {
        setError('Template metadata missing; please refresh and try again.');
        setLoading(false);
        return;
      }
      result = await updateFeeTemplate(
        editing.category,
        editing.id,
        editing.description.trim(),
        amount
      );
    }

    if (result?.success) {
      toast.push({
        kind: 'success',
        title: editing.isNew ? 'Template Added' : 'Template Updated',
        detail: editing.description.trim(),
      });
      await loadTemplates();
      setEditing(null);
      setError(null);
    } else {
      setError(result?.error || 'Failed to save template');
    }

    setLoading(false);
  };

  // Delete template
  const handleDeleteTemplate = async (template: FeeSuggestion, category: FeeCategory) => {
    if (!template.id) {
      setError('This template cannot be deleted.');
      return;
    }
    if (!confirm('Are you sure you want to delete this template?')) return;

    setLoading(true);
    setError(null);

    const result = await deleteFeeTemplate(category, template.id);

    if (result?.success) {
      toast.push({
        kind: 'success',
        title: 'Template Deleted',
        detail: template.description,
      });
      await loadTemplates();
    } else {
      setError(result?.error || 'Failed to delete template');
    }

    setLoading(false);
  };

  const tabs: Array<{ key: FeeCategory; label: string; color: string }> = [
    { key: 'dealer', label: 'Dealer Fees', color: 'blue' },
    { key: 'customer', label: 'Customer Add-ons', color: 'green' },
    { key: 'gov', label: "Gov't Fees", color: 'amber' },
  ];

  const currentTemplates = templates[activeTab] || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>Manage Fee Templates</h2>
          <p className="text-sm text-white/60 mt-1">
            Add, edit, or remove fee templates for quick entry
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setEditing(null);
                  setError(null);
                }}
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? `border-${tab.color}-600 text-${tab.color}-600`
                    : 'border-transparent text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-400/30 rounded-md text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Templates list */}
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {loading && currentTemplates.length === 0 ? (
            <div className="text-center py-8 text-white/50">Loading templates...</div>
          ) : currentTemplates.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              No templates yet. Click "Add Template" to create one.
            </div>
          ) : (
            currentTemplates.map((template, index) => (
              <div
                key={template.id ?? index}
                className="flex items-center justify-between p-3 bg-white/5 rounded-md hover:bg-white/10 transition-colors border border-white/10"
              >
                <div className="flex-1">
                  {editing && editing.id === template.id && !editing.isNew ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editing?.description ?? ''}
                        onChange={(e) => updateEditingField('description', e.target.value)}
                        onKeyDown={handleEditingKeyDown}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Description"
                      />
                      <input
                        type="text"
                        value={editing?.amount ?? ''}
                        onChange={(e) => updateEditingField('amount', formatCurrencyInput(e.target.value))}
                        onKeyDown={handleEditingKeyDown}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                        placeholder="$0"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{template.description}</span>
                      <span className="text-white/60">{formatCurrencyExact(template.amount)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {editing && editing.id === template.id && !editing.isNew ? (
                    <>
                      <button
                        onClick={saveTemplate}
                        disabled={loading}
                        className="p-1 text-green-400 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={loading}
                        className="p-1 text-white/60 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(template, activeTab)}
                        disabled={loading || !!editing || !template.id}
                        className="p-1 text-blue-400 hover:bg-blue-500/20 rounded transition-colors disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template, activeTab)}
                        disabled={loading || !!editing || !template.id}
                        className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {/* New template form */}
          {editing && editing.isNew && (
            <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={editing?.description ?? ''}
                  onChange={(e) => updateEditingField('description', e.target.value)}
                  onKeyDown={handleEditingKeyDown}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="Description..."
                  autoFocus
                />
                <input
                  type="text"
                  value={editing?.amount ?? ''}
                  onChange={(e) => updateEditingField('amount', formatCurrencyInput(e.target.value))}
                  onKeyDown={handleEditingKeyDown}
                  className="w-32 px-3 py-2 border border-gray-300 rounded text-sm text-right"
                  placeholder="$0"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveTemplate}
                  disabled={loading}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                >
                  Save Template
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/5 rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={startAdd}
            disabled={loading || !!editing}
            className="px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20 rounded transition-colors disabled:opacity-50"
          >
            + Add Template
          </button>

          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FeeTemplateEditorModal;
