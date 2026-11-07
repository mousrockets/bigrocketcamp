import type { SVGProps } from 'react';

// The navigation's own pictograms, drawn for the club (lucide has no pitch seen from above).

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ClubIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
  </Icon>
);

export const MatchIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M12 5v14M3 10h3v4H3M21 10h-3v4h3" />
  </Icon>
);

export const ExercisesIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 18V8M10 18V5M16 18v-7M22 18H2" />
  </Icon>
);

export const ChallengeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
  </Icon>
);

export const ProfileIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon strokeWidth={2.6} {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

/** An empty pitch, its ball drifting: the club cannot be reached. */
export function EmptyPitch({ className }: { className?: string }) {
  return (
    <svg role="img" aria-label="Terrain vide" width="220" height="130" viewBox="0 0 220 130" className={className}>
      <g className="stroke-track" fill="none" strokeWidth="2">
        <rect x="4" y="4" width="212" height="122" rx="30" />
        <path d="M110 4v122" />
        <circle cx="110" cy="65" r="26" />
      </g>
      <rect className="fill-track" x="0" y="45" width="6" height="40" rx="2" />
      <rect className="fill-track" x="214" y="45" width="6" height="40" rx="2" />
      <g className="animate-drift">
        <circle className="fill-foreground" cx="110" cy="65" r="9" />
        <path
          className="stroke-live"
          d="M76 65h-14M158 65h-14"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 5"
        />
      </g>
    </svg>
  );
}
