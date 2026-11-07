import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Panel } from './page';

// The settings-style lists of the profile (the design's .gt, .li and .v): a small grey title, then rows in one card.

export function ListGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 lg:gap-2">
      <h2 className="px-1.5 pt-2 text-xs font-semibold text-muted-foreground lg:pt-0">{title}</h2>
      <Panel>{children}</Panel>
    </section>
  );
}

// The design's rows keep their 50 (52) px under a 1 px top edge: every row but the first stands 1 px taller.
const rowClass =
  'flex min-h-[50px] w-full items-center justify-between gap-3 border-t border-border px-4 text-left text-[15px] text-foreground no-underline not-first:min-h-[51px] first:border-t-0 lg:min-h-[52px] lg:px-[18px] lg:not-first:min-h-[53px]';

/** Where a row opens or acts, the design lightens it on a wide screen. */
const actionRowClass = 'hover:text-foreground lg:hover:bg-row-hover';

/** The value on the right of a row, grey, with its chevron or lock. */
const valueClass = 'flex items-center gap-1.5 text-sm text-muted-foreground';

/** The row's classes, for a row another control draws (a menu's trigger, a label around a field). */
export const listRowClasses = { row: rowClass, action: actionRowClass, value: valueClass };

/** A row: a label, and its value or control on the right. */
export function ListRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(rowClass, className)}>
      <span>{label}</span>
      {children && <span className={valueClass}>{children}</span>}
    </div>
  );
}

/** A row that opens a page. */
export function ListLink({
  label,
  value,
  className,
  ...link
}: LinkProps & { label: ReactNode; value?: ReactNode; className?: string }) {
  return (
    <Link {...link} className={cn(rowClass, actionRowClass, className)}>
      <span>{label}</span>
      <span className={valueClass}>
        {value}
        <span aria-hidden="true">›</span>
      </span>
    </Link>
  );
}

/** A row that acts: opens a window, signs out. */
export function ListButton({
  label,
  value,
  onClick,
  className,
  chevron = true,
}: {
  label: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  className?: string;
  chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(rowClass, actionRowClass, className)}>
      <span>{label}</span>
      <span className={valueClass}>
        {value}
        {chevron && <span aria-hidden="true">›</span>}
      </span>
    </button>
  );
}
