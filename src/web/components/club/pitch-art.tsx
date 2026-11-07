import { cn } from 'cn';

// The pitch seen from above, faint, behind the sign-in: purely decorative.

export function PitchLines({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 390 300" className={cn('pointer-events-none', className)}>
      <g fill="none" stroke="rgb(122 184 255 / 0.2)" strokeWidth="1.5">
        <circle cx="195" cy="150" r="90" />
        <path d="M0 150H390" />
        <circle cx="195" cy="150" r="4" fill="rgb(122 184 255 / 0.35)" />
      </g>
    </svg>
  );
}

export function PitchArt({ ball = 'center', goals = true }: { ball?: 'center' | 'right'; goals?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 720 420"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        <radialGradient id="pitch-glow" cx=".3" cy=".2" r=".9">
          <stop offset="0" stopColor="#1d4a96" stopOpacity=".55" />
          <stop offset="1" stopColor="#08101f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="720" height="420" fill="url(#pitch-glow)" />
      <g fill="none" stroke="rgb(150 195 255 / 0.16)" strokeWidth="1.5">
        <rect x="60" y="50" width="600" height="320" rx="90" />
        <path d="M360 50v320" />
        <circle cx="360" cy="210" r="70" />
        {goals && <path d="M60 150h50v120H60M660 150h-50v120h50" />}
      </g>
      {goals && (
        <>
          <rect x="48" y="180" width="12" height="60" rx="3" fill="#3d8bff" opacity=".7" />
          <rect x="660" y="180" width="12" height="60" rx="3" fill="#ff9f45" opacity=".7" />
        </>
      )}
      {ball === 'center' ? (
        <g className="animate-drift">
          <circle cx="360" cy="210" r="34" fill="rgb(255 255 255 / 0.08)" />
          <circle cx="360" cy="210" r="13" fill="#f4f5f7" />
        </g>
      ) : (
        <circle cx="430" cy="210" r="13" fill="#f4f5f7" />
      )}
    </svg>
  );
}
