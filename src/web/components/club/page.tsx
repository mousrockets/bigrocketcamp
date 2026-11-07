import { Link, type LinkProps } from '@tanstack/react-router';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
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

/**
 * The way back to the parent page: the design's round 44 px button on a phone and, on a wide screen, where the
 * side bar already leads everywhere, a small blue "← Profil" link when `wide` names the parent (32 px tall
 * on its own, as on the player's card; a line of text inside a page header).
 */
export function BackLink({
  label,
  wide,
  className,
  ...link
}: LinkProps & { label: string; wide?: string; className?: string }) {
  return (
    <>
      <Link
        {...link}
        aria-label={label}
        className={cn(
          buttonVariants({ variant: 'secondary', size: 'icon-xl' }),
          'shrink-0 text-foreground hover:text-foreground lg:hidden',
          className,
        )}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      {wide && (
        <Link
          {...link}
          aria-label={label}
          data-slot="back-wide"
          className="hidden min-h-8 items-center self-start text-sm font-semibold lg:flex"
        >
          ← {wide}
        </Link>
      )}
    </>
  );
}

/**
 * A page's title under its small capitals. On a phone: the round way back on its left (the design's 44 px row,
 * a 24 px title) or, without it, a 34 px title; on a wide screen: a 40 px title, with the way back as a link
 * above the small capitals. Its controls sit on the right.
 */
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
      className={cn(
        'flex flex-wrap justify-between gap-4 lg:min-h-0 lg:items-end lg:gap-4 lg:px-0',
        back ? 'min-h-11 items-center gap-3' : 'items-end px-1',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3 lg:flex-col lg:items-start lg:gap-1 lg:[&_[data-slot=back-wide]]:min-h-0">
        {back}
        <div className={cn('flex min-w-0 flex-col lg:gap-1', back ? 'gap-px' : 'gap-0.5')}>
          {kicker && <span className="kicker">{kicker}</span>}
          <h1 className={cn('font-display lg:text-[40px]', back ? 'text-2xl' : 'text-[34px]', 'leading-none')}>
            {title}
          </h1>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/**
 * The design's .card: 22 px corners, #111114, a 6 % white edge. Its text starts at the page's 16 px, as in the
 * design, not at the 14 px of a stock shadcn card.
 */
export function Panel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      role={props['aria-label'] ? 'region' : undefined}
      className={cn('gap-0 py-0 text-base', className)}
      {...props}
    />
  );
}

/**
 * The column a page's blocks stand in when the page wants the design's tighter 12 px rhythm (Matchs, Profil,
 * Exercices, Identités) instead of the shell's 14 px. Wide screens keep 20 px.
 */
export function PageStack({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3 lg:gap-5', className)} {...props} />;
}

/** A line of small grey text under a block. */
export function Note({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('px-1 text-xs leading-[1.45] text-muted-foreground', className)} {...props} />;
}

/**
 * The design's .fld, by height: 54 (sign-in), 52 (welcome), 50 (settings and members on a phone),
 * 48 (settings on a wide screen), 42 (the profile's inline field on a wide screen). The blue edge and halo of
 * the focus come from the shadcn Input.
 */
export const fieldVariants = cva(
  'border-input bg-secondary font-medium text-foreground placeholder:text-placeholder dark:bg-secondary',
  {
    variants: {
      size: {
        xl: 'h-[54px] rounded-[14px] px-4 text-[17px] md:text-[17px]',
        lg: 'h-[52px] rounded-[14px] px-4 text-[17px] md:text-[17px]',
        md: 'h-[50px] rounded-[14px] px-3.5 text-base md:text-base',
        sm: 'h-12 rounded-[12px] px-3.5 text-[15px] md:text-[15px]',
        xs: 'h-[42px] rounded-[12px] px-3 text-[15px] md:text-[15px]',
      },
    },
    defaultVariants: { size: 'lg' },
  },
);

export type FieldSize = VariantProps<typeof fieldVariants>['size'];

/** The 52 px field; `fieldVariants` gives the other heights. */
export const fieldClass = fieldVariants();

/** The design's .lbl: the label over its field, 8 px above it. */
export const labelClass = 'flex flex-col gap-2 text-[13px] font-semibold text-soft';

/** The design's .hint: the grey help under a field. */
export const hintClass = 'text-xs leading-[1.4] font-normal text-muted-foreground';
