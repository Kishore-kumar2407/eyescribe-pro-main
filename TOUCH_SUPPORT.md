# Touch & Click Support Guide

This document explains how to use the touch and click event handlers added to support both Android/mobile (finger touch) and laptop (mouse cursor) interactions.

## Files Added

1. **`src/hooks/useTouchClick.ts`** - Basic touch/click hook
2. **`src/hooks/useElementTouchSupport.ts`** - Advanced touch support hooks
3. **`src/utils/touchUtils.ts`** - Utility functions for touch handling
4. **`src/index.css`** - Enhanced CSS with touch-friendly styles

## Quick Start

### Option 1: Use CSS Classes (No Code Changes)
The CSS already includes touch-friendly styles for all buttons and interactive elements. Your existing code automatically supports:
- ✅ Minimum touch target sizes (48x48px)
- ✅ Touch feedback and visual feedback
- ✅ Smooth scrolling on touch devices
- ✅ Optimized hover and active states
- ✅ Double-tap zoom prevention on inputs

**No changes needed - it works out of the box!**

### Option 2: Use Hooks in Your Components

#### Basic Touch + Click Handler
```tsx
import { useTouchClick } from './hooks/useTouchClick';

function MyButton() {
  const handlers = useTouchClick(() => {
    console.log('Button clicked or tapped!');
  });

  return <button {...handlers}>Click or Tap Me</button>;
}
```

#### Unified Input Handler
```tsx
import { useUnifiedInput } from './hooks/useElementTouchSupport';

function InteractiveElement() {
  const handlers = useUnifiedInput((isTouchEvent) => {
    if (isTouchEvent) {
      console.log('Touch detected');
    } else {
      console.log('Mouse click detected');
    }
  });

  return <div {...handlers} role="button">Tap or Click</div>;
}
```

#### Element-Based Touch Support
```tsx
import { useRef } from 'react';
import { useElementTouchClick } from './hooks/useElementTouchSupport';

function MyIcon() {
  const ref = useRef<HTMLDivElement>(null);
  
  useElementTouchClick(ref, () => {
    console.log('Icon tapped!');
  });

  return <div ref={ref}>📱</div>;
}
```

### Option 3: Use Utility Functions

```tsx
import { createTouchClickHandler, isTouchDevice } from './utils/touchUtils';

function MyComponent() {
  const handlers = createTouchClickHandler(() => {
    console.log('Activated!');
  });

  return (
    <button {...handlers}>
      {isTouchDevice() ? '👆 Tap' : '🖱️ Click'}
    </button>
  );
}
```

## Features

### 1. **Automatic Touch Optimization** ✅
- Passive event listeners for better scrolling performance
- Prevents double-firing on touch devices
- Optimized pointer handling

### 2. **Touch-Friendly Styling** ✅
- Minimum 48x48px touch targets (WCAG 2.5.5 compliant)
- Touch feedback with visual ripple effects
- Better hover and active states
- Smooth scrolling on mobile

### 3. **Responsive to Device Type** ✅
- Auto-detects touch vs mouse devices
- Different behavior for hover-capable vs touch-only devices
- Pointer-based events support (mouse, touch, pen)

### 4. **Performance Optimized** ✅
- Passive event listeners reduce jank
- Efficient event delegation
- No double-triggering on mixed devices

## CSS Classes Available

```css
/* Auto-applied to all buttons and interactive elements */
button, [role="button"], a, input[type="button"] {
  min-height: 48px;
  min-width: 48px;
  cursor: pointer;
  touch-action: manipulation;
}

/* Touch device specific */
@media (hover: none) and (pointer: coarse) {
  /* Pressed/active state for touch */
  button:active { opacity: 0.8; transform: scale(0.98); }
}

/* Mouse device specific */
@media (hover: hover) and (pointer: fine) {
  /* Hover state for mouse */
  button:hover { opacity: 0.9; }
}
```

## Utility Functions

### `isTouchDevice()`
Check if the device supports touch:
```tsx
if (isTouchDevice()) {
  console.log('This is a touch device');
}
```

### `isMobileDevice()`
Check if running on a mobile device:
```tsx
if (isMobileDevice()) {
  console.log('Running on mobile');
}
```

### `createTouchClickHandler(callback)`
Create a unified handler for both touch and click:
```tsx
const handlers = createTouchClickHandler(() => {
  handleAction();
});
<button {...handlers}>Action</button>
```

### `optimizePassiveEventListeners()`
Enable passive event listeners globally (call once):
```tsx
import { optimizePassiveEventListeners } from './utils/touchUtils';

// In your App component or main.tsx
useEffect(() => {
  optimizePassiveEventListeners();
}, []);
```

## Browser Support

- ✅ Chrome/Edge (desktop & mobile)
- ✅ Firefox (desktop & mobile)
- ✅ Safari (desktop & mobile)
- ✅ Opera
- ✅ IE 11+ (basic support)

## Best Practices

1. **Use CSS when possible** - Don't add extra code if CSS styles work
2. **Minimum touch targets** - Ensure buttons are at least 48x48px
3. **Clear feedback** - Provide visual feedback for touch/click
4. **Test on real devices** - Test on actual phones and tablets
5. **No double handlers** - Don't add both click and touch handlers unless necessary

## Examples in Your App

The following components in your app automatically support touch:
- ✅ SetupWizard buttons (SKIP, NEXT, DONE)
- ✅ Login buttons
- ✅ Navigation buttons
- ✅ All lucide-react icons
- ✅ Custom phrase buttons
- ✅ Keyboard buttons
- ✅ Settings controls

No changes needed - they all work with finger touch on Android and mouse on laptop!

## Advanced: Custom Implementation

If you need custom behavior:

```tsx
import { useUnifiedInput } from './hooks/useElementTouchSupport';
import { getPointerType } from './utils/touchUtils';

function AdvancedButton() {
  const handlers = useUnifiedInput((isTouchEvent) => {
    if (isTouchEvent) {
      // Touch-specific logic
      playTouchSound();
    } else {
      // Mouse-specific logic
      showHoverMenu();
    }
  });

  return <button {...handlers}>Advanced Button</button>;
}
```

## Troubleshooting

### Button not responding to touch
- Check if button has `onClick` handler
- Ensure button is not styled with `pointer-events: none`
- Verify minimum size is at least 44x44px

### Double-firing on some devices
- Use `createTouchClickHandler()` instead of separate onClick/onTouchStart
- Check for duplicate event listeners

### Slow scrolling on mobile
- Call `optimizePassiveEventListeners()` on app load
- Ensure scroll containers have `-webkit-overflow-scrolling: touch`

## Questions?

All existing code works without modification. Touch support has been added globally through CSS and is available via optional hooks when needed.
