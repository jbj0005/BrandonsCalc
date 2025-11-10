import React, { useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: string | number;
}

export interface TabsProps {
  /** Array of tab items */
  tabs: TabItem[];
  /** Default active tab ID */
  defaultActiveTab?: string;
  /** Controlled active tab ID */
  activeTab?: string;
  /** On tab change handler */
  onChange?: (tabId: string) => void;
  /** Tab variant */
  variant?: 'line' | 'pills' | 'enclosed';
  /** Full width tabs */
  fullWidth?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Tabs - Tabbed navigation component for organizing content
 *
 * @example
 * <Tabs
 *   tabs={[
 *     { id: 'profile', label: 'Profile', content: <ProfileForm /> },
 *     { id: 'settings', label: 'Settings', content: <SettingsPanel /> },
 *   ]}
 *   variant="line"
 * />
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultActiveTab,
  activeTab: controlledActiveTab,
  onChange,
  variant = 'line',
  fullWidth = false,
  className = '',
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState(
    defaultActiveTab || tabs[0]?.id || ''
  );

  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (disabled) return;

    setInternalActiveTab(tabId);
    onChange?.(tabId);
  };

  const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className={`w-full ${className}`}>
      {/* Tab List */}
      <div
        className={`flex ${
          variant === 'enclosed' ? 'border-b border-gray-200' : ''
        } ${fullWidth ? 'w-full' : ''}`}
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          const isDisabled = tab.disabled;

          // Line variant styles
          const lineStyles = isActive
            ? 'border-b-2 border-blue-500 text-blue-600'
            : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';

          // Pills variant styles
          const pillsStyles = isActive
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200';

          // Enclosed variant styles
          const enclosedStyles = isActive
            ? 'border-t-2 border-l-2 border-r-2 border-gray-200 border-b-2 border-b-white -mb-px bg-white text-blue-600'
            : 'border border-transparent text-gray-500 hover:text-gray-700';

          const variantStyles = {
            line: lineStyles,
            pills: pillsStyles,
            enclosed: enclosedStyles,
          };

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              aria-disabled={isDisabled}
              onClick={() => handleTabClick(tab.id, isDisabled)}
              disabled={isDisabled}
              className={`
                ${fullWidth ? 'flex-1' : ''}
                px-4 py-2.5 font-medium text-sm
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${variant === 'pills' ? 'rounded-lg' : ''}
                ${variant === 'enclosed' && index === 0 ? 'rounded-tl-lg' : ''}
                ${variant === 'enclosed' && index === tabs.length - 1 ? 'rounded-tr-lg' : ''}
                ${variantStyles[variant]}
                ${variant !== 'pills' ? 'mr-1' : 'mr-2'}
                flex items-center justify-center gap-2
              `}
            >
              {/* Icon */}
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}

              {/* Label */}
              <span>{tab.label}</span>

              {/* Badge */}
              {tab.badge !== undefined && (
                <span
                  className={`
                    inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
                    ${
                      isActive
                        ? variant === 'pills'
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-100 text-blue-600'
                        : 'bg-gray-200 text-gray-600'
                    }
                  `}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className={`mt-4 ${variant === 'enclosed' ? 'p-4 border border-gray-200 rounded-b-lg' : ''}`}
      >
        {activeTabContent}
      </div>
    </div>
  );
};

export default Tabs;
