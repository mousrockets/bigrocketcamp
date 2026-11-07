import { cn } from 'cn';
import { useEffect, useState } from 'react';
import { formatNumber } from '../../lib/domain';
import { filledSegments } from '../board/model';
import type { Declaration } from '../board/types';
import { CarRun } from '../components/club/car';
import { Confetti } from '../components/club/confetti';
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
    : `Encore ${formatNumber(after)}${owner} et c’est free-play mérité.`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* The design's phone frame puts the figures 170 px from its top, status bar included, and the buttons 44 px
          from its bottom; a wide screen centres both columns. */}
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-x-hidden overflow-y-auto rounded-none bg-[#050608] px-6 pt-[calc(env(safe-area-inset-top)+126px)] pb-[max(env(safe-area-inset-bottom),44px)] text-[#f4f5f7] ring-0 sm:max-w-none data-open:zoom-in-100 lg:items-center lg:justify-center lg:px-5 lg:py-12"
      >
        <Confetti amount={settled ? 60 : 30} />
        <CarRun stop={settled} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-30%] top-[calc(env(safe-area-inset-top)+106px)] h-[440px] bg-[radial-gradient(closest-side,rgb(61_139_255/0.38),rgb(5_6_8/0))] [animation:brc-glow_2.4s_ease-in-out_infinite] lg:inset-[10%] lg:h-auto lg:bg-[radial-gradient(closest-side,rgb(61_139_255/0.34),rgb(5_6_8/0))]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+360px)] h-0.5 overflow-hidden lg:top-[52%]"
        >
          <i className="absolute inset-0 bg-[linear-gradient(90deg,rgb(255_255_255/0),#fff,rgb(255_255_255/0))] [animation:brc-sweep_1.1s_cubic-bezier(.4,0,.2,1)_.1s_both] lg:[animation-duration:1.2s]" />
        </div>
        <div
          className={cn(
            'relative flex w-full max-w-[1040px] flex-1 animate-in flex-col gap-[18px] duration-350 ease-[ease] fade-in-0 lg:flex-none lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-16 lg:gap-y-10',
            settled && 'motion-safe:[animation:brc-shake_.4s_.85s]',
          )}
        >
          <div className="flex flex-col gap-[18px] lg:flex-[1_1_420px]">
            <span className="text-xs font-extrabold tracking-[0.16em] text-[#9a9ca3] uppercase">
              {settled ? 'Dette réglée' : 'Calculated.'}
            </span>
            <div className="flex items-end gap-3.5 lg:gap-[18px]">
              <span
                className={cn(
                  'font-numeral text-[clamp(150px,57vw,220px)] leading-[0.74] font-black tracking-[-0.04em] lg:text-[clamp(160px,22vw,320px)]',
                  settled && shown === 0 && 'text-[#5ed38a]',
                )}
              >
                {shown}
              </span>
              {reduction > 0 && (
                <span className="mb-2.5 -rotate-6 rounded-lg bg-[#ff9f45] px-2.5 py-0.5 font-heading text-[34px] leading-[normal] font-black italic [font-stretch:70%] text-[#050608] [animation:brc-stamp_.55s_cubic-bezier(.2,.9,.25,1)_.2s_both] lg:mb-3.5 lg:rounded-[10px] lg:px-3 lg:text-[44px]">
                  −{formatNumber(reduction)}
                </span>
              )}
            </div>
            <span className="text-sm font-bold tracking-[0.1em] text-[#c9cbd1] lg:text-[15px]">POMPES À RENDRE</span>
            <div aria-hidden="true" className="grid grid-cols-10 gap-1 lg:gap-[5px]">
              {Array.from({ length: 10 }, (_, index) => (
                <i
                  // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed blocks.
                  key={index}
                  className={cn(
                    'h-2 rounded-[2px] transition-colors duration-300 ease-[ease] lg:h-2.5 lg:rounded-[3px]',
                    index < filled ? 'bg-[#3d8bff]' : 'bg-[#24252a]',
                  )}
                />
              ))}
            </div>
          </div>
          {/* On a phone the right column dissolves: its lines follow the figures, its buttons sink to the bottom. */}
          <div className="contents lg:flex lg:flex-[1_1_320px] lg:flex-col lg:gap-4 lg:pb-1.5">
            {/* The dialog title's own weight and line would win over font-display's: set them again. */}
            <DialogTitle className="font-display text-[30px] leading-[1.06] font-extrabold tracking-normal text-balance lg:text-[44px] lg:leading-[1.02]">
              Les bras en béton armé !
            </DialogTitle>
            <DialogDescription className="text-sm text-[#9a9ca3] lg:text-base">{sub}</DialogDescription>
            <div className="mt-auto flex flex-col-reverse gap-3 lg:mt-3 lg:flex-row lg:flex-wrap">
              <Button
                autoFocus
                onClick={onClose}
                className="h-[54px] rounded-[15px] border-0 bg-[#f4f5f7] px-8 font-button text-[17px] font-extrabold text-[#050608] hover:bg-white"
              >
                Continuer
              </Button>
              {undoable && (
                <Button
                  variant="outline"
                  onClick={onUndo}
                  className="relative h-[46px] overflow-hidden rounded-[14px] border-white/12 bg-transparent text-sm font-semibold text-[#c9cbd1] hover:bg-white/5 lg:h-[54px] lg:rounded-[15px] lg:border-white/14 lg:px-[22px] lg:text-[15px] dark:bg-transparent"
                >
                  <i
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-[#3d8bff] [animation:brc-shrink_10s_linear_both]"
                  />
                  Annuler cette série
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
