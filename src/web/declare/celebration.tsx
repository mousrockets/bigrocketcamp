import { cn } from 'cn';
import { useEffect, useState } from 'react';
import { formatNumber } from '../../lib/domain';
import { filledSegments, savedLine } from '../board/model';
import type { Declaration } from '../board/types';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';

// After a series: the debt counts down to what is left, with ten seconds to undo a mistake.

export interface CelebrationData {
  declaration: Declaration;
  /** The player's debt before and after the series. */
  before: number;
  after: number;
  done: number;
  due: number;
  /** Declared for the member's own player. */
  mine: boolean;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from one number to another, in about a second; at once for whoever asks for less motion. */
function useCountdown(from: number, to: number): number {
  const [value, setValue] = useState(reducedMotion() ? to : from);
  useEffect(() => {
    if (reducedMotion() || from === to) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now() + 350;
    const duration = Math.min(1200, Math.max(400, Math.abs(from - to) * 45));
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);
  return value;
}

export function Celebration({
  data,
  undoable,
  onUndo,
  onClose,
}: {
  data: CelebrationData;
  undoable: boolean;
  onUndo: () => void;
  onClose: () => void;
}) {
  const { declaration, before, after, done, due, mine } = data;
  const shown = useCountdown(before, after);
  const reduction = before - after;
  const settled = after === 0;
  const filled = filledSegments(done - (shown - after), due);
  const owner = mine ? '' : ` pour ${declaration.player}`;
  const sub = settled
    ? `Dette réglée${owner}. ${formatNumber(done)} équiv. pompes réalisées au total.`
    : `Il reste ${formatNumber(after)} pompe${after >= 2 ? 's' : ''} à rendre${owner}. ${formatNumber(done)} réalisées sur ${formatNumber(due)}.`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col justify-end overflow-hidden rounded-none bg-[#050608] px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[max(env(safe-area-inset-bottom),44px)] text-[#f4f5f7] ring-0 sm:max-w-none data-open:zoom-in-100 lg:items-center lg:justify-center lg:p-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-30%] top-[150px] h-[440px] animate-pulse bg-[radial-gradient(closest-side,rgb(61_139_255/0.38),transparent)] lg:inset-[10%] lg:h-auto"
        />
        <div className="relative flex w-full max-w-[1040px] flex-1 flex-col justify-center gap-[18px] lg:flex-none lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-16 lg:gap-y-10">
          <div className="flex flex-col gap-[18px] lg:min-w-[420px] lg:flex-1">
            <span className="kicker text-[#9a9ca3]">{settled ? 'Dette réglée' : 'Série validée'}</span>
            <div className="flex items-end gap-3.5">
              <span
                className={cn(
                  'font-numeral text-[clamp(150px,48vw,220px)] leading-[0.74] lg:text-[clamp(160px,22vw,320px)]',
                  settled && shown === 0 && 'text-[#5ed38a]',
                )}
              >
                {shown}
              </span>
              {reduction > 0 && (
                <span className="mb-2.5 -rotate-6 animate-in rounded-lg bg-[#ff9f45] px-2.5 py-0.5 font-heading text-[34px] font-black italic [font-stretch:70%] text-[#050608] duration-500 zoom-in-150 fade-in-0 lg:text-[44px]">
                  −{formatNumber(reduction)}
                </span>
              )}
            </div>
            <span className="text-sm font-bold tracking-[0.1em] text-[#c9cbd1]">POMPES À RENDRE</span>
            <div aria-hidden="true" className="grid grid-cols-10 gap-1 lg:gap-[5px]">
              {Array.from({ length: 10 }, (_, index) => (
                <i
                  // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed blocks.
                  key={index}
                  className={cn(
                    'h-2 rounded-[2px] transition-colors duration-300 lg:h-2.5',
                    index < filled ? 'bg-[#3d8bff]' : 'bg-[#24252a]',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 lg:min-w-[320px] lg:flex-1 lg:pb-1.5">
            <DialogTitle className="font-display text-[30px] leading-[1.06] text-balance lg:text-[44px]">
              {savedLine(declaration.type, declaration.count)}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#9a9ca3] lg:text-base">{sub}</DialogDescription>
            <div className="mt-6 flex flex-col-reverse gap-3 lg:mt-3 lg:flex-row lg:flex-wrap">
              {undoable && (
                <Button
                  variant="outline"
                  onClick={onUndo}
                  className="relative h-[46px] overflow-hidden rounded-[14px] border-white/12 bg-transparent text-sm font-semibold text-[#c9cbd1] hover:bg-white/5 lg:h-[54px] lg:px-[22px] lg:text-[15px] dark:bg-transparent"
                >
                  <i
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-[#3d8bff] [animation:brc-shrink_10s_linear_both]"
                  />
                  Annuler cette série
                </Button>
              )}
              <Button
                autoFocus
                onClick={onClose}
                className="h-[54px] rounded-[15px] bg-[#f4f5f7] px-8 font-display text-[17px] text-[#050608] hover:bg-white"
              >
                Continuer
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
