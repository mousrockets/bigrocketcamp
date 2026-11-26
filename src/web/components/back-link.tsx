import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BackChevron } from '../settings/icons';

/** The way back to the page a screen was opened from, at its top left, as in iOS. */
export function BackLink({ to, children }: { to: NonNullable<LinkProps['to']>; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-3 mb-[-2px] inline-flex h-11 w-fit items-center gap-1.5 text-[17px] text-link hover:text-[#8fc0ff] lg:mb-2.5 lg:ml-0 lg:h-auto lg:text-[15px]"
    >
      <BackChevron />
      {children}
    </Link>
  );
}
