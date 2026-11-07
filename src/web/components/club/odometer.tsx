import type { CSSProperties } from 'react';

// Digits that roll to their new value, as the old board's debt counter did. Keyed from the right so units stay
// units and roll instead of remounting. Motion asked away: the transition is cut by the global rule.

export function Odometer({ value }: { value: string }) {
  const chars = value.split('');
  return (
    <span className="inline-flex">
      <span className="sr-only">{value}</span>
      {chars.map((char, index) => {
        const key = chars.length - index;
        if (!/\d/.test(char)) {
          return (
            <span key={`s${key}`} aria-hidden="true">
              {char}
            </span>
          );
        }
        return (
          <span
            key={`d${key}`}
            aria-hidden="true"
            className="relative inline-block h-[0.86em] overflow-hidden leading-[0.86]"
          >
            <span className="invisible">{char}</span>
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{ transform: `translateY(calc(var(--d) * -0.86em))`, '--d': char } as CSSProperties}
            >
              {'0123456789'.split('').map((digit) => (
                <span key={digit} className="h-[0.86em] text-center">
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
