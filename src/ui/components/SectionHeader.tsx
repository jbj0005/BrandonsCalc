import React from 'react';

export interface SectionHeaderProps {
  /** Main title text */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Tone controls text colors for light/dark surfaces */
  tone?: 'light' | 'dark';
  /** Accent color for the gradient bar */
  accent?: 'blue' | 'emerald';
  /** Size variant */
  size?: 'lg' | 'md';
  /** Optional wrapper class */
  className?: string;
  /** Heading element */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'div';
}

/**
 * SectionHeader - standardized heading with accent bar and subtitle.
 * Keeps typography consistent across cards/modals.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  tone = 'dark',
  accent = 'blue',
  size = 'lg',
  className = '',
  as: Component = 'h2',
}) => {
  const accentClasses =
    accent === 'emerald'
      ? 'bg-gradient-to-b from-emerald-400 to-blue-500'
      : 'bg-gradient-to-b from-blue-400 to-cyan-500';

  const titleClasses =
    size === 'lg'
      ? 'text-2xl font-bold'
      : 'text-lg font-semibold';

  const subtitleClasses =
    size === 'lg'
      ? 'text-sm'
      : 'text-xs';

  const textColor = tone === 'light' ? 'text-white' : 'text-gray-900';
  const subtitleColor = tone === 'light' ? 'text-white/60' : 'text-gray-600';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`w-1 h-10 ${accentClasses} rounded-full`} />
      <div>
        <Component
          className={`${titleClasses} ${textColor}`}
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
        >
          {title}
        </Component>
        {subtitle && (
          <p className={`${subtitleClasses} ${subtitleColor}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

export default SectionHeader;
