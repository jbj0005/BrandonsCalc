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
  default: 'bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 shadow-sm',
  elevated: 'bg-gradient-to-br from-slate-900 to-slate-950 shadow-ios-elevated border border-white/5',
  outlined: 'bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-white/20 shadow-none',
  glass: 'bg-white/10 backdrop-blur-glass border border-white/20 shadow-ios',
};

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
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
        <div className={`border-b border-white/10 ${paddingClasses[padding]}`}>
          {header}
        </div>
      )}

      {/* Body */}
      <div className={paddingClasses[padding]}>{children}</div>

      {/* Footer */}
      {footer && (
        <div className={`border-t border-white/10 ${paddingClasses[padding]}`}>
          {footer}
        </div>
      )}
    </Component>
  );
};

export default Card;
