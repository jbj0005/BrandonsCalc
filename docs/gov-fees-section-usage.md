# GovFeesSection Component Usage

A beautiful, modern government fees section with auto-calculate mode.

## Features

- ✅ **Clean Toggle** - Pill-style Auto/Manual toggle (no wordy explanation needed)
- ✅ **Auto-lock Indicator** - Small lock icon shows which fees are auto-calculated
- ✅ **Smart Layout** - Fees display differently based on mode
- ✅ **Helper Text** - Optional info badge only shown when relevant
- ✅ **Modern Design** - Smooth transitions and visual feedback

## Quick Integration

Replace your existing government fees section with:

```tsx
import { GovFeesSection } from '../ui/components';
import { useCalculatorStore } from '../stores/calculatorStore';

function FeesModal() {
  const [autoModeEnabled, setAutoModeEnabled] = useState(true);
  const [govRows, setGovRows] = useState<Array<{description: string; amount: string}>>([]);
  const feeEngineResult = useCalculatorStore(state => state.feeEngineResult);

  // Auto-populate from fee engine
  useEffect(() => {
    if (feeEngineResult && autoModeEnabled) {
      const fees = feeEngineResult.lineItems
        .filter(item => item.category === 'government')
        .map(item => ({
          description: item.description,
          amount: item.amount.toString(),
        }));
      setGovRows(fees);
    }
  }, [feeEngineResult, autoModeEnabled]);

  // Calculate total
  const govTotal = govRows.reduce((sum, row) => {
    return sum + parseFloat(row.amount || '0');
  }, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 space-y-6">
        {/* Government Fees Section */}
        <GovFeesSection
          fees={govRows}
          autoModeEnabled={autoModeEnabled}
          onToggleAutoMode={setAutoModeEnabled}
          onViewAssumptions={() => {
            // Open scenario details panel
            setShowScenarioDetails(true);
          }}
          onAddFee={() => {
            setGovRows([...govRows, { description: '', amount: '0' }]);
          }}
          onRemoveFee={(index) => {
            setGovRows(govRows.filter((_, i) => i !== index));
          }}
          onUpdateFee={(index, field, value) => {
            const updated = [...govRows];
            updated[index] = { ...updated[index], [field]: value };
            setGovRows(updated);
          }}
          total={govTotal}
        />

        {/* Your other fee sections */}
      </div>
    </Modal>
  );
}
```

## Visual States

### Auto Mode (Default)
```
┌─────────────────────────────────────────────────────┐
│ Government Fees              [View Details]         │
│                              ┌─────┬────────┐       │
│                              │ Auto│ Manual │       │
│                              └─────┴────────┘       │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐     │
│ │ Title Transfer            $75.25  🔒        │     │
│ └─────────────────────────────────────────────┘     │
│ ┌─────────────────────────────────────────────┐     │
│ │ Registration Transfer     $4.60   🔒        │     │
│ └─────────────────────────────────────────────┘     │
│ ┌─────────────────────────────────────────────┐     │
│ │ Lien Filing Fee           $2.00   🔒        │     │
│ └─────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────┤
│ TOTAL                                    $81.85     │
├─────────────────────────────────────────────────────┤
│ ℹ️ Auto-calculated based on your location          │
│   and transaction type. Switch to Manual to edit.  │
└─────────────────────────────────────────────────────┘
```

### Manual Mode
```
┌─────────────────────────────────────────────────────┐
│ Government Fees                                     │
│                              ┌─────┬────────┐       │
│                              │ Auto│ Manual │       │
│                              └─────┴────────┘       │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐     │
│ │ [Title Transfer          ] $75.25  ✕        │     │
│ └─────────────────────────────────────────────┘     │
│ ┌─────────────────────────────────────────────┐     │
│ │ [Registration Transfer   ] $4.60   ✕        │     │
│ └─────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────┐      │
│ │           + Add Fee                        │      │
│ └────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────┤
│ TOTAL                                    $79.85     │
└─────────────────────────────────────────────────────┘
```

### Empty State (Auto Mode)
```
┌─────────────────────────────────────────────────────┐
│ Government Fees              [View Details]         │
│                              ┌─────┬────────┐       │
│                              │ Auto│ Manual │       │
│                              └─────┴────────┘       │
├─────────────────────────────────────────────────────┤
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐        │
│                                                     │
│ │   Add your location to auto-calculate fees  │    │
│                                                     │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘        │
├─────────────────────────────────────────────────────┤
│ TOTAL                                     $0.00     │
└─────────────────────────────────────────────────────┘
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `fees` | `Array<{description: string, amount: string}>` | Fee items to display |
| `autoModeEnabled` | `boolean` | Whether auto-calculate mode is enabled |
| `onToggleAutoMode` | `(enabled: boolean) => void` | Toggle callback |
| `onViewAssumptions` | `() => void` | Optional - Show scenario details |
| `onAddFee` | `() => void` | Optional - Add new fee (manual mode) |
| `onRemoveFee` | `(index: number) => void` | Optional - Remove fee (manual mode) |
| `onUpdateFee` | `(index, field, value) => void` | Optional - Update fee (manual mode) |
| `total` | `number` | Total of all fees |

## Design Improvements

### Before (Your Screenshot)
- ❌ Wordy explanation text
- ❌ Confusing "View Purchase Assumptions" placement
- ❌ Generic toggle without clear labels
- ❌ No visual distinction between auto/manual
- ❌ Empty state just shows "$0"

### After (New Component)
- ✅ Clean pill toggle with "Auto" and "Manual" labels
- ✅ "View Details" link only shown when relevant
- ✅ Lock icons show auto-calculated fees
- ✅ Blue tint on auto-calculated fee rows
- ✅ Helper text only shows when needed
- ✅ Empty state guides user action
- ✅ Smooth transitions and hover states

## Color Scheme

**Auto Mode:**
- Background: Blue tint (`bg-blue-50/50 dark:bg-blue-950/20`)
- Border: Blue (`border-blue-100 dark:border-blue-900/30`)
- Toggle: Blue active state
- Lock icon: Blue

**Manual Mode:**
- Background: White/Dark gray
- Border: Gray
- Toggle: Dark active state
- Remove icon: Red

## Example Integration with ScenarioDetectionPanel

```tsx
function EnhancedFeesModal() {
  const [showScenarioDetails, setShowScenarioDetails] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 space-y-6">
        {/* Scenario Details Panel (modal/drawer) */}
        {showScenarioDetails && (
          <ScenarioDetectionPanel
            scenarioResult={feeEngineResult}
            onRecalculate={recalculateFees}
          />
        )}

        {/* Government Fees Section */}
        <GovFeesSection
          fees={govRows}
          autoModeEnabled={autoModeEnabled}
          onToggleAutoMode={setAutoModeEnabled}
          onViewAssumptions={() => setShowScenarioDetails(true)}
          // ... other props
        />

        {/* Other fee sections */}
      </div>
    </Modal>
  );
}
```

## Tips

1. **Start with Auto Mode** - Default to `autoModeEnabled={true}` for best UX
2. **Hide "View Details"** - Only show when `feeEngineResult` exists
3. **Preserve Manual Edits** - When switching back to auto, ask user to confirm
4. **Show Loading State** - Pass `isCalculating` state to disable toggle during calculation
5. **Empty State CTA** - Guide users to add location or switch to manual

---

This component provides a much cleaner and more intuitive UI for government fees! 🎨
