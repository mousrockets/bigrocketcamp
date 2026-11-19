import { useEffect, useState } from 'react';

// What rose since this device last showed it: a rank climbed, a streak grown. Kept in the browser like the board,
// so each rise is celebrated once per device.

const key = 'rl-seen';

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** How much `value` rose since this device last showed it under `name`: 0 the first time, or when it did not rise. */
export function useRise(name: string, value: number | null): number {
  const [rise, setRise] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const seen = readSeen();
    const before = seen[name];
    if (before !== undefined && value > before) setRise(value - before);
    if (before === value) return;
    try {
      localStorage.setItem(key, JSON.stringify({ ...seen, [name]: value }));
    } catch {
      // Private windows refuse storage: the rise shows again on the next visit.
    }
  }, [name, value]);
  return rise;
}
