import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from './page';

// The settings-style lists of the profile: a small grey title, then rows in one card.

export function ListGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="px-1.5 pt-2 text-xs font-semibold text-muted-foreground">{title}</h2>
      <Panel>{children}</Panel>
    </section>
  );
}

const rowClass =
  'flex min-h-[50px] w-full items-center justify-between gap-3 border-t border-border px-4 text-left text-[15px] text-foreground no-underline first:border-t-0';

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
      {children && <span className="flex items-center gap-1.5 text-sm text-muted-foreground">{children}</span>}
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
    <Link {...link} className={cn(rowClass, 'hover:bg-accent/60 hover:no-underline', className)}>
      <span>{label}</span>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {value}
        <ChevronRightIcon aria-hidden="true" className="size-4" />
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
    <button type="button" onClick={onClick} className={cn(rowClass, 'hover:bg-accent/60', className)}>
      <span>{label}</span>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {value}
        {chevron && <ChevronRightIcon aria-hidden="true" className="size-4" />}
      </span>
    </button>
  );
}
