import { useNavigate, useSearch } from '@tanstack/react-router';
import type { DoublesRank } from '../../lib/contract';
import { parisDay } from '../../lib/days';
import { type Board, playerStats, useBoardState } from '../board';
import { platformLabels, useClub } from '../club';
import { BoardPending } from '../components/board-pending';
import { epicNotice } from '../components/epic-notice';
import { LiveStatus } from '../components/live-status';
import { Skeleton } from '../components/ui/skeleton';
import { ClubBadge } from '../shell/club-badge';
import { DebtHero } from './debt-hero';
import { ratingOnLadder } from './ladder';
import type { CardPlayer } from './player-card';
import { PlayerSheet } from './player-sheet';
import type { CardRank } from './rank-block';
import { currentStreak, debtOf, highestTier, latest } from './stats';
import { TeamCarousel } from './team-carousel';

const noRank: CardRank = { mmr: null, label: 'Rang pas encore relevé', tier: null, peak: null, placements: null };

/** A best rating set by hand came without its rank: the ladder gives it one. */
const allTimeOf = ({ best, bestRank }: Pick<DoublesRank, 'best' | 'bestRank'>) =>
  bestRank ?? (best == null ? null : ratingOnLadder(best));

/** Every player's card, the member's first. */
function cardPlayers(
  board: Board,
  roster: readonly string[],
  me: string | null,
  platforms: Map<string, string | null>,
) {
  const day = parisDay();
  const stats = playerStats(board, roster);
  const players = stats.map((stat): CardPlayer => {
    const ranks = board.doublesRanks?.find((rank) => rank.player === stat.name);
    const solo = ranks?.solo ?? null;
    const unreadable = solo && (solo.status === 'not_found' || solo.status === 'needs_player_id');
    const days = new Set(board.exercises.filter((exercise) => exercise.player === stat.name).map((e) => e.day));
    return {
      name: stat.name,
      position: roster.indexOf(stat.name),
      me: stat.name === me,
      platform: platforms.get(stat.name) ?? null,
      streak: currentStreak(days, day),
      debt: debtOf(stat),
      solo: solo && {
        mmr: unreadable ? null : solo.mmr,
        label: unreadable ? 'Compte solo introuvable' : solo.label,
        tier: unreadable ? null : solo.tier,
        peak: solo.peak,
        allTime: allTimeOf(solo),
        placements: unreadable ? null : solo.placements,
      },
      duo: ranks
        ? {
            mmr: ranks.mmr,
            label: ranks.label,
            tier: ranks.tier,
            peak: ranks.peak ?? null,
            allTime: allTimeOf(ranks),
            placements: ranks.placements,
          }
        : noRank,
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
  // `?fiche=2` opens the sheet of the roster's third player: a pseudo stays out of the address.
  const { fiche } = useSearch({ strict: false });
  const navigate = useNavigate();
  const shown = typeof fiche === 'number' ? (club.roster[fiche] ?? null) : null;

  return (
    <main className="relative flex min-h-dvh flex-col pt-[max(60px,calc(env(safe-area-inset-top)+12px))] pb-[120px] lg:px-[clamp(20px,5vw,72px)] lg:pt-11 lg:pb-16">
      <div
        aria-hidden="true"
        className="top-glow pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(90%_60%_at_50%_-12%,rgba(70,120,220,.16),rgba(0,0,0,0)_70%)] lg:h-[440px] lg:bg-[radial-gradient(60%_70%_at_30%_-15%,rgba(70,120,220,.13),rgba(0,0,0,0)_70%)]"
      />
      <div className="relative flex w-full flex-col lg:mx-auto lg:max-w-[1060px] lg:gap-14">
        <header className="flex h-[31px] animate-rise items-center justify-between px-5 lg:h-auto lg:px-0">
          <ClubBadge className="lg:hidden" />
          <h1 className="title-display hidden text-[28px] lg:block">L’équipe</h1>
          <span className="flex items-center gap-[18px] text-[13px] text-t2">
            <LiveStatus lastReceived={board?.collectors[0]?.last_seen ?? null} />
          </span>
        </header>

        {!board && <TeamPending error={error} />}
        {mine && <DebtHero debt={mine.debt} streak={mine.streak} />}
        {players.length > 0 && <TeamCarousel players={players} />}
        <PlayerSheet
          name={shown}
          onClose={() =>
            void navigate({ to: '.', search: (previous) => ({ ...previous, fiche: undefined }), resetScroll: false })
          }
        />

        <p className="mx-6 mt-10 mb-0 text-center text-[11px] text-t3 [line-height:1.5] lg:m-0 lg:text-left lg:[line-height:normal]">
          {epicNotice}
        </p>
      </div>
    </main>
  );
}

/** The member's debt and the players' cards, still to come. */
function TeamPending({ error }: { error: string }) {
  return (
    <BoardPending error={error} className="flex flex-col lg:gap-14">
      <div className="flex flex-col gap-4 px-5 py-10 lg:max-w-[600px] lg:p-0">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-[82px] w-40 lg:h-[100px] lg:w-52" />
        <Skeleton className="h-2 rounded-[2px]" />
      </div>
      <div className="flex flex-col gap-4 lg:gap-5">
        <Skeleton className="mx-5 h-[22px] w-28 lg:mx-0" />
        {/* On a phone, the first card sits in the middle, as the carousel centres it. */}
        <div className="flex gap-3 overflow-hidden pt-1 max-lg:pl-[calc(50vw-min(159px,50vw-36px))] lg:gap-4 lg:px-0.5">
          {['first', 'second', 'third'].map((card) => (
            <Skeleton
              key={card}
              className="h-[400px] w-[min(318px,calc(100vw-72px))] shrink-0 rounded-[26px] lg:w-[336px]"
            />
          ))}
        </div>
      </div>
    </BoardPending>
  );
}
