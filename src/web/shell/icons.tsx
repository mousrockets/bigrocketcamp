import { useId } from 'react';

// The design's own line icons, drawn on a 24 px grid with a 1.7 stroke.

type IconProps = { className?: string; size?: number };

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function TeamIcon({ className, size = 24 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className} {...line}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3 2.2 3.5 5" />
    </svg>
  );
}

export function ChallengesIcon({ className, size = 24 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className} {...line}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </svg>
  );
}

export function MatchesIcon({ className, size = 24 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className} {...line}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function SettingsIcon({ className, size = 24 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className} {...line}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

export function PlusIcon({ className, size = 22 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Three chevrons climbing, the lower ones fading: the ranks' ladder. */
export function LadderIcon({ className, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...line}
      strokeWidth="2.1"
    >
      <path d="M6 11.5l6-5 6 5" />
      <path d="M6 16.5l6-5 6 5" opacity=".62" />
      <path d="M6 21l6-5 6 5" opacity=".3" />
    </svg>
  );
}

/** A referee's whistle: the club's rules. */
export function WhistleIcon({ className, size = 17 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...line}
      strokeWidth="1.8"
    >
      <path d="M8.5 8H21v3.6l-6.6 1.4a5.6 5.6 0 1 1-5.9-5z" />
      <circle cx="8.6" cy="13.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12.5 8V5.5" />
    </svg>
  );
}

export function PlayIcon({ className, size = 12 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M6 4l14 8-14 8z" />
    </svg>
  );
}

export function RefreshIcon({ className, size = 11 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
    </svg>
  );
}

export function SoloIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="12" cy="7.5" r="4.5" />
      <path d="M3 22c0-5 4-8 9-8s9 3 9 8z" />
    </svg>
  );
}

export function DuoIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="14" height="10" viewBox="0 0 34 24" className={className} fill="currentColor">
      <circle cx="11" cy="7.5" r="4.5" />
      <path d="M2 22c0-5 4-8 9-8s9 3 9 8z" />
      <circle cx="23" cy="7.5" r="4.5" />
      <path d="M21.6 14.1c.5 0 .9-.1 1.4-.1 5 0 9 3 9 8h-9.6c0-3.2-.3-5.9-.8-7.9z" />
    </svg>
  );
}

/** The streak's flame, which glows softly; dimmed when the streak is broken. */
export function Flame({ width = 11, height = 14, dim = false }: { width?: number; height?: number; dim?: boolean }) {
  const gradient = useId();
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox="0 0 32 40"
      className="origin-[50%_90%] animate-ember"
      style={dim ? { opacity: 0.35 } : undefined}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="1" stopColor="#ff6a2b" />
        </linearGradient>
      </defs>
      <path
        d="M16 1c2.2 7.4 12.5 11.4 12.5 23.4a12.5 12.5 0 0 1-25 0c0-6.4 3.2-10.4 6.3-13 0 4.2 2 7.3 5.2 8.3C13.8 12.4 13.8 6.7 16 1z"
        fill={`url(#${gradient})`}
      />
    </svg>
  );
}
