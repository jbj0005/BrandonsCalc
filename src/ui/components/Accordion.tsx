import React, { useState } from 'react';

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface AccordionProps {
  /** Accordion items */
  items: AccordionItem[];
  /** Allow multiple items to be open at once */
  allowMultiple?: boolean;
  /** Initially expanded item IDs */
  defaultExpanded?: string[];
  /** Controlled expanded item IDs */
  expanded?: string[];
  /** Change handler for controlled mode */
  onChange?: (expandedIds: string[]) => void;
  /** Visual variant */
  variant?: 'default' | 'bordered' | 'separated';
  /** Additional className */
  className?: string;
}

/**
 * Accordion - Collapsible content panels
 *
 * @example
 * <Accordion
 *   items={[
 *     { id: '1', title: 'Panel 1', content: <div>Content 1</div> },
 *     { id: '2', title: 'Panel 2', content: <div>Content 2</div> },
 *   ]}
 *   allowMultiple
 * />
 */
export const Accordion: React.FC<AccordionProps> = ({
  items,
  allowMultiple = false,
  defaultExpanded = [],
  expanded: controlledExpanded,
  onChange,
  variant = 'default',
  className = '',
}) => {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState<string[]>(defaultExpanded);

  // Determine if controlled or uncontrolled
  const isControlled = controlledExpanded !== undefined;
  const expandedIds = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = (itemId: string) => {
    const isExpanded = expandedIds.includes(itemId);
    let newExpandedIds: string[];

    if (allowMultiple) {
      // Toggle the clicked item
      newExpandedIds = isExpanded
        ? expandedIds.filter((id) => id !== itemId)
        : [...expandedIds, itemId];
    } else {
      // Only one item can be open at a time
      newExpandedIds = isExpanded ? [] : [itemId];
    }

    if (isControlled && onChange) {
      onChange(newExpandedIds);
    } else {
      setInternalExpanded(newExpandedIds);
    }
  };

  // Variant styles for container
  const containerVariantClasses = {
    default: 'divide-y divide-gray-200',
    bordered: 'border border-gray-200 rounded-lg divide-y divide-gray-200',
    separated: 'space-y-2',
  };

  // Variant styles for items
  const itemVariantClasses = {
    default: '',
    bordered: '',
    separated: 'border border-gray-200 rounded-lg overflow-hidden',
  };

  // ChevronDown icon
  const ChevronIcon: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => (
    <svg
      className={`w-5 h-5 transition-transform duration-200 ${
        isExpanded ? 'transform rotate-180' : ''
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  return (
    <div className={`${containerVariantClasses[variant]} ${className}`}>
      {items.map((item) => {
        const isExpanded = expandedIds.includes(item.id);
        const isDisabled = item.disabled;

        return (
          <div key={item.id} className={itemVariantClasses[variant]}>
            {/* Accordion Header */}
            <button
              type="button"
              onClick={() => !isDisabled && handleToggle(item.id)}
              disabled={isDisabled}
              className={`
                w-full flex items-center justify-between
                px-4 py-4 text-left
                font-medium text-gray-900
                transition-colors duration-150
                ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-50 cursor-pointer'
                }
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset
              `}
              aria-expanded={isExpanded}
              aria-controls={`accordion-content-${item.id}`}
            >
              <div className="flex items-center gap-3">
                {item.icon && (
                  <span className="flex-shrink-0 w-5 h-5 text-gray-500">
                    {item.icon}
                  </span>
                )}
                <span>{item.title}</span>
              </div>
              <ChevronIcon isExpanded={isExpanded} />
            </button>

            {/* Accordion Content */}
            <div
              id={`accordion-content-${item.id}`}
              className={`
                overflow-hidden transition-all duration-200 ease-in-out
                ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
              `}
              aria-hidden={!isExpanded}
            >
              <div className="px-4 py-4 text-gray-700 bg-gray-50">
                {item.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Accordion;
