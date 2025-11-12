import React, { useState, useRef, useEffect } from 'react';

export interface TooltipProps {
  /** Tooltip content */
  content: string | React.ReactNode;
  /** Element to attach tooltip to */
  children: React.ReactElement;
  /** Tooltip position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) */
  delay?: number;
  /** Additional className */
  className?: string;
}

/**
 * Tooltip - Hover tooltip component
 *
 * @example
 * <Tooltip content="This is a helpful hint" position="top">
 *   <Button>Hover me</Button>
 * </Tooltip>
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 200,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Calculate tooltip position
  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = -tooltipRect.height - 8;
        left = (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.height + 8;
        left = (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = (triggerRect.height - tooltipRect.height) / 2;
        left = -tooltipRect.width - 8;
        break;
      case 'right':
        top = (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.width + 8;
        break;
    }

    setTooltipStyle({
      top: `${top}px`,
      left: `${left}px`,
    });
  }, [isVisible, position]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    const timer = timeoutRef.current;
    if (timer) {
      clearTimeout(timer);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      const timer = timeoutRef.current;
      if (timer) {
        clearTimeout(timer);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Arrow position classes
  const arrowClasses = {
    top: 'bottom-[-4px] left-1/2 -translate-x-1/2 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'top-[-4px] left-1/2 -translate-x-1/2 border-b-gray-900 border-l-transparent border-r-transparent border-t-transparent',
    left: 'right-[-4px] top-1/2 -translate-y-1/2 border-l-gray-900 border-t-transparent border-b-transparent border-r-transparent',
    right: 'left-[-4px] top-1/2 -translate-y-1/2 border-r-gray-900 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger element */}
      {children}

      {/* Tooltip */}
      {isVisible && (
        <div
          ref={tooltipRef}
          className="absolute z-400 pointer-events-none"
          style={tooltipStyle}
          role="tooltip"
        >
          <div className="relative bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg max-w-xs">
            {content}

            {/* Arrow */}
            <div
              className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;
