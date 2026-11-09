import { cn } from 'cn';
import type { CSSProperties, ReactNode } from 'react';
import type { SeasonPeak } from '../../lib/contract';
import { formatNumber } from '../../lib/format';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../components/ui/item';
import { Progress } from '../components/ui/progress';
import { climbOf, type RankStep } from './ladder';
import { rankLightRgb, rankRgb, shortRankLabel, splitRankLabel } from './stats';

/** What a card needs to know about a rank: the API's doubles rank or solo rank, or nothing read yet. */
export interface CardRank {
  mmr: number | null;
  label: string;
  tier: number | null;
  peak: SeasonPeak | null;
  /** Placement matches played while the season's ten are not done; null once placed. */
  placements: number | null;
}

/** The season's ten placement matches, each account plays them before it gets a division. */
const placementMatches = 10;

const rankIcon = (tier: number | null) => `/rocket-league/ranks/${tier ?? 0}.png`;

/** Shared by the rank's row and its season peak's: icon, words, figure, on one line. */
const row = 'flex-nowrap gap-3 rounded-none border-0 p-0 [line-height:normal]';
const media = 'w-10 translate-y-0 self-center';
const words = 'min-w-0 *:w-full *:truncate';

/** One account's rank on a player card: its icon, name, division and MMR, the way to the next rank, its season peak. */
export function RankBlock({
  kind,
  icon,
  rank,
  ringed = false,
  climbing = false,
}: {
  kind: 'Solo' | 'Duo';
  icon: ReactNode;
  /** Null when the player named no account of this kind. */
  rank: CardRank | null;
  /** The duo rank stands out: it is the one the club plays. */
  ringed?: boolean;
  /** Shows how far the rating is from the next rank. */
  climbing?: boolean;
}) {
  const rgb = rankRgb(rank?.tier);
  const { rank: name, division: placed } = rank
    ? splitRankLabel(rank.label)
    : { rank: 'Pas de compte solo', division: '' };
  const division = rank?.placements != null ? `Placement · ${rank.placements}/${placementMatches}` : placed;
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
      <Item className={row}>
        <ItemMedia className={media}>
          <img
            src={rankIcon(rank?.tier ?? null)}
            alt={`Icône de rank ${kind.toLowerCase()} ${name}`}
            width={40}
            height={40}
            className={cn('size-10 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.4)]', !rank && 'opacity-40')}
          />
        </ItemMedia>
        <ItemContent className={cn(words, 'gap-[3px]')}>
          <span className="label-caps flex items-center gap-[5px]">
            {icon}
            {kind}
          </span>
          <ItemTitle className="font-semibold text-[14px] text-t1 tracking-[-.01em] [line-height:normal]">
            {name}
          </ItemTitle>
          {division && (
            <ItemDescription className="text-[12px] text-t2 [line-height:normal]">{division}</ItemDescription>
          )}
        </ItemContent>
        {rank?.mmr != null && (
          <ItemActions>
            <b className="num text-[28px] [line-height:.8]">{formatNumber(rank.mmr)}</b>
          </ItemActions>
        )}
      </Item>
      {climbing && rank?.tier && rank.mmr !== null && <RankClimb tier={rank.tier} mmr={rank.mmr} />}
      {rank?.peak && (
        <Item className={cn(row, 'border-line border-t-[.5px] pt-2.5')}>
          <ItemMedia className={media}>
            <img src={rankIcon(rank.peak.tier)} alt="" width={24} height={24} className="size-6 object-contain" />
          </ItemMedia>
          <ItemContent className={cn(words, 'gap-0.5')}>
            <ItemTitle className="label-caps font-semibold text-[10px] [line-height:normal]">Peak saison</ItemTitle>
            <ItemDescription className="text-[11px] text-t3 [line-height:normal]">
              {shortRankLabel(rank.peak.label)}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <b className="num text-[15px] text-t2 [line-height:1]">{formatNumber(rank.peak.mmr)}</b>
          </ItemActions>
        </Item>
      )}
    </div>
  );
}

/** A bar in the rank's colour, from the MMR that wins the rank to the one that wins the next, under the rank's words. */
function RankClimb({ tier, mmr }: { tier: number; mmr: number }) {
  const climb = climbOf(tier, mmr);
  if (!climb?.next) return null;
  const { current, next, left, percent } = climb;
  return (
    <Progress
      value={percent}
      aria-label={`Vers ${next.name}`}
      style={{ '--rank': rankLightRgb(tier) } as CSSProperties}
      className="flex-col-reverse gap-[7px] pt-0.5 pl-[52px] [&_[data-slot=progress-indicator]]:min-w-[4%] [&_[data-slot=progress-indicator]]:origin-left [&_[data-slot=progress-indicator]]:animate-grow [&_[data-slot=progress-indicator]]:rounded-[3px] [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,rgba(var(--rank),.55),rgb(var(--rank)))] [&_[data-slot=progress-indicator]]:shadow-[0_0_10px_rgba(var(--rank),.55)] [&_[data-slot=progress-track]]:h-[5px] [&_[data-slot=progress-track]]:rounded-[3px] [&_[data-slot=progress-track]]:bg-white/9"
    >
      <div className="flex w-full items-baseline justify-between gap-2 whitespace-nowrap text-[11px] text-t3 tabular-nums">
        <ClimbEnd step={current} />
        <span>
          Encore <b className="num text-[15px] text-[rgb(var(--rank))]">{formatNumber(left)}</b> MMR
        </span>
        <ClimbEnd step={next} named />
      </div>
    </Progress>
  );
}

/** One end of the bar: a rank's icon and the MMR that wins it; the next rank's icon is named, the current one's is not. */
function ClimbEnd({ step, named = false }: { step: RankStep; named?: boolean }) {
  // Centred on the figures' capital height rather than on the line, which sits lower.
  const icon = (
    <img
      src={rankIcon(step.tier)}
      alt={named ? step.name : ''}
      title={named ? step.name : undefined}
      width={16}
      height={16}
      className={cn('inline-block size-4 object-contain align-[calc(.5cap_-_8px)]', named ? 'ml-1' : 'mr-1')}
    />
  );
  const mmr = <span className="num font-semibold text-[12px]">{formatNumber(step.mmr)}</span>;
  return (
    <span className="min-w-0">
      {named ? (
        <>
          {mmr}
          {icon}
        </>
      ) : (
        <>
          {icon}
          {mmr}
        </>
      )}
    </span>
  );
}
