import { useEffect, useRef } from 'react';
import { addTouchClickListener, optimizePassiveEventListeners } from '../utils/touchUtils';

/**
 * Hook to add touch support to an element
 * Usage: const ref = useRef<HTMLButtonElement>(null);
 *        useElementTouchClick(ref, handleClick);
 *        <button ref={ref}>Click me</button>
 */
export const useElementTouchClick = (
  ref: React.RefObject<HTMLElement>,
  callback: () => void
) => {
  useEffect(() => {
    if (!ref.current) return;

    const cleanup = addTouchClickListener(ref.current, callback);
    return cleanup;
  }, [callback]);
};

/**
 * Hook to initialize touch optimizations globally
 * Call once in your main App component
 */
export const useTouchOptimization = () => {
  useEffect(() => {
    optimizePassiveEventListeners();
  }, []);
};

/**
 * Advanced hook for handling both touch and mouse events with full control
 * Returns both the handler and whether the last event was a touch event
 */
export const useUnifiedInput = (callback: (isTouchEvent: boolean) => void) => {
  const lastEventTimeRef = useRef(0);
  const lastEventTypeRef = useRef<'touch' | 'mouse' | null>(null);

  const handleEvent = (event: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const isTouchEvent = 'touches' in event;

    // If same event type fires twice quickly, ignore the second one
    if (lastEventTypeRef.current === (isTouchEvent ? 'touch' : 'mouse')) {
      if (now - lastEventTimeRef.current < 50) {
        return;
      }
    }

    lastEventTimeRef.current = now;
    lastEventTypeRef.current = isTouchEvent ? 'touch' : 'mouse';

    callback(isTouchEvent);
  };

  return {
    onClick: handleEvent,
    onTouchStart: handleEvent,
  };
};

/**
 * Hook to detect device type
 * Returns the type of input device (touch, mouse, pen, etc.)
 */
export const usePointerType = () => {
  const pointerTypeRef = useRef<string | null>(null);

  const handlePointerEvent = (event: React.PointerEvent) => {
    pointerTypeRef.current = event.pointerType;
  };

  return {
    onPointerDown: handlePointerEvent,
    pointerType: pointerTypeRef.current,
  };
};
