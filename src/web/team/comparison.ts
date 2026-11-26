import type { SeasonMmr, SeasonPeak } from '../../lib/contract';
import { pushupCredit } from '../../lib/domain';
import type { Board } from '../board';
import { type Career, type CareerAccount, type CareerScope, careerOf, seasonOf } from './career';

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
  /** Their player slot, which is their duo pseudo. */
  name: string;
  /** The pseudo to show: their solo account's when only that account is compared, once the rank source read it. */
  shown: string;
  me: boolean;
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
      shown: (account === 'solo' && ranks?.solo?.pseudo) || name,
      me: name === me,
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
const share = (player: ComparedPlayer, count: number | null, of = player.career.matches) =>
  played(player, count === null || of === 0 ? null : (count / of) * 100);
const average = (player: ComparedPlayer, total: number | null, of = player.career.matches) =>
  played(player, total === null || of === 0 ? null : total / of);
const counted = (player: ComparedPlayer, count: number | null) => played(player, count);

const score: Stat = { label: 'Score moyen', format: 'count', value: (p) => average(p, p.career.score) };
const goals: Stat = { label: 'Buts / match', format: 'perMatch', value: (p) => average(p, p.career.goals) };
const saves: Stat = { label: 'Arrêts / match', format: 'perMatch', value: (p) => average(p, p.career.saves) };
const mvpRate: Stat = { label: 'Taux de MVP', format: 'percent', value: (p) => share(p, p.career.mvps) };
const pushups: Stat = { label: 'Pompes faites', format: 'count', value: (p) => p.pushups };

/** The figures that say the most, after the peak: a card each. */
export const keyStats: Stat[] = [score, mvpRate, goals, saves];

/** The fun ones, each with its prize. */
export const prizes: Prize[] = [
  {
    label: 'Démos / match',
    format: 'perMatch',
    value: (p) => average(p, p.career.demos, p.career.measured.demos),
    prize: 'Le démolisseur',
  },
  // The collector counts a shot on the post or the crossbar, not whether it then went in.
  {
    label: 'Poteaux',
    format: 'count',
    value: (p) => counted(p, p.career.crossbarHits),
    prize: 'L’abonné aux montants',
  },
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

/** How the table shows its figures: each match's average, or the totals. */
export type TableMode = 'perMatch' | 'total';

/**
 * A line of the table. Its total, and what it becomes per match: an action (goals, saves…) is averaged over the
 * matches, an ending (a win, an MVP, a forfeit…) becomes the share of the matches it happened in; a record (a streak,
 * the peak) stays as it is.
 */
interface TableRow {
  label: string;
  total: (player: ComparedPlayer) => number | null;
  /** How it reads per match; none for a record. */
  perMatch?: 'average' | 'share';
  /** The matches the figure was measured in, when an older collector did not send it. */
  measuredIn?: (player: ComparedPlayer) => number;
  format?: StatFormat;
  lowerIsBetter?: boolean;
}

const tableRows = (scope: CareerScope): TableRow[] => [
  { label: 'Matchs', total: (p) => counted(p, p.career.matches) },
  { label: 'Victoires', total: (p) => counted(p, p.career.wins), perMatch: 'share' },
  { label: 'Défaites', total: (p) => counted(p, p.career.losses), perMatch: 'share', lowerIsBetter: true },
  { label: 'Score', total: (p) => counted(p, p.career.score), perMatch: 'average' },
  { label: 'Buts', total: (p) => counted(p, p.career.goals), perMatch: 'average' },
  { label: 'Passes D', total: (p) => counted(p, p.career.assists), perMatch: 'average' },
  { label: 'Arrêts', total: (p) => counted(p, p.career.saves), perMatch: 'average' },
  {
    label: 'Démos',
    total: (p) => counted(p, p.career.demos),
    perMatch: 'average',
    measuredIn: (p) => p.career.measured.demos,
  },
  {
    label: 'Poteaux',
    total: (p) => counted(p, p.career.crossbarHits),
    perMatch: 'average',
    measuredIn: (p) => p.career.measured.crossbarHits,
  },
  { label: 'MVP', total: (p) => counted(p, p.career.mvps), perMatch: 'share' },
  {
    label: 'Buts encaissés',
    total: (p) => counted(p, p.career.conceded),
    perMatch: 'average',
    measuredIn: (p) => p.career.measured.conceded,
    lowerIsBetter: true,
  },
  {
    label: 'Clean sheets',
    total: (p) => counted(p, p.career.conceded === null ? null : p.career.cleanSheets),
    perMatch: 'share',
    measuredIn: (p) => p.career.measured.conceded,
  },
  { label: 'Prolongations gagnées', total: (p) => counted(p, p.career.overtimeWins), perMatch: 'share' },
  {
    label: 'Prolongations perdues',
    total: (p) => counted(p, p.career.overtimeLosses),
    perMatch: 'share',
    lowerIsBetter: true,
  },
  { label: 'FF reçus', total: (p) => counted(p, p.career.forfeitsReceived), perMatch: 'share' },
  { label: 'FF donnés', total: (p) => counted(p, p.career.forfeitsGiven), perMatch: 'share', lowerIsBetter: true },
  { label: 'Matchs quittés', total: (p) => counted(p, p.career.left), perMatch: 'share', lowerIsBetter: true },
  { label: 'Matchs après minuit', total: (p) => counted(p, p.career.lateNight), perMatch: 'share' },
  { label: 'Win streak max', total: (p) => counted(p, p.career.winStreak) },
  { label: 'Lose streak max', total: (p) => counted(p, p.career.lossStreak), lowerIsBetter: true },
  ...(scope === 'tournament'
    ? [{ label: 'Tournois gagnés', total: (p: ComparedPlayer) => counted(p, p.career.tournamentsWon) }]
    : []),
  { label: 'Peak 2v2', total: (p) => p.mmr?.peak.mmr ?? null },
  { label: 'MMR gagné', total: (p) => p.mmr?.gained ?? null, format: 'mmr' },
  { label: 'Pompes faites', total: (p) => p.pushups },
];

/** Every stat the page has, for the table, in its mode: the matches, the play, the endings, the rating, the club. */
export const tableStats = (scope: CareerScope, mode: TableMode): Stat[] =>
  tableRows(scope).map(({ label, total, perMatch, measuredIn, format = 'count', lowerIsBetter }): Stat => {
    const base = { label, ...(lowerIsBetter && { lowerIsBetter }) };
    if (mode === 'total' || !perMatch) return { ...base, format, value: total };
    const of = (player: ComparedPlayer) => measuredIn?.(player) ?? player.career.matches;
    return perMatch === 'average'
      ? { ...base, format: 'perMatch', value: (p) => average(p, total(p), of(p)) }
      : { ...base, format: 'percent', value: (p) => share(p, total(p), of(p)) };
  });

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
