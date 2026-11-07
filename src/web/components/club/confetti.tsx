import type { CSSProperties } from 'react';
import { useState } from 'react';

// Paper falling over the screen after a series (30 pieces), a cleared debt or a badge (60).

const colors = ['#3d8bff', '#f4f5f7', '#ffcf5c', '#5ed38a'];

export function Confetti({ amount }: { amount: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: amount }, (_, index) => ({
      key: index,
      style: {
        left: `${Math.random() * 100}%`,
        background: colors[index % colors.length],
        animationDelay: `${Math.random() * 0.4}s`,
        '--r': `${Math.random() * 720 - 360}deg`,
      } as CSSProperties,
    })),
  );
  return (
    <div aria-hidden="true" className="motion-only pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((piece) => (
        <i
          key={piece.key}
          style={piece.style}
          className="absolute -top-4 h-3.5 w-2.5 rounded-[3px] opacity-0 [animation:brc-fall_1.9s_cubic-bezier(.25,.6,.4,1)_forwards]"
        />
      ))}
    </div>
  );
}
