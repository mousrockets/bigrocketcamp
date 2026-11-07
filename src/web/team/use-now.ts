import { useEffect, useState } from 'react';

/** The current time, updated every `every` milliseconds: for "il y a 8 min" to keep counting. */
export function useNow(every: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
