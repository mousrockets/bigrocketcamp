import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, buttonVariants } from './ui/button';

/** The period an arrow leads to: the search parameter that names it, and what a screen reader says. */
export interface PeriodStep {
  search: Record<string, string | undefined>;
  label: string;
}

/** The look of the period between the arrows, whether a link, a button or plain text. */
export const periodLabelClass = buttonVariants({ variant: 'capsule', size: 'capsule-label' });

/** The blue dot of the period going on. */
export function NowDot() {
  return <i aria-hidden="true" className="size-[5px] rounded-full bg-link shadow-[0_0_6px_var(--link)]" />;
}

/**
 * The glass capsule at the right of a block's small capitals: the arrow to the period before, the period shown, the
 * arrow to the one after. Each period has its own address, so the way back returns to it; the page stays where it
 * was. An arrow with nowhere to go stays greyed.
 */
export function PeriodPicker({
  label,
  previous,
  next,
  children,
}: {
  /** What the picker chooses, for a screen reader: « Semaine affichée ». */
  label: string;
  previous: PeriodStep | null;
  next: PeriodStep | null;
  /** The period shown, between the arrows. */
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex h-[30px] shrink-0 items-center rounded-[15px] bg-linear-to-b from-white/11 to-white/4 shadow-[inset_0_.5px_0_rgba(255,255,255,.24),inset_0_0_0_.5px_rgba(255,255,255,.09),0_6px_16px_-8px_rgba(0,0,0,.7)]"
    >
      <Arrow step={previous} fallback="Précédent">
        <ChevronLeftIcon strokeWidth={2.4} />
      </Arrow>
      <Separator />
      {children}
      <Separator />
      <Arrow step={next} fallback="Suivant">
        <ChevronRightIcon strokeWidth={2.4} />
      </Arrow>
    </nav>
  );
}

function Separator() {
  return <i aria-hidden="true" className="h-3.5 w-[.5px] bg-white/16" />;
}

function Arrow({ step, fallback, children }: { step: PeriodStep | null; fallback: string; children: ReactNode }) {
  const look = buttonVariants({ variant: 'capsule', size: 'capsule-arrow' });
  if (!step) {
    return (
      <Button variant="capsule" size="capsule-arrow" disabled aria-label={fallback}>
        {children}
      </Button>
    );
  }
  return (
    <Link
      to="."
      search={(current: Record<string, unknown>) => ({ ...current, ...step.search })}
      resetScroll={false}
      aria-label={step.label}
      className={cn(look)}
    >
      {children}
    </Link>
  );
}

/** A block's small capitals, with its period picker at the right. */
export function PeriodKicker({ kicker, picker }: { kicker: string; picker: ReactNode }) {
  return (
    <span className="flex min-h-7 items-center justify-between gap-2.5">
      <span className="label-caps">{kicker}</span>
      {picker}
    </span>
  );
}
