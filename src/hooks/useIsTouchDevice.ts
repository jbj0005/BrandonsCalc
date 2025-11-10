/**
 * useIsTouchDevice Hook
 *
 * React hook that returns whether the current device has touch capability.
 * Updates on window resize and orientation change for hybrid devices.
 */

import { useState, useEffect } from 'react';
import { isTouchDevice } from '../utils/detectTouch';

/**
 * Hook to detect if the current device is a touch device
 *
 * Returns a boolean that updates when the device capabilities change
 * (e.g., when connecting/disconnecting a mouse on a tablet).
 *
 * @returns true if device supports touch input
 *
 * @example
 * const isTouchDevice = useIsTouchDevice();
 *
 * return (
 *   <button
 *     onClick={handleClick}
 *     onMouseEnter={isTouchDevice ? undefined : handleHover}
 *   >
 *     Hover me
 *   </button>
 * );
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => isTouchDevice());

  useEffect(() => {
    // Re-check on resize and orientation change
    // Handles hybrid devices (tablets with keyboard/mouse)
    const handleChange = () => {
      setIsTouch(isTouchDevice());
    };

    window.addEventListener('resize', handleChange);
    window.addEventListener('orientationchange', handleChange);

    // Initial check
    handleChange();

    return () => {
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('orientationchange', handleChange);
    };
  }, []);

  return isTouch;
}

export default useIsTouchDevice;
