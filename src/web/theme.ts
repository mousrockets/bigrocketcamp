import { useEffect, useState } from 'react';

// The theme is a preference of this device. index.html applies the saved one before the first paint.

export type ThemeChoice = 'dark' | 'light' | 'auto';

export const themeChoices: readonly [ThemeChoice, string][] = [
  ['dark', 'Sombre'],
  ['light', 'Clair'],
  ['auto', 'Auto'],
];

const themeKey = 'rl-theme';

/** The saved choice; the dark theme is the reference, so anything unknown means dark. */
export function savedTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(themeKey);
    return saved === 'light' || saved === 'auto' ? saved : 'dark';
  } catch {
    return 'dark';
  }
}

/** Applies a choice to the page; "auto" follows the system, now and when it changes. */
function applyTheme(choice: ThemeChoice): () => void {
  const media = matchMedia('(prefers-color-scheme: light)');
  const apply = () => {
    const resolved = choice === 'auto' ? (media.matches ? 'light' : 'dark') : choice;
    document.documentElement.dataset.theme = resolved;
    // The browser's bars follow the page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'light' ? '#f4f5f7' : '#060607');
  };
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}

/** The device's theme, kept applied while the app runs. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(savedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  return [
    theme,
    (choice) => {
      setTheme(choice);
      try {
        localStorage.setItem(themeKey, choice);
      } catch {
        // Private windows refuse storage: the choice then lasts for the visit.
      }
    },
  ];
}
