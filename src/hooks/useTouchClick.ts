import { useCallback } from 'react';

/**
 * Custom hook to handle both touch and click events seamlessly
 * Prevents double-triggering on touch devices that have both touch and mouse events
 * Usage: const handlers = useTouchClick(onClickCallback);
 *        <button {...handlers}>Click me</button>
 */
export const useTouchClick = (callback: () => void) => {
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Prevent mouse events from firing after touch
    e.preventDefault();
    callback();
  }, [callback]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Only trigger on actual mouse/pointer events, not simulated ones from touch
    if (!('ontouchstart' in window) || e.pointerType === 'mouse') {
      callback();
    }
  }, [callback]);

  return {
    onTouchStart: handleTouchStart,
    onClick: handleClick,
  };
};

/**
 * Global touch event listener for passive event handling
 * Improves scrolling performance on touch devices
 */
export const enableTouchOptimization = () => {
  if (typeof window !== 'undefined') {
    // Add passive event listeners to improve scrolling performance
    const supportsPassive = (() => {
      let passive = false;
      try {
        const opts = Object.defineProperty({}, 'passive', {
          get: () => {
            passive = true;
            return true;
          },
        });
        window.addEventListener('test', () => null, opts);
        window.removeEventListener('test', () => null, opts as EventListenerOptions);
      } catch (err) {}
      return passive;
    })();

    if (supportsPassive) {
      document.addEventListener('touchstart', () => {}, { passive: true });
      document.addEventListener('touchmove', () => {}, { passive: true });
    }
  }
};
