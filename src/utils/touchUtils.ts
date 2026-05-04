/**
 * Touch Event Utilities
 * Provides helper functions and hooks for seamless touch & click interactions
 */

export type TouchClickHandler = (event: React.MouseEvent | React.TouchEvent) => void;

/**
 * Unified event handler that works with both touch and click events
 * Automatically prevents double-firing on touch devices
 */
export const createTouchClickHandler = (callback: () => void) => {
  let lastEventTime = 0;
  const delay = 50; // Minimum delay between touch and click events

  const handler = (event: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    
    // Touch event detected
    if ('touches' in event) {
      lastEventTime = now;
      callback();
      return;
    }

    // Click event - only trigger if enough time has passed since last touch
    if (now - lastEventTime > delay) {
      callback();
    }
  };

  return {
    onClick: handler,
    onTouchStart: handler,
  };
};

/**
 * Add touch event listener to element
 * Returns cleanup function
 */
export const addTouchClickListener = (
  element: HTMLElement | null,
  callback: () => void
) => {
  if (!element) return () => {};

  const handler = createTouchClickHandler(callback);
  
  element.addEventListener('click', handler.onClick as EventListener);
  element.addEventListener('touchstart', handler.onTouchStart as EventListener);

  return () => {
    element.removeEventListener('click', handler.onClick as EventListener);
    element.removeEventListener('touchstart', handler.onTouchStart as EventListener);
  };
};

/**
 * Detect if device supports touch
 */
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return (
    ('ontouchstart' in window) ||
    ('onmpointerdown' in window) ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  );
};

/**
 * Get pointer type (touch, mouse, pen)
 */
export const getPointerType = (event: React.PointerEvent): string => {
  return event.pointerType || 'unknown';
};

/**
 * Enable passive event listeners for better scroll performance
 * Call this once on app initialization
 */
export const optimizePassiveEventListeners = () => {
  if (typeof window === 'undefined') return;

  const supportsPassive = (() => {
    let passive = false;
    try {
      const options = Object.defineProperty({}, 'passive', {
        get: () => {
          passive = true;
          return true;
        },
      });
      window.addEventListener('test', () => {}, options);
      window.removeEventListener('test', () => {}, options as any);
    } catch (err) {
      // Passive not supported
    }
    return passive;
  })();

  if (supportsPassive) {
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.addEventListener('touchmove', () => {}, { passive: true });
    document.addEventListener('touchend', () => {}, { passive: true });
  }
};

/**
 * Calculated minimum touch target size in pixels
 * WCAG 2.5.5 recommended minimum is 44x44px
 */
export const MIN_TOUCH_TARGET_SIZE = 48;

/**
 * Prevent zoom on double-tap
 * Useful for input fields and other interactive elements
 */
export const disableDoubleTapZoom = (element: HTMLElement | null) => {
  if (!element) return;

  let lastTouchEnd = 0;

  element.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, false);
};

/**
 * Check if running on mobile device
 */
export const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  const mobileRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  return mobileRegex.test(navigator.userAgent);
};

/**
 * Apply touch-friendly styles to an element
 */
export const applyTouchFriendlyStyles = (element: HTMLElement | null) => {
  if (!element) return;

  element.style.minWidth = `${MIN_TOUCH_TARGET_SIZE}px`;
  element.style.minHeight = `${MIN_TOUCH_TARGET_SIZE}px`;
  element.style.cursor = 'pointer';
  element.style.touchAction = 'manipulation';
};
