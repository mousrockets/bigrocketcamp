import { cn } from 'cn';
import type { PointerEvent, ReactNode } from 'react';
import type { SeasonPeak } from '../board';
import { DuoIcon, RefreshIcon, SoloIcon } from '../shell/icons';
import { StreakCount } from './debt-hero';
import { type Debt, figure, rankRgb, readingAge, shortRankLabel, splitRankLabel } from './stats';

/** What a card needs to know about a rank: the API's doubles rank or solo rank, or nothing read yet. */
export interface CardRank {
  mmr: number | null;
  label: string;
  tier: number | null;
  peak: SeasonPeak | null;
}

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

export function PlayerCard({ player, active, now }: { player: CardPlayer; active: boolean; now: number }) {
  const rgb = rankRgb(player.tier);
  const { left, paid, owed, percent } = player.debt;
  const mmr = player.duo.mmr === null ? '' : `, ${figure(player.duo.mmr)} MMR`;
  return (
    <article
      aria-label={`${player.name}, ${player.duo.label.replace(' · ', ' ')}${mmr}`}
      data-active={active || undefined}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      className={cn('player-card flex-[0_0_var(--cw)] snap-center', !active && 'max-lg:scale-94 max-lg:opacity-55')}
    >
      <i
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-1"
        style={{ background: `radial-gradient(130% 60% at 50% -12%, rgba(${rgb},.28), rgba(${rgb},0) 62%)` }}
      />
      <i aria-hidden="true" className="player-card-holo pointer-events-none absolute inset-0 z-2" />
      <i aria-hidden="true" className="player-card-glint pointer-events-none absolute inset-0 z-3" />
      <div className="relative z-4 flex flex-col gap-5 px-5 pt-5 pb-[18px]">
        <div className="flex items-start justify-between gap-2.5">
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="flex items-center gap-2">
              <b className="whitespace-nowrap font-semibold text-[17px] tracking-[-.01em]">{player.name}</b>
              {player.me && (
                <span className="rounded-md border border-line px-1.5 py-0.5 font-semibold text-[10px] text-t2 tracking-[.06em]">
                  TOI
                </span>
              )}
            </span>
            {player.platform && <span className="text-[12px] text-t3">{player.platform}</span>}
          </span>
          <StreakCount streak={player.streak} large />
        </div>

        <div className="flex flex-col gap-2">
          <RankBlock kind="Solo" icon={<SoloIcon />} rank={player.solo} />
          <RankBlock kind="Duo" icon={<DuoIcon />} rank={player.duo} ringed />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="flex items-baseline gap-1.5">
              <b className={cn('num text-[24px] [line-height:1]', left > 0 ? 'text-cost' : 'text-win')}>
                {figure(left)}
              </b>
              <span className="text-[13px] text-t2">{left > 0 ? 'pompes restantes' : 'pompes restantes, GG'}</span>
            </span>
            <span className="text-[12px] text-t3 tabular-nums">
              {figure(paid)} / {figure(owed)}
            </span>
          </div>
          <div aria-hidden="true" className="h-[3px] overflow-hidden rounded-[2px] bg-white/8">
            <i
              className={cn(
                'block h-full origin-left animate-grow rounded-[2px]',
                left > 0 ? 'bg-cost-strong' : 'bg-win',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-t3">
          <RefreshIcon />
          <span>{player.updated ? `Actualisé ${readingAge(player.updated, now)}` : 'Rang pas encore relevé'}</span>
        </div>
      </div>
    </article>
  );
}

const rankIcon = (tier: number | null) => `/rocket-league/ranks/${tier ?? 0}.png`;

function RankBlock({
  kind,
  icon,
  rank,
  ringed = false,
}: {
  kind: 'Solo' | 'Duo';
  icon: ReactNode;
  rank: CardRank | null;
  ringed?: boolean;
}) {
  const rgb = rankRgb(rank?.tier);
  const { rank: name, division } = rank ? splitRankLabel(rank.label) : { rank: 'Pas de compte solo', division: '' };
  return (
    <div
      className="flex flex-col gap-2.5 rounded-2xl p-3"
      style={{
        background: `radial-gradient(120% 100% at 0% 0%, rgba(${rgb},.16), rgba(${rgb},0) 62%), rgba(255,255,255,.04)`,
        boxShadow: ringed
          ? `inset 0 0 0 1px rgba(${rgb},.42), inset 0 1px 0 rgba(255,255,255,.10), 0 8px 24px -12px rgba(${rgb},.55)`
          : 'inset 0 0 0 .5px rgba(255,255,255,.07), inset 0 1px 0 rgba(255,255,255,.05)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="flex w-10 shrink-0 justify-center">
          <img
            src={rankIcon(rank?.tier ?? null)}
            alt={`Icône de rank ${kind.toLowerCase()} ${name}`}
            width={40}
            height={40}
            className={cn('size-10 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.4)]', !rank && 'opacity-40')}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px] *:truncate">
          <span className="label-caps flex items-center gap-[5px]">
            {icon}
            {kind}
          </span>
          <b className="font-semibold text-[14px] tracking-[-.01em]">{name}</b>
          {division && <span className="text-[12px] text-t2">{division}</span>}
        </span>
        {rank?.mmr != null && (
          <span className="flex shrink-0 flex-col items-end">
            <b className="num text-[28px] [line-height:.8]">{figure(rank.mmr)}</b>
          </span>
        )}
      </div>
      {rank?.peak && (
        <div className="flex items-center gap-3 border-line border-t-[.5px] pt-2.5">
          <span className="flex w-10 shrink-0 justify-center">
            <img src={rankIcon(rank.peak.tier)} alt="" width={24} height={24} className="size-6 object-contain" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 *:truncate">
            <span className="label-caps text-[10px]">Peak saison</span>
            <span className="text-[11px] text-t3">{shortRankLabel(rank.peak.label)}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <b className="num text-[15px] text-t2 [line-height:1]">{figure(rank.peak.mmr)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
