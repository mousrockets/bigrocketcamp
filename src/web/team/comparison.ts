import type { SeasonMmr, SeasonPeak } from '../../lib/contract';
import { pushupCredit } from '../../lib/domain';
import type { Board } from '../board';
import { type Career, type CareerAccount, type CareerScope, careerOf, seasonOf } from './career';
import { highestTier } from './stats';

// The Stats page: each player over one season (or every match), then, stat by stat, who leads.

/** The seasons with a match of the club or a rating read, the newest first. */
export function seasonsPlayed(board: Board, seasonMmr: readonly SeasonMmr[], roster: readonly string[]): number[] {
  const players = new Set(roster);
  const seasons = new Set([
    ...board.results
      .filter((row) => row.kind === 'match' && players.has(row.name))
      .map(seasonOf)
      .filter((season) => season !== null),
    ...seasonMmr.filter((line) => players.has(line.player)).map((line) => line.season),
  ]);
  return [...seasons].sort((a, b) => b - a);
}

/** A player's 2v2 rating over the matches chosen, on the account with the highest peak when both count. */
export interface PeriodMmr {
  account: 'duo' | 'solo';
  peak: SeasonPeak;
  /** What the season brought, from its first rating to its last; seasons added up over every season. */
  gained: number;
  /** The most they fell from a season's peak to its last rating. */
  fall: number;
}

/** A player, as the page compares them. */
export interface ComparedPlayer {
  name: string;
  me: boolean;
  /** Their highest current rank, solo or duo, which gives them their colour. */
  tier: number | null;
  career: Career;
  mmr: PeriodMmr | null;
  /** Pushups, crunches and plank done, counted in pushups. */
  pushups: number;
}

function periodMmr(
  seasonMmr: readonly SeasonMmr[],
  name: string,
  account: CareerAccount,
  season: number | null,
): PeriodMmr | null {
  const lines = seasonMmr.filter(
    (line) =>
      line.player === name &&
      (line.account === 'duo' || line.account === 'solo') &&
      (account === 'all' || line.account === account) &&
      (season === null || line.season === season),
  );
  const best = lines.reduce<(typeof lines)[number] | null>(
    (top, line) => (top && top.peak.mmr >= line.peak.mmr ? top : line),
    null,
  );
  if (!best) return null;
  const own = lines.filter((line) => line.account === best.account);
  return {
    account: best.account === 'solo' ? 'solo' : 'duo',
    peak: best.peak,
    gained: own.reduce((total, line) => total + line.last - line.first, 0),
    fall: Math.max(...own.map((line) => line.peak.mmr - line.last)),
  };
}

const pushupsOf = (board: Board, name: string, season: number | null) =>
  board.exercises
    .filter(
      (exercise) =>
        exercise.player === name &&
        (season === null || seasonOf({ day: exercise.day, received: exercise.created }) === season),
    )
    .reduce((total, exercise) => total + pushupCredit(exercise), 0);

/** Every player of the roster, the member first, over the matches chosen. */
export function comparedPlayers(
  board: Board,
  /** Each account's MMR over each season, which the Stats page reads apart from the board. */
  seasonMmr: readonly SeasonMmr[],
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
      mmr: periodMmr(seasonMmr, name, account, season),
      pushups: pushupsOf(board, name, season),
    };
  });
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

/** How a stat is read: a share of the matches, an average per match, a plain count, or MMR (signed). */
export type StatFormat = 'percent' | 'perMatch' | 'count' | 'mmr';

export interface Stat {
  label: string;
  format: StatFormat;
  /** The player's figure, or null when they have none to compare (no match, or a count no source sent). */
  value: (player: ComparedPlayer) => number | null;
  /** Whether less is better (goals conceded, matches left): the table lights the lowest. */
  lowerIsBetter?: boolean;
}

/** A stat that crowns a player, with a name for the prize. */
export interface Prize extends Stat {
  prize: string;
}

const played = (player: ComparedPlayer, value: number | null) => (player.career.matches === 0 ? null : value);
const share = (player: ComparedPlayer, count: number) => played(player, (count / player.career.matches) * 100);
const average = (player: ComparedPlayer, total: number | null) =>
  played(player, total === null ? null : total / player.career.matches);
const counted = (player: ComparedPlayer, count: number | null) => played(player, count);

const matches: Stat = { label: 'Matchs', format: 'count', value: (p) => counted(p, p.career.matches) };
const wins: Stat = { label: 'Victoires', format: 'count', value: (p) => counted(p, p.career.wins) };
const losses: Stat = {
  label: 'Défaites',
  format: 'count',
  value: (p) => counted(p, p.career.losses),
  lowerIsBetter: true,
};
const winRate: Stat = { label: '% de victoires', format: 'percent', value: (p) => share(p, p.career.wins) };
const score: Stat = { label: 'Score moyen', format: 'count', value: (p) => average(p, p.career.score) };
const goals: Stat = { label: 'Buts / match', format: 'perMatch', value: (p) => average(p, p.career.goals) };
const assists: Stat = { label: 'Passes D / match', format: 'perMatch', value: (p) => average(p, p.career.assists) };
const saves: Stat = { label: 'Arrêts / match', format: 'perMatch', value: (p) => average(p, p.career.saves) };
const mvpRate: Stat = { label: 'Taux de MVP', format: 'percent', value: (p) => share(p, p.career.mvps) };
const demos: Stat = { label: 'Démos / match', format: 'perMatch', value: (p) => average(p, p.career.demos) };
const conceded: Stat = {
  label: 'Buts encaissés / match',
  format: 'perMatch',
  value: (p) => average(p, p.career.conceded),
  lowerIsBetter: true,
};
const peak: Stat = { label: 'Peak 2v2', format: 'count', value: (p) => p.mmr?.peak.mmr ?? null };
const gained: Stat = { label: 'MMR gagné', format: 'mmr', value: (p) => p.mmr?.gained ?? null };
const pushups: Stat = { label: 'Pompes faites', format: 'count', value: (p) => p.pushups };

/** The figures that say the most, after the peak: a card each. */
export const keyStats: Stat[] = [score, mvpRate, goals, saves];

/** The fun ones, each with its prize. */
export const prizes: Prize[] = [
  { ...demos, prize: 'Le démolisseur' },
  { label: 'Poteaux', format: 'count', value: (p) => counted(p, p.career.crossbarHits), prize: 'Poteau rentrant' },
  {
    label: 'Prolongations gagnées',
    format: 'count',
    value: (p) => counted(p, p.career.overtimeWins),
    prize: 'Le roi des prolongations',
  },
  {
    label: 'Matchs sans encaisser',
    format: 'count',
    value: (p) => counted(p, p.career.conceded === null ? null : p.career.cleanSheets),
    prize: 'Clean sheet',
  },
  {
    label: 'Matchs après minuit',
    format: 'count',
    value: (p) => counted(p, p.career.lateNight),
    prize: 'Le noctambule',
  },
  { label: 'Matchs quittés', format: 'count', value: (p) => counted(p, p.career.left), prize: 'Rage quit' },
  { ...pushups, prize: 'Les bras d’acier' },
  { label: 'MMR perdus depuis le peak', format: 'count', value: (p) => p.mmr?.fall ?? null, prize: 'La chute' },
];

/** Every stat the page has, for the table: the matches, the play, the endings, the rating, the club. */
export const allStats = (scope: CareerScope): Stat[] => [
  matches,
  wins,
  losses,
  winRate,
  score,
  { label: 'Buts', format: 'count', value: (p) => counted(p, p.career.goals) },
  goals,
  { label: 'Passes D', format: 'count', value: (p) => counted(p, p.career.assists) },
  assists,
  { label: 'Arrêts', format: 'count', value: (p) => counted(p, p.career.saves) },
  saves,
  { label: 'Démos', format: 'count', value: (p) => counted(p, p.career.demos) },
  demos,
  { label: 'Poteaux', format: 'count', value: (p) => counted(p, p.career.crossbarHits) },
  { label: 'MVP', format: 'count', value: (p) => counted(p, p.career.mvps) },
  mvpRate,
  conceded,
  {
    label: 'Clean sheets',
    format: 'count',
    value: (p) => counted(p, p.career.conceded === null ? null : p.career.cleanSheets),
  },
  { label: 'Prolongations gagnées', format: 'count', value: (p) => counted(p, p.career.overtimeWins) },
  {
    label: 'Prolongations perdues',
    format: 'count',
    value: (p) => counted(p, p.career.overtimeLosses),
    lowerIsBetter: true,
  },
  { label: 'FF reçus', format: 'count', value: (p) => counted(p, p.career.forfeitsReceived) },
  { label: 'FF donnés', format: 'count', value: (p) => counted(p, p.career.forfeitsGiven), lowerIsBetter: true },
  { label: 'Matchs quittés', format: 'count', value: (p) => counted(p, p.career.left), lowerIsBetter: true },
  { label: 'Matchs après minuit', format: 'count', value: (p) => counted(p, p.career.lateNight) },
  { label: 'Win streak max', format: 'count', value: (p) => counted(p, p.career.winStreak) },
  { label: 'Lose streak max', format: 'count', value: (p) => counted(p, p.career.lossStreak), lowerIsBetter: true },
  ...(scope === 'tournament'
    ? [{ label: 'Tournois gagnés', format: 'count', value: (p) => counted(p, p.career.tournamentsWon) } satisfies Stat]
    : []),
  peak,
  gained,
  pushups,
];

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
  const figures = players.map((player) => ({ player, value: stat.value(player) }));
  const best = Math.max(0, ...figures.map(({ value }) => value ?? 0));
  const lines = figures
    .map((figure) => ({ ...figure, share: best > 0 && figure.value !== null ? Math.max(0, figure.value) / best : 0 }))
    .sort((a, b) => (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY));
  return { lines, leaders: best > 0 ? lines.filter((line) => line.value === best) : [] };
}

/** The best figure of a table row: the highest, or the lowest when less is better; none when all are equal. */
export function bestOf(stat: Stat, players: readonly ComparedPlayer[]): number | null {
  const values = players.map((player) => stat.value(player)).filter((value) => value !== null);
  if (new Set(values).size < 2) return null;
  return stat.lowerIsBetter ? Math.min(...values) : Math.max(...values);
}
