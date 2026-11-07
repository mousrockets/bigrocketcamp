import type { ReactNode } from 'react';

// The icons of Réglages, drawn like the tab bar's: a 24-unit grid, round ends, a thin stroke.

function Icon({
  size = 18,
  stroke = 1.7,
  children,
}: {
  size?: number | undefined;
  stroke?: number;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const CollectorIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16.5V20" />
  </Icon>
);

export const IdentitiesIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="9" cy="11" r="2.2" />
    <path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M15 10h3M15 13h3" />
  </Icon>
);

export const ClubIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M9 9h6M9 12h6M9 15h3" />
  </Icon>
);

export const MembersIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c.8-3.2 3.1-5 6-5s5.2 1.8 6 5" />
    <path d="M17 8v6M14 11h6" />
  </Icon>
);

export const SoundsIcon = () => (
  <Icon>
    <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
);

export const InstallIcon = () => (
  <Icon>
    <rect x="5" y="2.5" width="14" height="19" rx="3" />
    <path d="M12 9v6M9 12h6" />
  </Icon>
);

export const SignOutIcon = () => (
  <Icon>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Icon>
);

export const RuleIcon = () => (
  <Icon>
    <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-2.5 2-2.5-2-2.5 2L6 18V6a2 2 0 0 1 1-2z" />
    <path d="M10 9h4M10 12.5h4" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon size={14} stroke={2}>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const CheckIcon = () => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-link"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** The arrow at the end of a row that opens another screen. */
export const Chevron = () => (
  <svg
    aria-hidden="true"
    width="8"
    height="13"
    viewBox="0 0 8 13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-t3"
  >
    <path d="M1.5 1.5l5 5-5 5" />
  </svg>
);

export const BackChevron = () => (
  <svg
    aria-hidden="true"
    width="11"
    height="18"
    viewBox="0 0 11 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 2L2 9l7 7" />
  </svg>
);
