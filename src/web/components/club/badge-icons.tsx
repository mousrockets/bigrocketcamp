import type { ReactNode, SVGProps } from 'react';

// The six badges as the design draws them: 24 × 24, a 2 px round stroke in the badge's colour.

function BadgeIcon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Premier effort: a target. */
export function TargetBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BadgeIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </BadgeIcon>
  );
}

/** 100 équiv. pompes: bars. */
export function HundredIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BadgeIcon {...props}>
      <path d="M4 18V8M10 18V5M16 18v-7M22 18H2" />
    </BadgeIcon>
  );
}

/** 1 000 équiv. pompes: a cup. */
export function CupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BadgeIcon {...props}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    </BadgeIcon>
  );
}

/** 10 min de gainage: a plank. */
export function PlankIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BadgeIcon {...props}>
      <rect x="3" y="10" width="18" height="4" rx="2" />
    </BadgeIcon>
  );
}

/** 200 abdos: a chocolate bar. */
export function ChocolateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BadgeIcon {...props}>
      <rect x="6" y="4" width="12" height="16" rx="3" />
      <path d="M6 9.5h12M6 14.5h12M12 4v16" />
    </BadgeIcon>
  );
}

/** 7 jours d’affilée: a flame. */
export function FlameBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BadgeIcon {...props}>
      <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.6 2.4 3C11 9 11 6 12 3z" />
    </BadgeIcon>
  );
}
