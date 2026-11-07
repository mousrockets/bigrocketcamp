import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonVariants } from '../ui/button';
import { Card } from '../ui/card';

// The parts every page shares: its title, the way back, and the soft light at the top of the screen.

const glows = {
  blue: 'bg-[radial-gradient(120%_70%_at_50%_-10%,var(--glow),transparent_70%)]',
  cost: 'bg-[radial-gradient(120%_70%_at_50%_-10%,var(--glow-cost),transparent_70%)]',
  violet: 'bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(150_90_230/0.22),transparent_70%)]',
} as const;

/** The light behind the top of a page; purely decorative. */
export function PageGlow({ tone = 'blue' }: { tone?: keyof typeof glows }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-[-16px] top-[calc(-14px-env(safe-area-inset-top))] h-[420px] lg:inset-x-[-48px] lg:top-[-32px] lg:h-[360px]',
        glows[tone],
      )}
    />
  );
}

/** The round button back to the parent page; the side bar replaces it on a wide screen. */
export function BackLink({ label, className, ...link }: LinkProps & { label: string; className?: string }) {
  return (
    <Link
      {...link}
      aria-label={label}
      className={cn(buttonVariants({ variant: 'secondary', size: 'icon-xl' }), 'shrink-0', className)}
    >
      <ChevronLeftIcon className="size-[22px]" />
    </Link>
  );
}

/** A page's title, under its small capitals, with the way back on a phone and its controls on the right. */
export function PageHeader({
  kicker,
  title,
  back,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', back && 'items-center', className)}
    >
      <div className="flex min-w-0 items-center gap-3">
        {back && <div className="lg:hidden">{back}</div>}
        <div className="flex min-w-0 flex-col gap-1">
          {kicker && <span className="kicker">{kicker}</span>}
          <h1
            className={cn(
              'font-display leading-none',
              back ? 'text-2xl lg:text-[40px]' : 'px-1 text-[34px] lg:px-0 lg:text-[40px]',
            )}
          >
            {title}
          </h1>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/** The card the design uses everywhere a group needs one: rounded, dark, a faint edge. */
export function Panel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card role={props['aria-label'] ? 'region' : undefined} className={cn('gap-0 py-0', className)} {...props} />;
}

/** A line of small grey text under a block. */
export function Note({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('px-1 text-xs leading-[1.45] text-muted-foreground', className)} {...props} />;
}
