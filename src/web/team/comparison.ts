import type { SeasonMmr, SeasonPeak } from '../../lib/contract';
import { pushupCredit } from '../../lib/domain';
import { currentSeason } from '../../lib/season';
import type { Board } from '../board';
import { type Career, type CareerAccount, type CareerScope, careerOf, seasonOf, type Tally } from './career';
import { ratingOnLadder } from './ladder';

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
  /** How each account's peak of the season stands against its peak all time before it; null when unknown. */
  peakGaps: Record<PeakAccount, PeakGap | null>;
  /** Their solo account's pseudo, where only that account shows; their duo pseudo while the rank source found none. */
  soloShown: string;
}

/** The account a podium of peaks compares: each player's solo one, or the duo one the club plays on. */
export type PeakAccount = 'solo' | 'duo';

/**
 * A player's peak of a season against their peak all time before it: above 0, they beat it by that much; below 0,
 * how far they stayed from it. Levels differ, so the club compares these gaps, not the peaks.
 */
export interface PeakGap {
  /** The season's peak, with the rank it came with and its tier, for the icon. */
  peak: number;
  tier: number | null;
  /** The peak all time before the season, and the tier of its rank; null while unknown. */
  allTime: number | null;
  allTimeTier: number | null;
  /** The season's peak minus the peak all time before it; null while that one is unknown. */
  gap: number | null;
}

/**
 * The peak all time before a season: for the season under way, the best the account had when it began, kept by the
 * API; for a past one, the highest peak of the seasons before it that the app read.
 */
function peakGapOf(
  board: Board,
  seasonMmr: readonly SeasonMmr[],
  name: string,
  kind: PeakAccount,
  season: number | null,
): PeakGap | null {
  if (season === null) return null;
  const own = seasonMmr.filter((line) => line.player === name && line.account === kind);
  const line = own.find((candidate) => candidate.season === season);
  if (!line) return null;
  const ranks = board.doublesRanks?.find((rank) => rank.player === name);
  const kept = kind === 'duo' ? ranks?.seasonStartBest : ranks?.solo?.seasonStartBest;
  const earlier = own
    .filter((other) => other.season < season)
    .reduce<SeasonMmr | null>((best, other) => (!best || other.peak.mmr > best.peak.mmr ? other : best), null);
  const before = season === currentSeason.number ? (kept ?? null) : (earlier?.peak ?? null);
  const peak = line.peak.mmr;
  return {
    peak,
    tier: line.peak.tier,
    allTime: before?.mmr ?? null,
    // A best set by hand has no rank of its own: the ladder gives the one it reaches.
    allTimeTier: before ? (before.tier ?? ratingOnLadder(before.mmr).tier) : null,
    gap: before ? peak - before.mmr : null,
  };
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
      peakGaps: {
        solo: peakGapOf(board, seasonMmr, name, 'solo', season),
        duo: peakGapOf(board, seasonMmr, name, 'duo', season),
      },
      soloShown: ranks?.solo?.pseudo || name,
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
  // The collector counts a shot on the post or the crossbar, not whether it then went in. Per match, over the matches
  // that came with the count: who plays most would win it otherwise.
  {
    label: 'Poteaux / match',
    format: 'perMatch',
    value: (p) => average(p, p.career.crossbarHits, p.career.measured.crossbarHits),
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
  // The other side of Le démolisseur: per match too, over the matches that came with the game's feed.
  {
    label: 'Démolitions subies / match',
    format: 'perMatch',
    value: (p) => average(p, feed(p, 'Demolish', 'statfeedSecondary'), p.career.game.statfeedMatches),
    prize: 'Le punching-ball',
  },
  {
    label: 'Buts contre son camp',
    format: 'count',
    value: (p) => (p.career.game.ownGoals.matches ? p.career.game.ownGoals.total : null),
    prize: 'Le traître',
  },
];

/** How the table shows the actions of the game: each match's average, or the totals. */
export type TableMode = 'perMatch' | 'total';

/**
 * The parts of the table, in reading order. Only the actions of the game (goals, saves, touches, the stat feed…)
 * switch between per match and total: an ending (a forfeit, a late night) reads best as a count, a record as it is.
 */
export const tableSections = [
  'Résultats',
  'Attaque',
  'Défense',
  'Dans le jeu',
  'Le fil du jeu',
  'Les fins de match',
  'Les records',
  'Les passes décisives',
  'Le rang et le club',
] as const;
export type TableSection = (typeof tableSections)[number];

/** A line of the table: its total, and what it becomes per match (an average, or a share of the matches). */
interface TableRow {
  section: TableSection;
  label: string;
  total: (player: ComparedPlayer) => number | null;
  /** How it reads per match; none for a line that stays as it is. */
  perMatch?: 'average' | 'share';
  /** The matches the figure was measured in, when an older collector did not send it. */
  measuredIn?: (player: ComparedPlayer) => number;
  format?: StatFormat;
  /** How its average per match reads, when not with two decimals: a score of hundreds needs none. */
  perMatchFormat?: StatFormat;
  lowerIsBetter?: boolean;
}

const gameRow = (
  section: TableSection,
  label: string,
  of: (game: Career['game']) => Tally,
  extra: Partial<TableRow> = {},
): TableRow => ({
  section,
  label,
  total: (p) => total(of(p.career.game)),
  perMatch: 'average',
  measuredIn: (p) => of(p.career.game).matches,
  ...extra,
});

const tableRows = (scope: CareerScope): TableRow[] => [
  { section: 'Résultats', label: 'Matchs', total: (p) => counted(p, p.career.matches) },
  { section: 'Résultats', label: 'Victoires', total: (p) => counted(p, p.career.wins), perMatch: 'share' },
  { section: 'Résultats', label: 'Défaites', total: (p) => counted(p, p.career.losses), lowerIsBetter: true },
  { section: 'Résultats', label: 'MVP', total: (p) => counted(p, p.career.mvps), perMatch: 'share' },
  { section: 'Résultats', label: 'Win streak max', total: (p) => counted(p, p.career.winStreak) },
  {
    section: 'Résultats',
    label: 'Lose streak max',
    total: (p) => counted(p, p.career.lossStreak),
    lowerIsBetter: true,
  },
  ...(scope === 'tournament'
    ? [
        {
          section: 'Résultats',
          label: 'Tournois gagnés',
          total: (p: ComparedPlayer) => counted(p, p.career.tournamentsWon),
        } satisfies TableRow,
      ]
    : []),
  {
    section: 'Attaque',
    label: 'Score',
    total: (p) => counted(p, p.career.score),
    perMatch: 'average',
    perMatchFormat: 'count',
  },
  { section: 'Attaque', label: 'Buts', total: (p) => counted(p, p.career.goals), perMatch: 'average' },
  { section: 'Attaque', label: 'Passes D', total: (p) => counted(p, p.career.assists), perMatch: 'average' },
  gameRow('Attaque', 'Tirs', (game) => game.shots),
  { section: 'Attaque', label: 'Précision des tirs', total: accuracy, format: 'percent' },
  {
    section: 'Attaque',
    label: 'Poteaux',
    total: (p) => counted(p, p.career.crossbarHits),
    perMatch: 'average',
    measuredIn: (p) => p.career.measured.crossbarHits,
  },
  { section: 'Défense', label: 'Arrêts', total: (p) => counted(p, p.career.saves), perMatch: 'average' },
  {
    section: 'Défense',
    label: 'Buts encaissés',
    total: (p) => counted(p, p.career.conceded),
    perMatch: 'average',
    measuredIn: (p) => p.career.measured.conceded,
    lowerIsBetter: true,
  },
  {
    section: 'Défense',
    label: 'Clean sheets',
    total: (p) => counted(p, p.career.conceded === null ? null : p.career.cleanSheets),
  },
  {
    section: 'Défense',
    label: 'Buts contre son camp',
    total: (p) => total(p.career.game.ownGoals),
    lowerIsBetter: true,
  },
  gameRow('Dans le jeu', 'Touches de balle', (game) => game.touches),
  gameRow('Dans le jeu', 'Contacts carrosserie', (game) => game.carTouches),
  gameRow('Dans le jeu', 'Premiers au coup d’envoi', (game) => game.kickoffTouches),
  {
    section: 'Dans le jeu',
    label: 'Démos',
    total: (p) => counted(p, p.career.demos),
    perMatch: 'average',
    measuredIn: (p) => p.career.measured.demos,
  },
  { section: 'Les fins de match', label: 'Prolongations gagnées', total: (p) => counted(p, p.career.overtimeWins) },
  {
    section: 'Les fins de match',
    label: 'Prolongations perdues',
    total: (p) => counted(p, p.career.overtimeLosses),
    lowerIsBetter: true,
  },
  { section: 'Les fins de match', label: 'FF reçus', total: (p) => counted(p, p.career.forfeitsReceived) },
  {
    section: 'Les fins de match',
    label: 'FF donnés',
    total: (p) => counted(p, p.career.forfeitsGiven),
    lowerIsBetter: true,
  },
  {
    section: 'Les fins de match',
    label: 'Matchs quittés',
    total: (p) => counted(p, p.career.left),
    lowerIsBetter: true,
  },
  { section: 'Les fins de match', label: 'Matchs après minuit', total: (p) => counted(p, p.career.lateNight) },
  {
    section: 'Les records',
    label: 'Frappe la plus puissante',
    total: (p) => p.career.game.hardestHit,
    format: 'speed',
  },
  { section: 'Les records', label: 'But le plus rapide', total: (p) => p.career.game.fastestGoal, format: 'speed' },
  {
    section: 'Les records',
    label: 'But le plus lointain',
    total: (p) => p.career.game.longestGoal,
    format: 'distance',
  },
  {
    section: 'Les records',
    label: 'But le plus rapide après le coup d’envoi',
    total: (p) => p.career.game.quickestGoal,
    format: 'seconds',
    lowerIsBetter: true,
  },
  { section: 'Le rang et le club', label: 'Peak 2v2', total: (p) => p.mmr?.peak.mmr ?? null },
  { section: 'Le rang et le club', label: 'MMR gagné', total: (p) => p.mmr?.gained ?? null, format: 'mmr' },
  { section: 'Le rang et le club', label: 'Pompes faites', total: (p) => p.pushups },
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
 * The lines the players' own data brings: each stat feed event the game sent, got and taken, in French; and the
 * assists each player gave to each teammate.
 */
function dataRows(players: readonly ComparedPlayer[], labels: Readonly<Record<string, string>>): TableRow[] {
  const names = (side: 'statfeed' | 'statfeedSecondary') =>
    [...new Set(players.flatMap((player) => [...player.career.game[side].keys()]))].sort();
  const feedRow = (name: string, side: 'statfeed' | 'statfeedSecondary'): TableRow => ({
    section: 'Le fil du jeu',
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
        section: 'Les passes décisives',
        label: `Pour ${scorer.shown}`,
        total: (giver) => assistsTo(giver, scorer),
      }),
    ),
  ];
}

/** A line of the table as shown: its stat in the mode chosen, its part, and whether the mode changed it. */
export interface TableStat extends Stat {
  section: TableSection;
  /** Whether the line reads per match in that mode: the part says so above it. */
  perMatch: boolean;
}

/**
 * Every stat the page has, for the table, in its mode, part by part. A line nobody has a figure for (a stat no
 * collector sent yet) is left out.
 */
export const tableStats = (
  scope: CareerScope,
  mode: TableMode,
  players: readonly ComparedPlayer[],
  labels: Readonly<Record<string, string>> = {},
): TableStat[] =>
  [...tableRows(scope), ...dataRows(players, labels)]
    .map(
      ({ section, label, total, perMatch, measuredIn, format = 'count', perMatchFormat, lowerIsBetter }): TableStat => {
        const base = { section, label, ...(lowerIsBetter && { lowerIsBetter }) };
        if (mode === 'total' || !perMatch) return { ...base, perMatch: false, format, value: total };
        const of = (player: ComparedPlayer) => measuredIn?.(player) ?? player.career.matches;
        return perMatch === 'average'
          ? { ...base, perMatch: true, format: perMatchFormat ?? 'perMatch', value: (p) => average(p, total(p), of(p)) }
          : { ...base, perMatch: true, format: 'percent', value: (p) => share(p, total(p), of(p)) };
      },
    )
    .filter((stat) => players.some((player) => stat.value(player) !== null))
    .sort((a, b) => tableSections.indexOf(a.section) - tableSections.indexOf(b.section));

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
