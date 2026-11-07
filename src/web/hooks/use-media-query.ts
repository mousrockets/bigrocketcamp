import { useSyncExternalStore } from 'react';

/** Whether a media query matches now, kept up to date: for what CSS alone cannot size, like an SVG's geometry. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
  );
}
