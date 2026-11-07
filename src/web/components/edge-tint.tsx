import { useEffect, useRef } from 'react';

// Safari 26 and later ignore theme-color and the html background when they colour the strips behind the status bar
// and the floating toolbar: they take the body's black, unless a full-width fixed element sits at that edge. Two thin
// strips sit there, each taking the colour of the page under it: the light of the top of a page (its data-top-tint)
// while the page is scrolled to its top, else the page's own background. Only in the browser on a touch screen: the
// installed app draws under the status bar itself, and a computer's browser has no such bars.

/** How far the page may scroll before its top light has gone from under the status bar. */
const lightReach = 80;

function backgroundAt(x: number, y: number): string {
  for (let element = document.elementFromPoint(x, y); element; element = element.parentElement) {
    const color = getComputedStyle(element).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
  }
  return '';
}

function topTint(): string {
  const page = document.querySelector<HTMLElement>('[data-top-tint]');
  if (page && window.scrollY < lightReach) return page.dataset.topTint ?? '';
  return backgroundAt(2, 13);
}

export function EdgeTint() {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const browserOnTouch = matchMedia('(pointer: coarse)').matches && !matchMedia('(display-mode: standalone)').matches;
    if (!browserOnTouch) return;
    let queued = false;
    const paint = () => {
      queued = false;
      if (top.current) top.current.style.backgroundColor = topTint();
      if (bottom.current) bottom.current.style.backgroundColor = backgroundAt(2, window.innerHeight - 14);
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };
    // A page change swaps the content under the strips without a scroll.
    const observer = new MutationObserver(queue);
    observer.observe(document.body, { childList: true, subtree: true });
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    paint();
    return () => {
      observer.disconnect();
      removeEventListener('scroll', queue);
      removeEventListener('resize', queue);
    };
  }, []);

  return (
    <>
      <div ref={top} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-3" />
      <div ref={bottom} aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-3" />
    </>
  );
}
