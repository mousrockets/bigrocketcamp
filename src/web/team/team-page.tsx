import { cn } from 'cn';
import { defaultLastPlaceRules, parisDay, summarize } from '../../lib/domain';
import { type Board, useBoardState } from '../board';
import { epicNotice } from '../brand/epic-notice';
import { platformLabels, useClub } from '../club';
import { ClubBadge } from '../shell/club-badge';
import { DebtHero } from './debt-hero';
import type { CardPlayer, CardRank } from './player-card';
import { currentStreak, debtOf, highestTier, isLive, latest, receptionLabel } from './stats';
import { TeamCarousel } from './team-carousel';
import { useNow } from './use-now';

const noRank: CardRank = { mmr: null, label: 'Rang pas encore relevé', tier: null, peak: null };

/** Every player's card, the member's first. */
function cardPlayers(
  board: Board,
  roster: readonly string[],
  me: string | null,
  platforms: Map<string, string | null>,
) {
  const day = parisDay();
  const stats = summarize(
    roster,
    board.results,
    board.exercises,
    day,
    board.matchRosters ?? [],
    board.rules?.lastPlace ?? defaultLastPlaceRules,
  );
  const players = stats.map((stat): CardPlayer => {
    const ranks = board.doublesRanks?.find((rank) => rank.player === stat.name);
    const solo = ranks?.solo ?? null;
    const unreadable = solo && (solo.status === 'not_found' || solo.status === 'needs_player_id');
    const days = new Set(board.exercises.filter((exercise) => exercise.player === stat.name).map((e) => e.day));
    return {
      name: stat.name,
      me: stat.name === me,
      platform: platforms.get(stat.name) ?? null,
      streak: currentStreak(days, day),
      debt: debtOf(stat),
      solo: solo && {
        mmr: unreadable ? null : solo.mmr,
        label: unreadable ? 'Compte solo introuvable' : solo.label,
        tier: unreadable ? null : solo.tier,
        peak: solo.peak,
      },
      duo: ranks ? { mmr: ranks.mmr, label: ranks.label, tier: ranks.tier, peak: ranks.peak ?? null } : noRank,
      tier: highestTier(ranks?.tier, unreadable ? null : solo?.tier),
      updated: latest(ranks?.fetchedAt, solo?.fetchedAt),
    };
  });
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

export function TeamPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const me = club.me.duoPseudo;
  const platforms = new Map(
    club.players.map((player) => [player.slot, player.platform ? platformLabels[player.platform] : null]),
  );
  const players = board ? cardPlayers(board, club.roster, me, platforms) : [];
  const mine = players.find((player) => player.me);

  return (
    <main className="relative flex min-h-dvh flex-col pt-[max(60px,calc(env(safe-area-inset-top)+12px))] pb-[120px] lg:px-[clamp(20px,5vw,72px)] lg:pt-11 lg:pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(90%_60%_at_50%_-12%,rgba(70,120,220,.16),rgba(0,0,0,0)_70%)] lg:h-[440px] lg:bg-[radial-gradient(60%_70%_at_30%_-15%,rgba(70,120,220,.13),rgba(0,0,0,0)_70%)]"
      />
      <div className="relative flex w-full flex-col lg:mx-auto lg:max-w-[1060px] lg:gap-14">
        <header className="flex h-[31px] animate-rise items-center justify-between px-5 lg:h-auto lg:px-0">
          <ClubBadge className="lg:hidden" />
          <h1 className="title-display hidden text-[28px] lg:block">L’équipe</h1>
          <span className="flex items-center gap-[18px] text-[13px] text-t2">
            <LiveStatus lastReceived={board?.collectors[0]?.last_seen ?? null} />
          </span>
        </header>

        {error && !board && <p className="m-0 px-5 pt-10 text-[15px] text-t2 lg:px-0 lg:pt-0">{error}</p>}
        {mine && <DebtHero debt={mine.debt} streak={mine.streak} />}
        {players.length > 0 && <TeamCarousel players={players} />}

        <p className="mx-6 mt-10 mb-0 text-center text-[11px] text-t3 [line-height:1.5] lg:m-0 lg:text-left lg:[line-height:normal]">
          {epicNotice}
        </p>
      </div>
    </main>
  );
}

/**
 * "Direct", with a red dot that breathes, while someone plays and their collector sends matches; beside it, or alone
 * on a phone once nobody plays, when the last match came in.
 */
function LiveStatus({ lastReceived }: { lastReceived: string | null }) {
  const now = useNow(30_000);
  const live = isLive(lastReceived, now);
  return (
    <>
      {live && (
        <span className="flex items-center gap-1.5 font-medium text-[12px] lg:font-normal lg:text-[13px]">
          <i aria-hidden="true" className="size-1.5 animate-breathe rounded-full bg-[#ff453a]" />
          Direct
        </span>
      )}
      <span className={cn('text-[12px] lg:inline lg:text-[13px]', live && 'hidden')}>
        {receptionLabel(lastReceived, now)}
      </span>
    </>
  );
}
