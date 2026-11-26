import type { SeasonMmr, SeasonPeak } from '../../lib/contract';
import { pushupCredit } from '../../lib/domain';
import type { Board } from '../board';
import { type Career, type CareerAccount, type CareerScope, careerOf, seasonOf, type Tally } from './career';

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
  /** Their game IDs, in lower case, as their matches show them: whom an assist went to. */
  ids: Set<string>;
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
      ids: new Set(board.results.filter((row) => row.name === name).map((row) => row.player_id.toLowerCase())),
    };
  });
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

/**
 * How a stat is read: a share of the matches, an average per match, a plain count, MMR (signed), a ball speed (in
 * km/h), a distance (in Unreal units, shown in metres), or seconds.
 */
export type StatFormat = 'percent' | 'perMatch' | 'count' | 'mmr' | 'speed' | 'distance' | 'seconds';

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

/** A stat of collector 0.7.0, per match: unknown until a match came with it. */
const tallied = ({ total, matches }: Tally) => (matches === 0 ? null : total / matches);
const total = ({ total: sum, matches }: Tally) => (matches === 0 ? null : sum);
/** The goals scored among the shots, in the matches whose shots are known. */
const accuracy = (player: ComparedPlayer) => {
  const { shots, goalsOnShots } = player.career.game;
  return shots.total === 0 ? null : (goalsOnShots / shots.total) * 100;
};
/** How many times a player got, or took, a stat feed event; unknown until a match came with a feed. */
const feed = (player: ComparedPlayer, name: string, side: 'statfeed' | 'statfeedSecondary') =>
  player.career.game.statfeedMatches === 0 ? null : (player.career.game[side].get(name) ?? 0);

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
  { label: 'Frappe la plus puissante', format: 'speed', value: (p) => p.career.game.hardestHit, prize: 'Le canonnier' },
  { label: 'But le plus rapide', format: 'speed', value: (p) => p.career.game.fastestGoal, prize: 'Le bolide' },
  { label: 'But le plus lointain', format: 'distance', value: (p) => p.career.game.longestGoal, prize: 'Le sniper' },
  {
    label: 'Précision des tirs',
    format: 'percent',
    // Ten shots at least: a goal on a lone shot is no aim.
    value: (p) => (p.career.game.shots.total >= 10 ? accuracy(p) : null),
    prize: 'L’œil de lynx',
  },
  {
    label: 'Premiers au coup d’envoi / match',
    format: 'perMatch',
    value: (p) => tallied(p.career.game.kickoffTouches),
    prize: 'Le roi du kickoff',
  },
  {
    label: 'Démolitions subies',
    format: 'count',
    value: (p) => feed(p, 'Demolish', 'statfeedSecondary'),
    prize: 'Le punching-ball',
  },
  {
    label: 'Buts contre son camp',
    format: 'count',
    value: (p) => (p.career.game.ownGoals.matches ? p.career.game.ownGoals.total : null),
    prize: 'Le traître',
  },
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
  {
    label: 'Tirs',
    total: (p) => total(p.career.game.shots),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.shots.matches,
  },
  { label: 'Précision des tirs', total: accuracy, format: 'percent' },
  {
    label: 'Touches de balle',
    total: (p) => total(p.career.game.touches),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.touches.matches,
  },
  {
    label: 'Contacts carrosserie',
    total: (p) => total(p.career.game.carTouches),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.carTouches.matches,
  },
  {
    label: 'Premiers au coup d’envoi',
    total: (p) => total(p.career.game.kickoffTouches),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.kickoffTouches.matches,
  },
  {
    label: 'Buts contre son camp',
    total: (p) => total(p.career.game.ownGoals),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.ownGoals.matches,
    lowerIsBetter: true,
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
  { label: 'Frappe la plus puissante', total: (p) => p.career.game.hardestHit, format: 'speed' },
  { label: 'But le plus rapide', total: (p) => p.career.game.fastestGoal, format: 'speed' },
  { label: 'But le plus lointain', total: (p) => p.career.game.longestGoal, format: 'distance' },
  {
    label: 'But le plus rapide après le coup d’envoi',
    total: (p) => p.career.game.quickestGoal,
    format: 'seconds',
    lowerIsBetter: true,
  },
  { label: 'Peak 2v2', total: (p) => p.mmr?.peak.mmr ?? null },
  { label: 'MMR gagné', total: (p) => p.mmr?.gained ?? null, format: 'mmr' },
  { label: 'Pompes faites', total: (p) => p.pushups },
];

/** The game's stat feed events a line of the scoreboard already counts: the table shows them once. */
const scoreboardEvents = new Set(['Goal', 'Assist', 'Save', 'Shot', 'Demolish', 'MVP', 'Win']);

/**
 * The game's events in French, whatever the language the game was played in: the words it sends follow the
 * player's game. An event not listed keeps the game's own words, or its name.
 */
const eventWords: Readonly<Record<string, string>> = {
  AerialGoal: 'But aérien',
  Assist: 'Passe décisive',
  BackwardsGoal: 'But à reculons',
  BicycleGoal: 'But en retourné',
  BicycleHit: 'Retourné',
  Center: 'Centre',
  Clear: 'Dégagement',
  Demolish: 'Démolition',
  EpicSave: 'Arrêt décisif',
  FirstTouch: 'Premier toucher',
  Goal: 'But',
  HatTrick: 'Coup du chapeau',
  HighFive: 'Check',
  LongGoal: 'But de loin',
  LowFive: 'Check en bas',
  MVP: 'MVP',
  OwnGoal: 'But contre son camp',
  Playmaker: 'Meneur de jeu',
  PoolShot: 'Coup de billard',
  Save: 'Arrêt',
  Savior: 'Sauveur',
  Shot: 'Tir cadré',
  TurtleGoal: 'But en tortue',
  Win: 'Victoire',
};

const eventLabel = (name: string, labels: Readonly<Record<string, string>>) => eventWords[name] ?? labels[name] ?? name;

/**
 * The lines the players' own data brings: each stat feed event the game sent, got and taken, named with the game's
 * words; and the assists each player gave to each teammate.
 */
function dataRows(players: readonly ComparedPlayer[], labels: Readonly<Record<string, string>>): TableRow[] {
  const names = (side: 'statfeed' | 'statfeedSecondary') =>
    [...new Set(players.flatMap((player) => [...player.career.game[side].keys()]))].sort();
  const feedRow = (name: string, side: 'statfeed' | 'statfeedSecondary'): TableRow => ({
    label: side === 'statfeed' ? eventLabel(name, labels) : `Subi : ${eventLabel(name, labels)}`,
    total: (p) => feed(p, name, side),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.statfeedMatches,
    ...(side === 'statfeedSecondary' && { lowerIsBetter: true }),
  });
  const assistsTo = (giver: ComparedPlayer, scorer: ComparedPlayer) =>
    giver === scorer || giver.career.game.statfeedMatches === 0
      ? null
      : [...giver.career.game.assistsTo].reduce(
          (sum, [id, count]) => sum + (scorer.ids.has(id.toLowerCase()) ? count : 0),
          0,
        );
  return [
    ...names('statfeed')
      .filter((name) => !scoreboardEvents.has(name))
      .map((name) => feedRow(name, 'statfeed')),
    ...names('statfeedSecondary').map((name) => feedRow(name, 'statfeedSecondary')),
    ...players.map(
      (scorer): TableRow => ({
        label: `Passes D pour ${scorer.shown}`,
        total: (giver) => assistsTo(giver, scorer),
      }),
    ),
  ];
}

/**
 * Every stat the page has, for the table, in its mode: the matches, the play, the endings, the game's own events, the
 * rating, the club. A line nobody has a figure for (a stat no collector sent yet) is left out.
 */
export const tableStats = (
  scope: CareerScope,
  mode: TableMode,
  players: readonly ComparedPlayer[],
  labels: Readonly<Record<string, string>> = {},
): Stat[] =>
  [...tableRows(scope), ...dataRows(players, labels)]
    .map(({ label, total, perMatch, measuredIn, format = 'count', lowerIsBetter }): Stat => {
      const base = { label, ...(lowerIsBetter && { lowerIsBetter }) };
      if (mode === 'total' || !perMatch) return { ...base, format, value: total };
      const of = (player: ComparedPlayer) => measuredIn?.(player) ?? player.career.matches;
      return perMatch === 'average'
        ? { ...base, format: 'perMatch', value: (p) => average(p, total(p), of(p)) }
        : { ...base, format: 'percent', value: (p) => share(p, total(p), of(p)) };
    })
    .filter((stat) => players.some((player) => stat.value(player) !== null));

/** A player's line in a stat: their figure, and its length against the leader's, from 0 to 1. */
export interface RankedLine {
  player: ComparedPlayer;
  value: number | null;
  share: number;
  /** Their place in the stat, shared on a tie; none without a figure. */
  place: number | null;
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
    .sort((a, b) => (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY))
    .map((line, _, all) => ({
      ...line,
      place:
        line.value === null
          ? null
          : 1 + all.filter((other) => (other.value ?? Number.NEGATIVE_INFINITY) > (line.value ?? 0)).length,
    }));
  return { lines, leaders: best > 0 ? lines.filter((line) => line.value === best) : [] };
}

/** The best figure of a table row: the highest, or the lowest when less is better; none when all are equal. */
export function bestOf(stat: Stat, players: readonly ComparedPlayer[]): number | null {
  const values = players.map((player) => stat.value(player)).filter((value) => value !== null);
  if (new Set(values).size < 2) return null;
  return stat.lowerIsBetter ? Math.min(...values) : Math.max(...values);
}
