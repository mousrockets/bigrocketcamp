import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBoardState } from '../../board/board-context';
import type { DrinkDebt } from '../../board/monthly';
import { settleDrink } from '../../writes';
import { Button } from '../ui/button';

// The pieces of the drinks a month's last owes: the design's 40 px tile and its small "C'est bu !" button.

export type DrinkTone = 'owed' | 'settled' | 'missing';

const tiles: Record<DrinkTone, string> = {
  owed: 'bg-cost/14 text-cost-soft',
  settled: 'bg-settled/12 text-settled',
  missing: 'bg-secondary text-muted-foreground',
};

const glyphs: Record<DrinkTone, { strokeWidth: string; shape: ReactNode }> = {
  owed: { strokeWidth: '2', shape: <path d="M6 4h12l-1.5 15a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8zM6.5 9h11" /> },
  settled: { strokeWidth: '2.4', shape: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  missing: {
    strokeWidth: '2.2',
    shape: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16v.5" />
      </>
    ),
  },
};

/** The design's .cup: a glass to offer, a tick when nothing is owed, a sign when the month could not be decided. */
export function DrinkTile({ tone, className }: { tone: DrinkTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-[12px]', tiles[tone], className)}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={glyphs[tone].strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyphs[tone].shape}
      </svg>
    </span>
  );
}

/** Marks a drink as drunk, or takes the mark back, one write at a time. */
export function useDrinkActions() {
  const { refresh } = useBoardState();
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const write = useMutation({ mutationFn: settleDrink }).mutateAsync;

  async function act(body: Parameters<typeof settleDrink>[0], done: string) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      await write(body);
      toast.success(done);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    settle: (debt: DrinkDebt) => act({ action: 'settle', id: debt.id }, 'Santé ! La boisson est marquée comme bue.'),
    undo: (debt: DrinkDebt) => act({ action: 'undo', id: debt.id }, 'Boisson remise à offrir.'),
  };
}

/**
 * The design's .sm, 36 px tall: white "C'est bu !" while the drink is owed, framed "Annuler" for a moment after.
 * Its touch area reaches 44 px. `describedBy` names the drink for a screen reader.
 */
export function DrinkButton({
  kind,
  onClick,
  disabled,
  describedBy,
}: {
  kind: 'settle' | 'undo';
  onClick: () => void;
  disabled: boolean;
  describedBy?: string;
}) {
  return (
    <Button
      variant={kind === 'settle' ? 'inverse' : 'outline'}
      size="md"
      disabled={disabled}
      onClick={onClick}
      aria-describedby={describedBy}
      className={cn(
        "relative rounded-full font-sans font-semibold after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        kind === 'settle' && 'border-0',
      )}
    >
      {kind === 'settle' ? 'C’est bu !' : 'Annuler'}
    </Button>
  );
}
