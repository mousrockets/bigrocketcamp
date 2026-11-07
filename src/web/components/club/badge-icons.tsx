import type { SVGProps } from 'react';

// Two badges lucide has no drawing for, in its style: "100" and a chocolate bar (200 crunches).

export function HundredIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4 8l2-1.5V17" />
      <rect x="9" y="7" width="5" height="10" rx="2.5" />
      <rect x="16" y="7" width="5" height="10" rx="2.5" />
      <path d="M8 20h13" />
    </svg>
  );
}

export function ChocolateIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M6 9h12M6 15h12M12 3v18" />
    </svg>
  );
}
