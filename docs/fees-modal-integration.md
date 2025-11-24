# FeesModal Integration with Fee Engine

This guide shows how to integrate the ScenarioDetectionPanel into your FeesModal.

## 1. Import Required Components

```typescript
import { ScenarioDetectionPanel } from '../ui/components';
import { useCalculatorStore } from '../stores/calculatorStore';
```

## 2. Add Scenario Panel to FeesModal

Update your FeesModal component to include the ScenarioDetectionPanel at the top:

```typescript
export const FeesModal: React.FC<FeesModalProps> = ({
  isOpen,
  onClose,
  // ... other props
}) => {
  // Get fee engine result from store
  const feeEngineResult = useCalculatorStore((state) => state.feeEngineResult);
  const applyFeeEngineResult = useCalculatorStore((state) => state.applyFeeEngineResult);

  // State for auto-mode toggle
  const [autoModeEnabled, setAutoModeEnabled] = useState(true);

  // When scenario result changes, optionally auto-apply
  useEffect(() => {
    if (feeEngineResult && autoModeEnabled && isOpen) {
      // Auto-populate government fees from engine result
      const govFees = feeEngineResult.lineItems
        .filter(item => item.category === 'government')
        .map(item => ({
          description: item.description,
          amount: item.amount,
        }));

      // Set government fees in modal
      setGovRows(govFees.map(fee => ({
        description: fee.description,
        amount: formatCurrencyInput(fee.amount.toString()),
      })));

      // Set tax rates
      setStateTax(feeEngineResult.taxBreakdown.stateTaxRate.toString());
      setCountyTax(feeEngineResult.taxBreakdown.countyTaxRate.toString());
    }
  }, [feeEngineResult, autoModeEnabled, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Edit Fees & Taxes</h2>

        {/* ADD THIS: Scenario Detection Panel */}
        <ScenarioDetectionPanel
          scenarioResult={feeEngineResult}
          isCalculating={false}
          autoModeEnabled={autoModeEnabled}
          onToggleAutoMode={setAutoModeEnabled}
          onRecalculate={() => {
            // Optional: trigger recalculation
            console.log('Recalculate requested');
          }}
        />

        {/* Existing fee entry sections */}
        <div className="space-y-6">
          {/* Government Fees Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Government Fees</h3>
              {autoModeEnabled && feeEngineResult && (
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  Auto-calculated
                </span>
              )}
            </div>

            {/* Fee rows (read-only when auto mode enabled) */}
            {govRows.map((row, index) => (
              <FeeRow
                key={index}
                row={row}
                index={index}
                category="gov"
                readOnly={autoModeEnabled} // Disable editing in auto mode
                onUpdate={updateRow}
                onRemove={removeRow}
              />
            ))}
          </section>

          {/* Dealer Fees (always editable) */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Dealer Fees</h3>
            {dealerRows.map((row, index) => (
              <FeeRow
                key={index}
                row={row}
                index={index}
                category="dealer"
                readOnly={false}
                onUpdate={updateRow}
                onRemove={removeRow}
              />
            ))}
          </section>

          {/* Customer Add-ons (always editable) */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Customer Add-ons</h3>
            {customerRows.map((row, index) => (
              <FeeRow
                key={index}
                row={row}
                index={index}
                category="customer"
                readOnly={false}
                onUpdate={updateRow}
                onRemove={removeRow}
              />
            ))}
          </section>

          {/* Tax Rates */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Tax Rates</h3>
            {autoModeEnabled && feeEngineResult && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                Tax rates auto-detected for {feeEngineResult.detectedScenario.description}
              </p>
            )}
            {/* Tax rate inputs */}
          </section>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};
```

## 3. Auto Mode vs Manual Override

The panel supports two modes:

### Auto Mode (Enabled)
- Government fees are auto-calculated from scenario result
- Fee inputs are read-only (show lock icon or disabled state)
- Tax rates auto-populated from FL DMV rules
- Shows "Auto-calculated" badge

### Manual Override Mode (Disabled)
- User can manually edit all fees
- All inputs are editable
- Shows "Manual Override" indicator
- Tax rates can be changed

## 4. Styling the Read-Only State

Add visual indicators for auto-calculated fees:

```typescript
interface FeeRowProps {
  row: FeeRow;
  index: number;
  category: FeeCategory;
  readOnly?: boolean;
  // ... other props
}

const FeeRow: React.FC<FeeRowProps> = ({ row, readOnly, ...props }) => {
  return (
    <div className={`fee-row ${readOnly ? 'opacity-75' : ''}`}>
      <input
        value={row.description}
        disabled={readOnly}
        className={`${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
        // ... other props
      />
      {readOnly && (
        <LockIcon className="w-4 h-4 text-gray-400" />
      )}
    </div>
  );
};
```

## 5. Complete Integration Example

```typescript
import React, { useState, useEffect } from 'react';
import { Modal, ScenarioDetectionPanel } from '../ui/components';
import { useCalculatorStore } from '../stores/calculatorStore';

export const EnhancedFeesModal: React.FC<FeesModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  // Get fee engine result
  const feeEngineResult = useCalculatorStore((state) => state.feeEngineResult);

  // Auto-mode state
  const [autoModeEnabled, setAutoModeEnabled] = useState(true);

  // Fee rows state
  const [govRows, setGovRows] = useState<FeeRow[]>([]);
  const [dealerRows, setDealerRows] = useState<FeeRow[]>([]);
  const [customerRows, setCustomerRows] = useState<FeeRow[]>([]);

  // Tax rates
  const [stateTax, setStateTax] = useState('');
  const [countyTax, setCountyTax] = useState('');

  // Auto-populate from fee engine result
  useEffect(() => {
    if (feeEngineResult && autoModeEnabled && isOpen) {
      // Government fees
      const govFees = feeEngineResult.lineItems
        .filter(item => item.category === 'government')
        .map(item => ({
          description: item.description,
          amount: formatCurrencyInput(item.amount.toString()),
        }));
      setGovRows(govFees);

      // Tax rates
      setStateTax((feeEngineResult.taxBreakdown.stateTaxRate * 100).toFixed(2));
      setCountyTax((feeEngineResult.taxBreakdown.countyTaxRate * 100).toFixed(2));
    }
  }, [feeEngineResult, autoModeEnabled, isOpen]);

  const handleToggleAutoMode = (enabled: boolean) => {
    setAutoModeEnabled(enabled);
    if (!enabled) {
      // Switching to manual mode - keep current values but make editable
      console.log('Switched to manual override mode');
    }
  };

  const handleSave = () => {
    // Convert rows back to FeeItem format
    const govFees = govRows
      .filter(row => row.description && row.amount)
      .map(row => ({
        description: row.description,
        amount: parseCurrency(row.amount),
      }));

    const dealerFees = dealerRows
      .filter(row => row.description && row.amount)
      .map(row => ({
        description: row.description,
        amount: parseCurrency(row.amount),
      }));

    const customerFees = customerRows
      .filter(row => row.description && row.amount)
      .map(row => ({
        description: row.description,
        amount: parseCurrency(row.amount),
      }));

    onSave({
      dealerFees,
      customerAddons: customerFees,
      govtFees: govFees,
      stateTaxRate: parseFloat(stateTax) / 100,
      countyTaxRate: parseFloat(countyTax) / 100,
      userTaxOverride: !autoModeEnabled,
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Edit Fees & Taxes</h2>

        {/* Scenario Detection Panel */}
        <ScenarioDetectionPanel
          scenarioResult={feeEngineResult}
          autoModeEnabled={autoModeEnabled}
          onToggleAutoMode={handleToggleAutoMode}
        />

        {/* Fee entry sections */}
        {/* ... your existing fee entry UI ... */}

        {/* Save button */}
        <div className="flex gap-3 mt-6">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};
```

## 6. Benefits of This Approach

- **Auto-calculation**: Government fees calculated based on scenario
- **Transparency**: Users see which scenario was detected
- **Flexibility**: Users can still override if needed
- **Tax compliance**: FL-specific tax rules automatically applied
- **Better UX**: Clear indication of auto vs manual mode

## 7. Testing the Integration

1. Open FeesModal with a trade-in scenario
2. Verify ScenarioDetectionPanel shows "Tag transfer from trade-in"
3. Check government fees are auto-populated
4. Toggle to manual override mode
5. Verify fees become editable
6. Save and verify fees are applied to calculator

---

The ScenarioDetectionPanel is now ready to use in your FeesModal!
