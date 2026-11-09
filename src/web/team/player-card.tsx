import { cn } from 'cn';
import type { CSSProperties, PointerEvent } from 'react';
import { formatAge, formatNumber } from '../../lib/format';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { DuoIcon, RefreshIcon, SoloIcon } from '../shell/icons';
import { StreakCount } from './debt-hero';
import { type CardRank, RankBlock } from './rank-block';
import { type Debt, litSegments, rankRgb } from './stats';

export interface CardPlayer {
  name: string;
  me: boolean;
  platform: string | null;
  streak: number;
  debt: Debt;
  /** Null when the player named no solo account. */
  solo: CardRank | null;
  duo: CardRank;
  /** The player's colour: their highest current rank. */
  tier: number | null;
  /** When the latest rank was read, or null if none was. */
  updated: string | null;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The card leans toward a mouse pointer, and its rim and sheen follow it. */
function tilt(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse' || reduceMotion()) return;
  const card = event.currentTarget;
  const box = card.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;
  card.style.transition = 'transform .3s var(--ease)';
  card.style.transform = `perspective(1200px) rotateX(${((0.5 - y) * 4).toFixed(2)}deg) rotateY(${((x - 0.5) * 5).toFixed(2)}deg)`;
  card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  card.style.setProperty('--ang', `${((Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 90).toFixed(1)}deg`);
}

function untilt(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget;
  card.style.transition = '';
  card.style.transform = '';
  for (const property of ['--mx', '--my', '--ang']) card.style.removeProperty(property);
}

const debtSegments = 20;

/**
 * The debt in twenty segments, lit by whole segments, in orange while pushups are owed and green once paid. The
 * track is a little wider than the card so that the last gap falls outside; the glow sits outside the cut-out track.
 */
const debtGauge =
  '[filter:drop-shadow(0_0_6px_color-mix(in_srgb,var(--debt)_45%,transparent))] [&_[data-slot=progress-track]]:h-[7px] [&_[data-slot=progress-track]]:w-[calc(100%+2px)] [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-white/8 [&_[data-slot=progress-track]]:[mask:repeating-linear-gradient(90deg,#000_0_calc(5%_-_2px),transparent_calc(5%_-_2px)_5%)] [&_[data-slot=progress-indicator]]:w-(--lit)! [&_[data-slot=progress-indicator]]:origin-left [&_[data-slot=progress-indicator]]:animate-grow [&_[data-slot=progress-indicator]]:bg-transparent [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--debt)_45%,transparent),var(--debt))]';

/** A player's card: who they are, their solo and duo ranks, what they still owe, and when their rank was read. */
export function PlayerCard({ player, active, now }: { player: CardPlayer; active: boolean; now: number }) {
  const rgb = rankRgb(player.tier);
  const { left, paid, owed, percent } = player.debt;
  return (
    <Card
      data-active={active || undefined}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      className={cn(
        'player-card h-full gap-0 rounded-[26px] bg-transparent py-0 text-[16px] ring-0 [line-height:normal]',
        !active && 'max-lg:scale-94 max-lg:opacity-55',
      )}
    >
      <i
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-1"
        style={{ background: `radial-gradient(130% 60% at 50% -12%, rgba(${rgb},.28), rgba(${rgb},0) 62%)` }}
      />
      <i aria-hidden="true" className="player-card-holo pointer-events-none absolute inset-0 z-2" />
      <i aria-hidden="true" className="player-card-glint pointer-events-none absolute inset-0 z-3" />
      <div className="relative z-4 flex flex-1 flex-col gap-5 px-5 pt-5 pb-[18px]">
        <CardHeader className="flex items-start justify-between gap-2.5 p-0">
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="flex items-center gap-2">
              <CardTitle className="whitespace-nowrap font-sans font-semibold text-[17px] tracking-[-.01em] [line-height:normal]">
                {player.name}
              </CardTitle>
              {player.me && <Badge variant="tag">TOI</Badge>}
            </span>
            {player.platform && <span className="text-[12px] text-t3">{player.platform}</span>}
          </span>
          <StreakCount streak={player.streak} large />
        </CardHeader>

        <CardContent className="flex flex-col gap-2 p-0">
          <RankBlock kind="Solo" icon={<SoloIcon />} rank={player.solo} climbing />
          <RankBlock kind="Duo" icon={<DuoIcon />} rank={player.duo} ringed />
        </CardContent>

        {/* On a computer the cards share the row's height: the debt goes to the foot of each. */}
        <div
          className="flex flex-col gap-[9px] lg:mt-auto"
          style={{ '--debt': left > 0 ? 'var(--cost-strong)' : 'var(--win)' } as CSSProperties}
        >
          <div className="flex w-full items-baseline justify-between">
            <span className="flex items-baseline gap-1.5">
              <b className={cn('num text-[24px] [line-height:1]', left > 0 ? 'text-cost' : 'text-win')}>
                {formatNumber(left)}
              </b>
              <span className="text-[13px] text-t2">{left > 0 ? 'pompes restantes' : 'pompes restantes, GG'}</span>
            </span>
            <b className="num text-[14px] text-t1">{percent} %</b>
          </div>
          <Progress
            value={percent}
            aria-label={`Dette de ${player.name}`}
            style={{ '--lit': `${litSegments(percent, debtSegments) * (100 / debtSegments)}%` } as CSSProperties}
            className={debtGauge}
          />
          <span className="text-[11px] text-t3 tabular-nums">
            {formatNumber(paid)} / {formatNumber(owed)} remboursées
          </span>
        </div>

        <CardFooter className="gap-1.5 rounded-none border-0 bg-transparent p-0 text-[11px] text-t3">
          <RefreshIcon />
          <span>{player.updated ? `Actualisé ${formatAge(player.updated, now)}` : 'Rang pas encore relevé'}</span>
        </CardFooter>
      </div>
    </Card>
  );
}
