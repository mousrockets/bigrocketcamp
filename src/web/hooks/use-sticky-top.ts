import { useEffect, useState } from 'react';

/**
 * The `top` of a sticky column, and the ref to give it. While the column fits in the window, it stays `gap` below the
 * window's top. Once it is taller, its `top` goes negative: it scrolls with the page until its bottom shows, `gap`
 * above the window's bottom, and stays there, so that no part of it is ever out of reach.
 */
export function useStickyTop(gap: number): { ref: (element: HTMLElement | null) => void; top: number } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [top, setTop] = useState(gap);
  useEffect(() => {
    if (!element) return;
    const measure = () => setTop(Math.min(gap, window.innerHeight - element.offsetHeight - gap));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [element, gap]);
  return { ref: setElement, top };
}
