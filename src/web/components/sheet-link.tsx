import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/** The sheets the shell opens over any tab, each by its search parameter. */
export type ShellSheet = 'declarer' | 'ranks' | 'regles';

/** A link that opens one of the shell's sheets over the page it is on. */
export function SheetLink({
  sheet,
  children,
  className,
  'aria-label': label,
}: {
  sheet: ShellSheet;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  const { pathname } = useLocation();
  return (
    // Every tab lives in the shell, which owns the sheets: the current tab's address keeps its own path.
    <Link to={pathname as '/'} search={{ [sheet]: true }} className={className} aria-label={label}>
      {children}
    </Link>
  );
}
