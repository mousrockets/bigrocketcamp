import { cn } from 'cn';
import type { ReactNode } from 'react';
import { formatNumber } from '../../lib/format';
import type { SeasonPeak } from '../board';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../components/ui/item';
import { rankRgb, shortRankLabel, splitRankLabel } from './stats';

/** What a card needs to know about a rank: the API's doubles rank or solo rank, or nothing read yet. */
export interface CardRank {
  mmr: number | null;
  label: string;
  tier: number | null;
  peak: SeasonPeak | null;
}

const rankIcon = (tier: number | null) => `/rocket-league/ranks/${tier ?? 0}.png`;

/** Shared by the rank's row and its season peak's: icon, words, figure, on one line. */
const row = 'flex-nowrap gap-3 rounded-none border-0 p-0 [line-height:normal]';
const media = 'w-10 translate-y-0 self-center';
const words = 'min-w-0 *:w-full *:truncate';

/** One account's rank on a player card: its icon, name, division and MMR, then its season peak. */
export function RankBlock({
  kind,
  icon,
  rank,
  ringed = false,
}: {
  kind: 'Solo' | 'Duo';
  icon: ReactNode;
  /** Null when the player named no account of this kind. */
  rank: CardRank | null;
  /** The duo rank stands out: it is the one the club plays. */
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
