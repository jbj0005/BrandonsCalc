import React, { useState, useRef, useEffect } from 'react';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

export interface DropdownProps {
  /** Trigger button content */
  trigger: React.ReactNode;
  /** Dropdown menu items */
  items: DropdownItem[];
  /** Dropdown position */
  position?: 'left' | 'right';
  /** Additional className */
  className?: string;
}

/**
 * Dropdown - Menu dropdown component with items
 *
 * @example
 * <Dropdown
 *   trigger={<Button>Actions</Button>}
 *   items={[
 *     { id: 'edit', label: 'Edit', onClick: handleEdit },
 *     { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
 *   ]}
 * />
 */
export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  position = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on ESC key
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;

    item.onClick?.();
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger */}
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`
            absolute top-full mt-2 w-56 rounded-lg
            bg-white shadow-lg border border-gray-200
            py-1 z-200
            ${position === 'right' ? 'right-0' : 'left-0'}
          `}
          role="menu"
          aria-orientation="vertical"
        >
          {items.map((item, index) => {
            if (item.divider) {
              return (
                <div
                  key={item.id || `divider-${index}`}
                  className="my-1 border-t border-gray-200"
                  role="separator"
                />
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className={`
                  w-full px-4 py-2 text-left text-sm
                  flex items-center gap-3
                  transition-colors duration-150
                  ${
                    item.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : item.danger
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-gray-700 hover:bg-gray-100'
                  }
                  focus:outline-none focus:bg-gray-100
                `}
                role="menuitem"
              >
                {/* Icon */}
                {item.icon && (
                  <span className="flex-shrink-0 w-5 h-5">{item.icon}</span>
                )}

                {/* Label */}
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
