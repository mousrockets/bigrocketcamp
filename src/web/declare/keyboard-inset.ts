import { useEffect, useState } from 'react';

// On iOS the on-screen keyboard covers the bottom of the page instead of shrinking it: a sheet fixed to the
// bottom of the screen ends up under the keyboard. The visual viewport tells what is still visible.

export type KeyboardInset = {
  /** How far above the bottom of the layout viewport the visible part ends. */
  bottom: number;
  /** Height still visible above the keyboard. */
  height: number;
};

type Viewport = { innerHeight: number; height: number; offsetTop: number; scale: number };

/** Below this, the gap is a browser bar or rounding, not a keyboard. */
const keyboardMin = 120;

export function keyboardInsetOf({ innerHeight, height, offsetTop, scale }: Viewport): KeyboardInset | null {
  // A pinch zoom also shrinks the visual viewport; it is not a keyboard.
  if (scale > 1.01) return null;
  // The keyboard shrinks the visible part; iOS may also scroll the page to show the field, which moves
  // the visible part up and leaves less of the keyboard below a fixed element.
  if (innerHeight - height < keyboardMin) return null;
  return { bottom: Math.max(0, Math.round(innerHeight - height - offsetTop)), height: Math.round(height) };
}

/** What the on-screen keyboard hides while `active`, or null when no keyboard is open. */
export function useKeyboardInset(active: boolean): KeyboardInset | null {
  const [inset, setInset] = useState<KeyboardInset | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) {
      setInset(null);
      return;
    }
    const update = () => {
      const next = keyboardInsetOf({
        innerHeight: window.innerHeight,
        height: viewport.height,
        offsetTop: viewport.offsetTop,
        scale: viewport.scale,
      });
      setInset((current) => (current?.bottom === next?.bottom && current?.height === next?.height ? current : next));
    };
    // An installed app on iOS does not always report the keyboard opening or closing: look again a few times
    // after the focus moves, while the keyboard slides.
    let timers: number[] = [];
    const settle = () => {
      for (const timer of timers) clearTimeout(timer);
      timers = [100, 300, 600].map((delay) => window.setTimeout(update, delay));
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', settle);
    document.addEventListener('focusout', settle);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', settle);
      document.removeEventListener('focusout', settle);
    };
  }, [active]);
  return inset;
}
