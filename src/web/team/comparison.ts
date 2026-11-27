import type { SeasonMmr, SeasonPeak } from '../../lib/contract';
import { pushupCredit } from '../../lib/domain';
import type { Pro } from '../../lib/pros';
import type { Board } from '../board';
import {
  type Career,
  type CareerAccount,
  type CarTally,
  careerOf,
  type StatsMode,
  seasonOf,
  type Tally,
} from './career';
import { soloReading } from './ladder';
import { eventHints, statHints, sufferedHints } from './stat-hints';
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
  /** Their colour's rank: their highest current one, duo or solo. */
  tier: number | null;
}

function periodMmr(
  seasonMmr: readonly SeasonMmr[],
  name: string,
  account: CareerAccount,
  seasons: ReadonlySet<number> | null,
): PeriodMmr | null {
  const lines = seasonMmr.filter(
    (line) =>
      line.player === name &&
      (line.account === 'duo' || line.account === 'solo') &&
      (account === 'all' || line.account === account) &&
      (seasons === null || seasons.has(line.season)),
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
    fall: Math.max(...own.map((line) => line.peak.mmr - line.last)),
  };
}

const pushupsOf = (board: Board, name: string, seasons: ReadonlySet<number> | null) =>
  board.exercises
    .filter(
      (exercise) =>
        exercise.player === name &&
        (seasons === null || seasons.has(seasonOf({ day: exercise.day, received: exercise.created }) ?? 0)),
    )
    .reduce((total, exercise) => total + pushupCredit(exercise), 0);

/** Every player of the roster, the member first, over the matches chosen. */
export function comparedPlayers(
  board: Board,
  /** Each account's MMR over each season, which the Stats page reads apart from the board. */
  seasonMmr: readonly SeasonMmr[],
  roster: readonly string[],
  me: string | null,
  modes: ReadonlySet<StatsMode>,
  account: CareerAccount,
  /** The seasons chosen, or every match when null. */
  seasons: ReadonlySet<number> | null,
): ComparedPlayer[] {
  const players = roster.map((name): ComparedPlayer => {
    const ranks = board.doublesRanks?.find((rank) => rank.player === name);
    return {
      name,
      shown: (account === 'solo' && ranks?.solo?.pseudo) || name,
      me: name === me,
      career: careerOf(board, name, modes, account, seasons),
      // The ratings are the 2v2 ones: they tell nothing of the other modes.
      mmr: modes.has('doubles') ? periodMmr(seasonMmr, name, account, seasons) : null,
      pushups: pushupsOf(board, name, seasons),
      ids: new Set(board.results.filter((row) => row.name === name).map((row) => row.player_id.toLowerCase())),
      tier: highestTier(ranks?.tier, soloReading(ranks)?.tier),
    };
  });
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

/** The key stats the pros have a figure of, as the address names their sheet. */
export const prosSlugs = ['buts', 'tirs', 'passes', 'arrets', 'mvp'] as const;
export type ProsSlug = (typeof prosSlugs)[number];

/**
 * How a stat is read: a share of the matches, an average per match, a plain count, a ball speed (in
 * km/h), a distance (in Unreal units, shown in metres), or seconds.
 */
export type StatFormat = 'percent' | 'perMatch' | 'count' | 'speed' | 'distance' | 'seconds';

export interface Stat {
  label: string;
  format: StatFormat;
  /** The player's figure, or null when they have none to compare (no match, or a count no source sent). */
  value: (player: ComparedPlayer) => number | null;
  /** Whether less is better (goals conceded, matches left): the table lights the lowest. */
  lowerIsBetter?: boolean;
  /** An estimate, not a count: marked ≈, its margin of error said under the table. */
  estimated?: boolean;
  /** A style, not a ranking (time on the ground, on a wall): the table lights none of it. */
  neutral?: boolean;
  /** What the line counts, shown on its name; none when the game does not say (stat-hints.ts). */
  hint?: string;
  /** The pros' own figure, for a key stat they have one of; its sheet opens at `?pros=<slug>`. */
  pros?: { slug: ProsSlug; figure: (pro: Pro) => number };
}

/** A stat that crowns a player, with a name for the prize. */
export interface Prize extends Stat {
  prize: string;
  /** How many times it happened, for a prize given to a rate: « 50 fois » reads better than « 0,96 » alone. */
  total?: (player: ComparedPlayer) => number | null;
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

/**
 * The matches a rate needs at least, to take a prize or when only the newest collector measured it, as many as the
 * game's placement matches for a rank: one lucky match makes no champion, and two matches, one of them a long
 * overtime, make no average.
 */
export const prizeMinimum = 10;

/** A rate over enough matches: none over fewer than the minimum. */
const rated = (value: number | null, of: number) => (of < prizeMinimum ? null : value);
const averageFor = (player: ComparedPlayer, total: number | null, of = player.career.matches) =>
  rated(average(player, total, of), of);
const shareFor = (player: ComparedPlayer, count: number | null, of = player.career.matches) =>
  rated(share(player, count, of), of);
const talliedFor = (tally: Tally) => rated(tallied(tally), tally.matches);

const matches: Stat = { label: 'Matchs', format: 'count', value: (p) => counted(p, p.career.matches) };
const goals: Stat = {
  label: 'Buts / match',
  format: 'perMatch',
  value: (p) => average(p, p.career.goals),
  pros: { slug: 'buts', figure: (pro) => pro.goals },
};
const assists: Stat = {
  label: 'Assists / match',
  format: 'perMatch',
  value: (p) => average(p, p.career.assists),
  pros: { slug: 'passes', figure: (pro) => pro.assists },
};
const saves: Stat = {
  label: 'Arrêts / match',
  format: 'perMatch',
  value: (p) => average(p, p.career.saves),
  pros: { slug: 'arrets', figure: (pro) => pro.saves },
};
/**
 * Over the matches that came with them: collector 0.6.0 for the demolitions, 0.7.0 for the shots, ten at least: the
 * newest collector came with few matches yet.
 */
const shots: Stat = {
  label: 'Tirs / match',
  format: 'perMatch',
  value: (p) => talliedFor(p.career.game.shots),
  pros: { slug: 'tirs', figure: (pro) => pro.shots },
};
const demos: Stat = {
  label: 'Démos / match',
  format: 'perMatch',
  value: (p) => average(p, p.career.demos, p.career.measured.demos),
};
/** Among the matches whose MVP is known: a won match whose scoreboard no source completed names none. */
const mvpRate: Stat = {
  label: 'Taux de MVP',
  format: 'percent',
  value: (p) => share(p, p.career.mvps, p.career.measured.mvp),
  pros: { slug: 'mvp', figure: (pro) => pro.mvpRate },
};
const pushups: Stat = { label: 'Pompes faites', format: 'count', value: (p) => p.pushups };

/**
 * The figures that say the most, after the peak: attack, team play and defence, the pressure of the demolitions, the
 * MVPs, then the time spent on the game. A card each.
 */
export const keyStats: Stat[] = [goals, shots, assists, saves, demos, mvpRate, matches];

/**
 * An axis of play style: a ratio of two of a player's counts, which says what kind of player they are, not how good.
 * Low at the left, high at the right.
 */
export interface StyleAxis {
  label: string;
  low: string;
  high: string;
  counts: (player: ComparedPlayer) => [over: number, under: number];
}

export const styleAxes: StyleAxis[] = [
  { label: 'Buts par arrêt', low: 'Défenseur', high: 'Attaquant', counts: (p) => [p.career.goals, p.career.saves] },
  { label: 'Assists par but', low: 'Finisseur', high: 'Passeur', counts: (p) => [p.career.assists, p.career.goals] },
];

/**
 * The club's ratio sits in the middle; this many times more, or less, at each end: players of a club lean apart by
 * a tenth or a fifth, which must show; further leans sit at the ends.
 */
export const styleSpan = 1.5;

export interface StyleLine {
  player: ComparedPlayer;
  /** Null without a match, or with nothing to divide by. */
  ratio: number | null;
  /** From 0 at the left to 1 at the right. */
  position: number | null;
}

/**
 * Where each player stands on an axis, against the club: its ratio over every match of the players compared sits in
 * the middle. A log scale, so that twice and half the club's sit as far from it.
 */
export function styleOf(
  axis: StyleAxis,
  players: readonly ComparedPlayer[],
): { club: number | null; lines: StyleLine[] } {
  const played = players.filter((player) => player.career.matches > 0);
  const [over, under] = played.map(axis.counts).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  const club = over > 0 && under > 0 ? over / under : null;
  const lines = players.map((player): StyleLine => {
    const [a, b] = axis.counts(player);
    const ratio = player.career.matches > 0 && b > 0 ? a / b : null;
    const position =
      ratio === null || club === null
        ? null
        : Math.min(0.97, Math.max(0.03, 0.5 + Math.log(Math.max(ratio, 1e-6) / club) / (2 * Math.log(styleSpan))));
    return { player, ratio, position };
  });
  return { club, lines };
}

/**
 * The fun ones, each with its prize. A prize of something that happens in a match goes to its rate, per match or in
 * share of the matches, over the matches that came with it, ten at least: who plays most would win it otherwise, and
 * who played once by luck. Its total, how many times it happened, shows beside it in small.
 */
export const prizes: Prize[] = [
  {
    label: 'Démos / match',
    format: 'perMatch',
    value: (p) => averageFor(p, p.career.demos, p.career.measured.demos),
    total: (p) => p.career.demos,
    prize: 'Le démolisseur',
  },
  // The collector counts a shot on the post or the crossbar, not whether it then went in.
  {
    label: 'Poteaux / match',
    format: 'perMatch',
    value: (p) => averageFor(p, p.career.crossbarHits, p.career.measured.crossbarHits),
    total: (p) => p.career.crossbarHits,
    prize: 'L’abonné aux montants',
  },
  // Won among the overtimes played, three at least: one lucky overtime makes no king.
  {
    label: 'Prolongations gagnées',
    format: 'percent',
    value: (p) => {
      const overtimes = p.career.overtimeWins + p.career.overtimeLosses;
      return overtimes >= 3 ? share(p, p.career.overtimeWins, overtimes) : null;
    },
    total: (p) => p.career.overtimeWins,
    prize: 'Le roi des prolongations',
  },
  {
    label: 'Matchs sans encaisser',
    format: 'percent',
    value: (p) => shareFor(p, p.career.conceded === null ? null : p.career.cleanSheets, p.career.measured.conceded),
    total: (p) => p.career.cleanSheets,
    prize: 'Le mur',
  },
  // A night owl is one who plays many nights: the count is the prize.
  {
    label: 'Matchs après minuit',
    format: 'count',
    value: (p) => counted(p, p.career.lateNight),
    prize: 'Le noctambule',
  },
  {
    label: 'Matchs quittés',
    format: 'percent',
    value: (p) => shareFor(p, p.career.left),
    total: (p) => p.career.left,
    prize: 'Le fugueur',
  },
  { ...pushups, prize: 'Le pompier' },
  {
    label: 'MMR 2v2 perdus depuis le peak de la saison',
    format: 'count',
    // A player with no match in the modes chosen takes no prize.
    value: (p) => played(p, p.mmr?.fall ?? null),
    prize: 'Le parachutiste',
  },
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
    value: (p) => talliedFor(p.career.game.kickoffTouches),
    total: (p) => total(p.career.game.kickoffTouches),
    prize: 'Le roi du kickoff',
  },
  // The other side of Le démolisseur.
  {
    label: 'Démolitions subies / match',
    format: 'perMatch',
    value: (p) => averageFor(p, feed(p, 'Demolish', 'statfeedSecondary'), p.career.game.statfeedMatches),
    total: (p) => feed(p, 'Demolish', 'statfeedSecondary'),
    prize: 'Le punching-ball',
  },
  {
    label: 'Buts contre son camp / match',
    format: 'perMatch',
    value: (p) => talliedFor(p.career.game.ownGoals),
    total: (p) => total(p.career.game.ownGoals),
    prize: 'Le traître',
  },
];

/**
 * The parts of the table, in reading order. What happens in a match reads as a rate, per match or in share of the
 * matches, with its total in small below; a count of its own (matches, a streak, a late night) or a record reads as
 * it is.
 */
export const tableSections = [
  'Résultats',
  'Attaque',
  'Défense',
  'Dans le jeu',
  'Le boost',
  'Le mouvement',
  'Le fil du jeu',
  'Les fins de match',
  'Les records',
  'Les assists',
] as const;
export type TableSection = (typeof tableSections)[number];

/** A line of the table: its total, and its rate (an average per match, or a share of the matches). */
interface TableRow {
  section: TableSection;
  label: string;
  total: (player: ComparedPlayer) => number | null;
  /** How it reads as a rate; none for a line that stays as it is. */
  perMatch?: 'average' | 'share';
  /** What the rate divides by: the matches the figure was measured in, by default every match. */
  measuredIn?: (player: ComparedPlayer) => number;
  /** The fewest of `measuredIn` the rate shows over: ten matches for a stat of the newest collector. */
  minimum?: number;
  /** The matches behind a rate measured in something else (updates of play): the minimum counts them instead. */
  matchesIn?: (player: ComparedPlayer) => number;
  /** A share of time: its total, a count of updates of play, means nothing to a member. */
  withoutTotal?: boolean;
  estimated?: boolean;
  neutral?: boolean;
  hint?: string;
  /** Whether the total shows what it was counted among (« 12 sur 36 »), when no other line says it. */
  showOf?: boolean;
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
  minimum: prizeMinimum,
  ...extra,
});

/**
 * The margin of error of the estimated stats, in percent: the boost pickups, counted from the rises of the boost. In a
 * real match of 27 November 2026, 118 and 106 for 119 and 104 on the game's scoreboard: 1.9 % at most.
 */
export const estimateMargin = 2;

const carOf = (player: ComparedPlayer) => player.career.game.car;

/** A count of the car per match, over the matches the game showed it in, ten at least. */
const carRow = (
  section: TableSection,
  label: string,
  count: (car: CarTally) => number,
  extra: Partial<TableRow> = {},
): TableRow => ({
  section,
  label,
  total: (p) => (carOf(p).matches === 0 ? null : count(carOf(p))),
  perMatch: 'average',
  measuredIn: (p) => carOf(p).matches,
  minimum: prizeMinimum,
  ...extra,
});

/** A share of the time the car was on the pitch, over ten matches at least. */
const carTime = (
  section: TableSection,
  label: string,
  part: (car: CarTally) => number,
  extra: Partial<TableRow> = {},
): TableRow =>
  carRow(section, label, part, {
    perMatch: 'share',
    measuredIn: (p) => carOf(p).samples,
    matchesIn: (p) => carOf(p).matches,
    withoutTotal: true,
    ...extra,
  });

const tableRows = (modes: ReadonlySet<StatsMode>): TableRow[] => [
  { section: 'Résultats', label: 'Matchs', total: (p) => counted(p, p.career.matches) },
  { section: 'Résultats', label: 'Victoires', total: (p) => counted(p, p.career.wins), perMatch: 'share' },
  {
    section: 'Résultats',
    label: 'MVP',
    total: (p) => counted(p, p.career.mvps),
    perMatch: 'share',
    measuredIn: (p) => p.career.measured.mvp,
  },
  { section: 'Résultats', label: 'Win streak max', total: (p) => counted(p, p.career.winStreak) },
  {
    section: 'Résultats',
    label: 'Lose streak max',
    total: (p) => counted(p, p.career.lossStreak),
    lowerIsBetter: true,
  },
  ...([...modes].some((mode) => mode.startsWith('tournament'))
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
  { section: 'Attaque', label: 'Assists', total: (p) => counted(p, p.career.assists), perMatch: 'average' },
  gameRow('Attaque', 'Tirs', (game) => game.shots),
  {
    section: 'Attaque',
    label: 'Précision des tirs',
    total: (p) => (p.career.game.shots.total === 0 ? null : p.career.game.goalsOnShots),
    perMatch: 'share',
    measuredIn: (p) => p.career.game.shots.total,
    // Ten shots at least, as L’œil de lynx.
    minimum: 10,
    showOf: true,
  },
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
    perMatch: 'share',
    measuredIn: (p) => p.career.measured.conceded,
  },
  {
    section: 'Défense',
    label: 'Buts contre son camp',
    total: (p) => total(p.career.game.ownGoals),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.ownGoals.matches,
    minimum: prizeMinimum,
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
  // Since collector 0.8.0: the updates of play after a touch whose last touch was the player's team's.
  {
    section: 'Dans le jeu',
    label: 'Possession',
    total: (p) => (p.career.game.possession.matches === 0 ? null : p.career.game.possession.owned),
    perMatch: 'share',
    measuredIn: (p) => p.career.game.possession.samples,
    matchesIn: (p) => p.career.game.possession.matches,
    minimum: prizeMinimum,
    withoutTotal: true,
  },
  gameRow('Dans le jeu', 'Touches aériennes', (game) => game.aerialTouches),
  gameRow('Dans le jeu', 'Touches en défense', (game) => game.defensiveTouches, { neutral: true }),
  gameRow('Dans le jeu', 'Touches en attaque', (game) => game.offensiveTouches, { neutral: true }),
  // The game sends no pickup: each rise of the boost is one (collector 0.8.0).
  carRow('Le boost', 'Pastilles ramassées', (car) => car.pickups, { estimated: true }),
  carRow('Le boost', 'Grosses pastilles', (car) => car.bigPickups, { estimated: true }),
  carRow('Le boost', 'Boost ramassé', (car) => car.boostCollected, { estimated: true, perMatchFormat: 'count' }),
  carRow('Le boost', 'Boost moyen', (car) => car.boostSum, {
    measuredIn: (p) => carOf(p).samples,
    matchesIn: (p) => carOf(p).matches,
    perMatchFormat: 'count',
    withoutTotal: true,
    neutral: true,
  }),
  carTime('Le boost', 'À 0 de boost', (car) => car.noBoost, { lowerIsBetter: true }),
  carTime('Le boost', 'À 100 de boost', (car) => car.fullBoost, { neutral: true }),
  carTime('Le boost', 'En train de booster', (car) => car.boosting, { neutral: true }),
  carTime('Le mouvement', 'Supersonique', (car) => car.supersonic),
  carTime('Le mouvement', 'Au sol', (car) => car.onGround, { neutral: true }),
  carTime('Le mouvement', 'En l’air', (car) => car.samples - car.onGround - car.onWall, { neutral: true }),
  carTime('Le mouvement', 'Au mur', (car) => car.onWall, { neutral: true }),
  carRow('Le mouvement', 'Dérapages', (car) => car.powerslides, { neutral: true }),
  // Won among the overtimes played: the lost ones read in the same line.
  {
    section: 'Les fins de match',
    label: 'Prolongations gagnées',
    total: (p) => counted(p, p.career.overtimeWins),
    perMatch: 'share',
    measuredIn: (p) => p.career.overtimeWins + p.career.overtimeLosses,
    showOf: true,
  },
  {
    section: 'Les fins de match',
    label: 'FF reçus',
    total: (p) => counted(p, p.career.forfeitsReceived),
    perMatch: 'share',
  },
  {
    section: 'Les fins de match',
    label: 'FF donnés',
    total: (p) => counted(p, p.career.forfeitsGiven),
    perMatch: 'share',
    lowerIsBetter: true,
  },
  {
    section: 'Les fins de match',
    label: 'Matchs quittés',
    total: (p) => counted(p, p.career.left),
    perMatch: 'share',
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
];

/** The game's stat feed events a line of the scoreboard already counts: the table shows them once. */
const scoreboardEvents = new Set(['Goal', 'Assist', 'Save', 'Shot', 'Demolish', 'MVP', 'Win']);

/**
 * The game's events in French, whatever the language the game was played in: the words it sends follow the
 * player's game. An event not listed keeps the game's own words, or its name.
 */
const eventWords: Readonly<Record<string, string>> = {
  AerialGoal: 'But aérien',
  Assist: 'Assist',
  BackwardsGoal: 'But à reculons',
  BicycleGoal: 'But en retourné',
  BicycleHit: 'Retourné',
  Center: 'Centre',
  Clear: 'Dégagement',
  Demolish: 'Démolition',
  EpicSave: 'Arrêt décisif',
  FirstTouch: 'Premier toucher',
  FlipReset: 'Flip reset',
  Goal: 'But',
  HatTrick: 'Coup du chapeau',
  HighFive: 'Check',
  LongGoal: 'But de loin',
  LowFive: 'Check en bas',
  MVP: 'MVP',
  OvertimeGoal: 'But en prolongation',
  OwnGoal: 'But contre son camp',
  Playmaker: 'Meneur de jeu',
  PoolShot: 'Coup de billard',
  Save: 'Arrêt',
  Savior: 'Sauveur',
  Shot: 'Tir cadré',
  TurtleGoal: 'But en tortue',
  Win: 'Victoire',
};

/** A hint when there is one: an optional field is left out rather than undefined. */
const hinted = (hint: string | undefined) => (hint ? { hint } : {});

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
    ...hinted((side === 'statfeed' ? eventHints : sufferedHints)[name]),
    total: (p) => feed(p, name, side),
    perMatch: 'average',
    measuredIn: (p) => p.career.game.statfeedMatches,
    minimum: prizeMinimum,
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
        section: 'Les assists',
        label: `Pour ${scorer.shown}`,
        hint: `Les assists de chaque joueur sur un but de ${scorer.shown}.`,
        total: (giver) => assistsTo(giver, scorer),
      }),
    ),
  ];
}

/** A line of the table as shown: its figure, its part, and for a rate, the total it comes from. */
export interface TableStat extends Stat {
  section: TableSection;
  /** Whether the line reads as a rate: the part says so above it. */
  perMatch: boolean;
  /** For a rate, how many times it happened; shown on demand beside it. */
  total?: (player: ComparedPlayer) => number | null;
  /** What the total was counted among, when no other line says it: « 12 sur 36 ». */
  of?: (player: ComparedPlayer) => number;
}

/**
 * Every stat the page has, for the table, part by part: a rate with its total, or a figure as it is. A line nobody
 * has a figure for (a stat no collector sent yet) is left out.
 */
export const tableStats = (
  modes: ReadonlySet<StatsMode>,
  players: readonly ComparedPlayer[],
  labels: Readonly<Record<string, string>> = {},
): TableStat[] =>
  [...tableRows(modes), ...dataRows(players, labels)]
    .map((row): TableStat => {
      const {
        section,
        label,
        total,
        perMatch,
        measuredIn,
        minimum = 0,
        matchesIn,
        withoutTotal,
        showOf,
        format = 'count',
        perMatchFormat,
        lowerIsBetter,
        estimated,
        neutral,
        hint = statHints[label],
      } = row;
      const base = {
        section,
        label,
        ...(lowerIsBetter && { lowerIsBetter }),
        ...(estimated && { estimated }),
        ...(neutral && { neutral }),
        ...(hint && { hint }),
      };
      if (!perMatch) return { ...base, perMatch: false, format, value: total };
      const of = (player: ComparedPlayer) => measuredIn?.(player) ?? player.career.matches;
      const enough = (player: ComparedPlayer, value: number | null) =>
        (matchesIn ?? of)(player) < minimum ? null : value;
      return {
        ...base,
        perMatch: true,
        ...(!withoutTotal && { total }),
        ...(showOf && { of }),
        ...(perMatch === 'average'
          ? {
              format: perMatchFormat ?? 'perMatch',
              value: (p: ComparedPlayer) => enough(p, average(p, total(p), of(p))),
            }
          : { format: 'percent', value: (p: ComparedPlayer) => enough(p, share(p, total(p), of(p))) }),
      };
    })
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
  if (stat.neutral) return null;
  const values = players.map((player) => stat.value(player)).filter((value) => value !== null);
  if (new Set(values).size < 2) return null;
  return stat.lowerIsBetter ? Math.min(...values) : Math.max(...values);
}
