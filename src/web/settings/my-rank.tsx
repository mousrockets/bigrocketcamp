import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { highestTier, rankRgb, splitRankLabel } from '../team/stats';

// The member as Réglages shows them: the icon of their highest current rank, in its colour.

export interface MyRank {
  tier: number | null;
  /** "Grand Champion I en solo · Champion III en duo". */
  summary: string;
}

/** The member's current ranks, from the board; nothing read yet until the rank source has answered. */
export function useMyRank(): MyRank {
  const { me } = useClub();
  const { board } = useBoardState();
  const ranks = board?.doublesRanks?.find((rank) => rank.player === me.duoPseudo);
  const solo =
    ranks?.solo && ranks.solo.status !== 'not_found' && ranks.solo.status !== 'needs_player_id' ? ranks.solo : null;
  const parts = [
    solo?.tier ? `${splitRankLabel(solo.label).rank} en solo` : null,
    ranks?.tier ? `${splitRankLabel(ranks.label).rank} en duo` : null,
  ].filter(Boolean);
  return {
    tier: highestTier(ranks?.tier, solo?.tier),
    summary: parts.length > 0 ? parts.join(' · ') : 'Rang pas encore relevé',
  };
}

/** A round tile lit in the rank's colour, with the rank's icon; the account screen's is bigger and glows. */
export function RankAvatar({ tier, large = false }: { tier: number | null; large?: boolean }) {
  const rgb = rankRgb(tier);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        large
          ? 'size-[88px] bg-[radial-gradient(circle_at_50%_30%,rgba(var(--rank),.6),rgba(var(--rank),.12))] shadow-[inset_0_.5px_0_rgba(255,255,255,.3),inset_0_0_0_.5px_rgba(255,255,255,.12),0_16px_40px_-12px_rgba(var(--rank),.6)]'
          : 'size-14 bg-[radial-gradient(circle_at_50%_30%,rgba(var(--rank),.55),rgba(var(--rank),.12))] shadow-[inset_0_.5px_0_rgba(255,255,255,.3),inset_0_0_0_.5px_rgba(255,255,255,.12)]',
      )}
      style={{ '--rank': rgb } as CSSProperties}
    >
      <img
        src={`/rocket-league/ranks/${tier ?? 0}.png`}
        alt=""
        width={large ? 62 : 40}
        height={large ? 62 : 40}
        className={cn('object-contain', large ? 'size-[62px]' : 'size-10')}
      />
    </span>
  );
}
