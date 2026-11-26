import type { Board } from '../board';
import { type Career, type CareerAccount, type CareerScope, careerOf, seasonOf } from './career';
import { highestTier } from './stats';

// The Stats page: each player's career over one season (or every match), then, stat by stat, who leads.

/** The seasons with at least one match of the club, the newest first. */
export function seasonsPlayed(board: Board, roster: readonly string[]): number[] {
  const players = new Set(roster);
  const seasons = new Set(
    board.results
      .filter((row) => row.kind === 'match' && players.has(row.name))
      .map(seasonOf)
      .filter((season) => season !== null),
  );
  return [...seasons].sort((a, b) => b - a);
}

/** A player, as the page compares them. */
export interface ComparedPlayer {
  name: string;
  me: boolean;
  /** Their highest current rank, solo or duo, which gives them their colour. */
  tier: number | null;
  career: Career;
}

/** Every player of the roster, the member first, over the matches chosen. */
export function comparedPlayers(
  board: Board,
  roster: readonly string[],
  me: string | null,
  scope: CareerScope,
  account: CareerAccount,
  season: number | null,
): ComparedPlayer[] {
  const players = roster.map((name): ComparedPlayer => {
    const ranks = board.doublesRanks?.find((rank) => rank.player === name);
    return {
      name,
      me: name === me,
      tier: highestTier(ranks?.tier, ranks?.solo?.tier),
      career: careerOf(board, name, scope, account, season),
    };
  });
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

/** How a stat is read: a share of the matches, an average per match, or a plain count. */
export type StatFormat = 'percent' | 'perMatch' | 'count';

export interface Stat {
  label: string;
  format: StatFormat;
  /** The player's figure, or null when they have none to compare (no match, or a count no source sent). */
  value: (career: Career) => number | null;
}

const share = (count: number, career: Career) => (career.matches === 0 ? null : (count / career.matches) * 100);
const average = (total: number | null, career: Career) =>
  career.matches === 0 || total === null ? null : total / career.matches;

export const winRate: Stat = {
  label: '% de victoires',
  format: 'percent',
  value: (career) => share(career.wins, career),
};

const tournamentsWon: Stat = { label: 'Tournois gagnés', format: 'count', value: (career) => career.tournamentsWon };
const perMatch: Stat[] = [
  { label: 'Buts / match', format: 'perMatch', value: (career) => average(career.goals, career) },
  { label: 'Passes D / match', format: 'perMatch', value: (career) => average(career.assists, career) },
  { label: 'Arrêts / match', format: 'perMatch', value: (career) => average(career.saves, career) },
  { label: 'Taux de MVP', format: 'percent', value: (career) => share(career.mvps, career) },
];
const matchOnly: Stat[] = [
  { label: 'Démos / match', format: 'perMatch', value: (career) => average(career.demos, career) },
  { label: 'Win streak max', format: 'count', value: (career) => (career.matches ? career.winStreak : null) },
];

/** What each mode compares, below the share of wins: a tournament has no demos counted, and its own trophies. */
export const statsOf = (scope: CareerScope): Stat[] =>
  scope === 'tournament' ? [tournamentsWon, ...perMatch] : [...perMatch, ...matchOnly];

/** A player's line in a stat: their figure, and its length against the leader's, from 0 to 1. */
export interface RankedLine {
  player: ComparedPlayer;
  value: number | null;
  share: number;
}

/**
 * The players in a stat, the best first, those without a figure last. The leaders are the players with the best
 * figure, several when tied; none when nobody has more than 0.
 */
export function ranked(stat: Stat, players: readonly ComparedPlayer[]): { lines: RankedLine[]; leaders: RankedLine[] } {
  const figures = players.map((player) => ({ player, value: stat.value(player.career) }));
  const best = Math.max(0, ...figures.map(({ value }) => value ?? 0));
  const lines = figures
    .map((figure) => ({ ...figure, share: best > 0 && figure.value !== null ? figure.value / best : 0 }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return { lines, leaders: best > 0 ? lines.filter((line) => line.value === best) : [] };
}
