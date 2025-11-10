import React from 'react';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Optional header content */
  header?: React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Visual variant */
  variant?: 'default' | 'elevated' | 'outlined' | 'glass';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Make card clickable */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Hover effect */
  hoverable?: boolean;
}

const variantClasses = {
  default: 'bg-white border border-gray-200 shadow-sm',
  elevated: 'bg-white shadow-ios-elevated border-0',
  outlined: 'bg-white border-2 border-gray-300 shadow-none',
  glass: 'bg-white/10 backdrop-blur-glass border border-white/20 shadow-ios',
};

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const hoverClasses = 'hover:shadow-ios-elevated hover:-translate-y-0.5 transition-all duration-200';

export const Card: React.FC<CardProps> = ({
  children,
  header,
  footer,
  variant = 'default',
  padding = 'md',
  onClick,
  className = '',
  hoverable = false,
}) => {
  const isClickable = !!onClick;
  const showHover = hoverable || isClickable;

  const Component = isClickable ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        rounded-2xl overflow-hidden
        ${variantClasses[variant]}
        ${showHover ? hoverClasses : ''}
        ${isClickable ? 'cursor-pointer active:scale-[0.98]' : ''}
        ${className}
      `}
      type={isClickable ? 'button' : undefined}
    >
      {/* Header */}
      {header && (
        <div className={`border-b border-gray-100 ${paddingClasses[padding]}`}>
          {header}
        </div>
      )}

      {/* Body */}
      <div className={paddingClasses[padding]}>{children}</div>

      {/* Footer */}
      {footer && (
        <div className={`border-t border-gray-100 ${paddingClasses[padding]}`}>
          {footer}
        </div>
      )}
    </Component>
  );
};

export default Card;
