/**
 * Touch Support Initialization Module
 * Import and call this in your main.tsx or app entry point to enable global touch optimizations
 * 
 * Usage in main.tsx:
 * import { initializeTouchSupport } from './touch-support-init';
 * initializeTouchSupport();
 */

import { optimizePassiveEventListeners, isTouchDevice, isMobileDevice } from './utils/touchUtils';

/**
 * Initialize all touch support features
 * Call this once when your app loads
 */
export const initializeTouchSupport = () => {
  if (typeof window === 'undefined') return;

  console.log('[TouchSupport] Initializing...');

  // Step 1: Optimize event listeners
  optimizePassiveEventListeners();
  console.log('[TouchSupport] Passive event listeners optimized');

  // Step 2: Add device info to document
  const root = document.documentElement;
  if (isTouchDevice()) {
    root.classList.add('is-touch-device');
    console.log('[TouchSupport] Touch device detected');
  } else {
    root.classList.add('is-mouse-device');
    console.log('[TouchSupport] Mouse/pointer device detected');
  }

  if (isMobileDevice()) {
    root.classList.add('is-mobile-device');
    console.log('[TouchSupport] Mobile device detected');
  }

  // Step 3: Prevent zoom on double-tap for inputs
  setupDoubleTabZoomPrevention();

  // Step 4: Add touch feedback visual effects
  setupTouchFeedback();

  console.log('[TouchSupport] Initialization complete!');
};

/**
 * Prevent double-tap zoom on input fields
 */
const setupDoubleTabZoomPrevention = () => {
  let lastTouchEnd = 0;

  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        // Check if the touched element is an input or contenteditable
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true'
        ) {
          event.preventDefault();
        }
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
};

/**
 * Add visual touch feedback
 */
const setupTouchFeedback = () => {
  // Add touch indicator on screen for debugging (optional)
  const touchPoints = new Set<string>();

  document.addEventListener('touchstart', (event) => {
    Array.from(event.touches).forEach((touch) => {
      touchPoints.add(`${touch.identifier}`);
    });

    // Optional: Log touch points for debugging
    if (process.env.NODE_ENV === 'development') {
      // Uncomment to see touch points in console
      // console.log(`[TouchFeedback] Active touches: ${touchPoints.size}`);
    }
  });

  document.addEventListener('touchend', (event) => {
    Array.from(event.changedTouches).forEach((touch) => {
      touchPoints.delete(`${touch.identifier}`);
    });
  });

  document.addEventListener('touchcancel', (event) => {
    Array.from(event.changedTouches).forEach((touch) => {
      touchPoints.delete(`${touch.identifier}`);
    });
  });
};

/**
 * Enable debug mode (shows touch events in console)
 * Useful for development and testing
 */
export const enableTouchDebugMode = () => {
  if (typeof window === 'undefined') return;

  console.log('[TouchDebug] Enabled - All touch events will be logged');

  document.addEventListener('touchstart', (e) => {
    console.log(`[Touch] START - ${e.touches.length} touches`);
  });

  document.addEventListener('touchmove', (e) => {
    console.log(`[Touch] MOVE - ${e.touches.length} touches`);
  });

  document.addEventListener('touchend', (e) => {
    console.log(`[Touch] END - ${e.changedTouches.length} changed touches`);
  });

  document.addEventListener('touchcancel', (e) => {
    console.log(`[Touch] CANCEL - ${e.changedTouches.length} changed touches`);
  });

  document.addEventListener('click', (e) => {
    console.log('[Click] detected', e.target);
  });

  document.addEventListener('pointerdown', (e) => {
    console.log(
      `[Pointer] DOWN - Type: ${e.pointerType}, ID: ${e.pointerId}`
    );
  });
};

/**
 * Check if device supports specific features
 */
export const checkTouchCapabilities = () => {
  const capabilities = {
    touchSupport: 'ontouchstart' in window,
    pointerEvents: 'PointerEvent' in window,
    msPointerEvents: 'MSPointerEvent' in window,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    touchActionSupport: CSS.supports('touch-action', 'manipulation'),
    passiveEventListenerSupport: (() => {
      let support = false;
      try {
        const opts = Object.defineProperty({}, 'passive', {
          get: () => {
            support = true;
          },
        });
        window.addEventListener('test', () => null, opts);
        window.removeEventListener('test', () => null, opts as any);
      } catch (e) {}
      return support;
    })(),
  };

  console.log('[TouchCapabilities]', capabilities);
  return capabilities;
};

export default initializeTouchSupport;
