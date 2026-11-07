import { useState } from 'react';

// The goal scene of the old board's welcome, and its floating "5": the club's rule, replayed on a click.

function Ball() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-full">
      <circle cx="12" cy="12" r="11" fill="#f4f5f7" stroke="#26272c" strokeWidth="1.2" />
      <path d="M12 7l4.3 3.1-1.6 5H9.3l-1.6-5z" fill="#26272c" />
      <path
        d="M12 1.5V7M16.3 10.1l5-1.6M14.7 15.1l3.2 4.3M9.3 15.1l-3.2 4.3M7.7 10.1l-5-1.6"
        stroke="#26272c"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function KickoffScene() {
  const [run, setRun] = useState(0);
  return (
    <button
      type="button"
      aria-label="Rejouer l’animation du but"
      title="Rejouer"
      onClick={() => setRun((r) => r + 1)}
      className="relative block h-[84px] w-full min-w-0 rounded-lg lg:flex-1"
    >
      {/* A new key remounts the scene, which restarts its animations. */}
      <span key={run} className="absolute inset-0 block">
        <span className="absolute inset-x-0 bottom-1.5 h-0.5 bg-[linear-gradient(90deg,transparent,var(--track)_12%,var(--track)_88%,transparent)]" />
        <span className="absolute right-0 bottom-2 h-[52px] w-[54px] origin-bottom-right overflow-hidden rounded-tl-lg border-t-4 border-l-4 border-foreground [animation:brc-net-shake_.55s_2.2s_ease-out] lg:h-[62px] lg:w-16">
          <span className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent_0_6px,var(--faint)_6px_7px),repeating-linear-gradient(-45deg,transparent_0_6px,var(--faint)_6px_7px)] opacity-70" />
        </span>
        <span className="motion-only absolute right-[22px] bottom-[30px] -m-[15px] size-[30px] rounded-full border-4 border-cost opacity-0 [animation:brc-ring_.8s_2.2s_ease-out_forwards]" />
        <span className="motion-only absolute right-[22px] bottom-[30px] -m-[15px] size-[30px] rounded-full border-4 border-primary opacity-0 [animation:brc-ring_.8s_2.32s_ease-out_forwards]" />
        <span className="motion-only absolute top-0 right-[70px] font-heading text-[26px] font-black whitespace-nowrap italic [font-stretch:70%] text-foreground opacity-0 [animation:brc-goal-text_1.8s_2.2s_cubic-bezier(.2,1.4,.4,1)_forwards] lg:right-[78px]">
          BUT !
        </span>
        <span className="absolute bottom-2 left-[calc(100%-42px)] size-[26px] motion-safe:left-[-26px] motion-safe:[animation:brc-ball-x_2s_.2s_cubic-bezier(.3,.15,.5,1)_forwards]">
          <span className="block motion-safe:[animation:brc-ball-y_2s_.2s_both]">
            <span className="block size-[26px] motion-safe:[animation:brc-spin_2s_.2s_linear_both]">
              <Ball />
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

export function RuleStrip({ bonus }: { bonus: string }) {
  return (
    <section
      aria-label="La règle du club"
      className="flex flex-col gap-1 rounded-card border border-border bg-card px-4 pt-3.5 pb-3 lg:flex-row lg:items-end lg:gap-8 lg:px-6"
    >
      <div className="flex shrink-0 items-end gap-2.5">
        <b className="font-numeral text-[56px] leading-[0.8] font-black text-cost motion-safe:animate-float">5</b>
        <span className="flex flex-col pb-0.5">
          <span className="font-display text-sm leading-tight">pompes par défaite</span>
          <small className="text-xs text-muted-foreground">{bonus}</small>
        </span>
      </div>
      <KickoffScene />
    </section>
  );
}
