import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/** A link that opens the declaration sheet over the page it is on. */
export function DeclareLink({
  children,
  className,
  'aria-label': label,
}: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  const { pathname } = useLocation();
  return (
    // Every tab lives in the shell, which owns `declarer`: the current tab's address keeps its own path.
    <Link to={pathname as '/'} search={{ declarer: true }} className={className} aria-label={label}>
      {children}
    </Link>
  );
}
