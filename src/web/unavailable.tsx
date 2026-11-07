import { useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { useState } from 'react';
import { Button } from './components/ui/button';
import { clubQuery } from './queries';

// The club cannot be reached: an empty pitch, and a way to try again before the app does it on its own.

/** The empty pitch, its ball drifting: the design draws it 220 × 130 on a phone and 320 × 180 on a wide screen. */
function EmptyPitch({ wide, className }: { wide?: boolean; className?: string }) {
  const p = wide
    ? {
        w: 320,
        h: 180,
        inset: 6,
        rx: 44,
        r: 36,
        goal: [62, 8, 56, 3] as const,
        ball: 12,
        dash: 'M114 90H96M224 90h-18',
        gap: '2 6',
      }
    : {
        w: 220,
        h: 130,
        inset: 4,
        rx: 30,
        r: 26,
        goal: [45, 6, 40, 2] as const,
        ball: 9,
        dash: 'M76 65h-14M158 65h-14',
        gap: '2 5',
      };
  const [goalY, goalW, goalH, goalR] = p.goal;
  const cx = p.w / 2;
  const cy = p.h / 2;
  return (
    <svg
      role="img"
      aria-label="Terrain vide"
      width={wide ? '100%' : p.w}
      height={p.h}
      viewBox={`0 0 ${p.w} ${p.h}`}
      className={cn(wide && 'max-w-[320px]', className)}
    >
      <g className="stroke-track" fill="none" strokeWidth="2">
        <rect x={p.inset} y={p.inset} width={p.w - 2 * p.inset} height={p.h - 2 * p.inset} rx={p.rx} />
        <path d={`M${cx} ${p.inset}v${p.h - 2 * p.inset}`} />
        <circle cx={cx} cy={cy} r={p.r} />
      </g>
      <rect className="fill-track" x="0" y={goalY} width={goalW} height={goalH} rx={goalR} />
      <rect className="fill-track" x={p.w - goalW} y={goalY} width={goalW} height={goalH} rx={goalR} />
      <g className={cn('animate-drift', wide && '[--drift:8px]')}>
        <circle className="fill-foreground" cx={cx} cy={cy} r={p.ball} />
        <path className="stroke-live" d={p.dash} strokeWidth="2" strokeLinecap="round" strokeDasharray={p.gap} />
      </g>
    </svg>
  );
}

/** Shown when the club does not answer; the app keeps trying behind it. */
export function Unavailable() {
  const queryClient = useQueryClient();
  const [trying, setTrying] = useState(false);
  // On a phone the design places the block 210 px from the top of an 844 px screen whose first 44 px are the status
  // bar, and the button 48 px from the bottom; a wide screen centres them in one column.
  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),48px)] text-foreground lg:items-center lg:justify-center lg:px-5 lg:py-12">
      <div className="flex flex-1 flex-col items-center gap-[18px] pt-[166px] text-center lg:w-full lg:max-w-[520px] lg:flex-none lg:pt-0">
        <EmptyPitch className="lg:hidden" />
        <EmptyPitch wide className="hidden lg:block" />
        <span className="kicker text-destructive">Hors ligne</span>
        <h1 className="font-display text-4xl leading-none lg:text-5xl lg:leading-none">Lag de l’extrême</h1>
        <p className="text-[15px] leading-[1.45] text-balance text-soft lg:text-base lg:leading-[1.5] lg:text-wrap">
          Le club ne répond plus. Pas de panique, l’app réessaie toute seule. Profites-en pour faire quelques pompes.
        </p>
        <p role="status" className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground lg:mt-0">
          <svg
            aria-hidden="true"
            className="animate-spin"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          Nouvelle tentative dès que le réseau revient
        </p>
      </div>
      <Button
        variant="outline"
        size="xl"
        disabled={trying}
        onClick={async () => {
          setTrying(true);
          await queryClient.refetchQueries(clubQuery).catch(() => undefined);
          setTrying(false);
        }}
        // The design's wide .btn2 is 52 px inside its 1 px edge: 54 in all.
        className="w-full lg:mt-[26px] lg:h-[54px] lg:w-auto lg:px-7"
      >
        {trying ? 'Connexion…' : 'Relancer maintenant'}
      </Button>
    </main>
  );
}
