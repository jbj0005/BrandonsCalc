import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show loading spinner */
  loading?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Icon element (displayed before text) */
  icon?: React.ReactNode;
  /** Icon element (displayed after text) */
  iconRight?: React.ReactNode;
  /** Button content */
  children: React.ReactNode;
}

const variantClasses = {
  primary: `
    bg-gradient-to-r from-blue-600 to-blue-700
    hover:from-blue-700 hover:to-blue-800
    active:from-blue-800 active:to-blue-900
    text-white shadow-sm
    disabled:from-gray-300 disabled:to-gray-400
  `,
  secondary: `
    bg-gradient-to-r from-yellow-400 to-yellow-500
    hover:from-yellow-500 hover:to-yellow-600
    active:from-yellow-600 active:to-yellow-700
    text-gray-900 shadow-sm
    disabled:from-gray-200 disabled:to-gray-300
  `,
  outline: `
    bg-transparent border-2 border-blue-600
    hover:bg-blue-50 active:bg-blue-100
    text-blue-600
    disabled:border-gray-300 disabled:text-gray-400
  `,
  ghost: `
    bg-transparent hover:bg-gray-100 active:bg-gray-200
    text-gray-700
    disabled:text-gray-400
  `,
  danger: `
    bg-gradient-to-r from-red-500 to-red-600
    hover:from-red-600 hover:to-red-700
    active:from-red-700 active:to-red-800
    text-white shadow-sm
    disabled:from-gray-300 disabled:to-gray-400
  `,
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  iconRight,
  children,
  disabled,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2
        font-medium rounded-lg
        transition-all duration-200
        disabled:cursor-not-allowed disabled:opacity-60
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        active:scale-[0.98]
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
      {!loading && iconRight && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  );
};

export default Button;
