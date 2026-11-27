import { parisDay, parisHour } from '../../lib/days';
import type { GameStats } from '../../lib/game-stats';
import { matchModeOf } from '../../lib/live-stats';
import { mvpOf } from '../../lib/match-history';
import { matchIndex } from '../../lib/match-rules';
import { seasonAt } from '../../lib/season';
import type { Board } from '../board';

/** What a player did in every match the club received, as the sheet of their card shows it. */
export interface Career {
  matches: number;
  wins: number;
  losses: number;
  goals: number;
  assists: number;
  saves: number;
  mvps: number;
  /** Null while no match of the player came with them: collectors older than these counts send none. */
  demos: number | null;
  crossbarHits: number | null;
  /** The most matches won in a row, and lost in a row, in the order they were played. */
  winStreak: number;
  lossStreak: number;
  /** Tournaments the club declared won on a match this player won. */
  tournamentsWon: number;
  /** The points the game gave them, all matches added. */
  score: number;
  /** The goals the other team scored, and the matches with none, among the matches whose final score is known. */
  conceded: number | null;
  cleanSheets: number;
  /** Matches that went to overtime, won and lost. */
  overtimeWins: number;
  overtimeLosses: number;
  /** Matches the other team gave up (received), and their own team gave up (given). */
  forfeitsReceived: number;
  forfeitsGiven: number;
  /** Matches they left before the end. */
  left: number;
  /** Matches played between midnight and 5 in Paris. */
  lateNight: number;
  /**
   * The matches that came with each count an older collector does not send: an average divides by them. For the
   * MVPs, the matches whose MVP is known: every defeat, as the game names it among the winners.
   */
  measured: { demos: number; crossbarHits: number; conceded: number; mvp: number };
  /** What collector 0.7.0 adds to each match: its stats are only known from the matches it sent. */
  game: GameTally;
}

/** A count, and the matches it was measured in. */
export interface Tally {
  total: number;
  matches: number;
}

/** The stats of collector 0.7.0, added up over the matches that came with them. */
export interface GameTally {
  shots: Tally;
  /** The goals scored in the matches whose shots are known: the shots' accuracy. */
  goalsOnShots: number;
  touches: Tally;
  carTouches: Tally;
  kickoffTouches: Tally;
  ownGoals: Tally;
  /** Each stat feed event the player got, and took, by its name, with the matches that came with a feed. */
  statfeed: Map<string, number>;
  statfeedSecondary: Map<string, number>;
  statfeedMatches: number;
  /** Assists given, by the scorer's game ID. */
  assistsTo: Map<string, number>;
  /** Records: the hardest hit and the fastest goal (Unreal units per second), the longest goal (units), the quickest. */
  hardestHit: number | null;
  fastestGoal: number | null;
  longestGoal: number | null;
  quickestGoal: number | null;
}

/** Hoops and Dropshot: a goal's distance means nothing off a standard pitch. */
const oddPitches = new Set([27, 29]);

const tally = (): Tally => ({ total: 0, matches: 0 });
const addTo = (to: Tally, value: number | undefined) => {
  if (value === undefined) return;
  to.total += value;
  to.matches++;
};
const addCounts = (to: Map<string, number>, counts: Record<string, number> | undefined) => {
  for (const [name, count] of Object.entries(counts ?? {})) to.set(name, (to.get(name) ?? 0) + count);
};
const most = (record: number | null, value: number | undefined) =>
  value === undefined ? record : Math.max(record ?? value, value);
const least = (record: number | null, value: number | undefined) =>
  value === undefined ? record : Math.min(record ?? value, value);

function addGame(game: GameTally, stats: GameStats, goals: number, playlist: number | null | undefined) {
  if (stats.shots !== undefined) game.goalsOnShots += goals;
  addTo(game.shots, stats.shots);
  addTo(game.touches, stats.touches);
  addTo(game.carTouches, stats.carTouches);
  addTo(game.kickoffTouches, stats.kickoffTouches);
  addTo(game.ownGoals, stats.ownGoals);
  if (stats.statfeed) game.statfeedMatches++;
  addCounts(game.statfeed, stats.statfeed);
  addCounts(game.statfeedSecondary, stats.statfeedSecondary);
  addCounts(game.assistsTo, stats.assistsTo);
  game.hardestHit = most(game.hardestHit, stats.hardestHit);
  game.fastestGoal = most(game.fastestGoal, stats.fastestGoal);
  if (!oddPitches.has(playlist ?? 0)) game.longestGoal = most(game.longestGoal, stats.longestGoal);
  game.quickestGoal = least(game.quickestGoal, stats.quickestGoal);
}

/**
 * Which matches count: every one, the ranked ones, one ranked playlist (1v1, 2v2, 3v3), or the tournaments. A match
 * whose playlist no source sent counts in the ranked playlist of its size (see `playlistOf`).
 */
export type CareerScope = 'all' | 'ranked' | 'duel' | 'doubles' | 'standard' | 'tournament';

/** Which of the player's accounts the matches were played on: the solo one, the duo one, or either. */
export type CareerAccount = 'all' | 'solo' | 'duo';

/**
 * The modes the Stats page counts: each ranked playlist, and the tournaments by their size. Casual and private
 * matches, the extra modes and a match of no known size are in none.
 */
export type StatsMode =
  | 'duel'
  | 'doubles'
  | 'standard'
  | 'tournament-duel'
  | 'tournament-doubles'
  | 'tournament-standard';

const rankedPlaylists = { duel: 10, doubles: 11, standard: 13 } as const;

/** The ranked playlist of each team size: 1v1, 2v2, 3v3. */
const rankedOfSize: Readonly<Record<number, number>> = {
  1: rankedPlaylists.duel,
  2: rankedPlaylists.doubles,
  3: rankedPlaylists.standard,
};

const tournamentOfSize: Readonly<Record<number, StatsMode>> = {
  1: 'tournament-duel',
  2: 'tournament-doubles',
  3: 'tournament-standard',
};

/** What the club knows of a match's size: its players per team, and whether a source confirmed its scoreboard. */
interface MatchSize {
  perTeam: number;
  confirmed: boolean;
}

/**
 * Each match's players per team: the most players a team had, those who left included, or half the final
 * scoreboard rounded up when a source confirmed it (a 2v2 whose player left ends with three).
 */
function matchSizesOf(board: Board): Map<string, MatchSize> {
  const teams = new Map<string, [Set<string>, Set<string>]>();
  for (const row of board.results) {
    if (row.kind !== 'match' || row.review_required || (row.team !== 0 && row.team !== 1)) continue;
    const [blue, orange] = teams.get(row.match_guid) ?? [new Set<string>(), new Set<string>()];
    (row.team === 0 ? blue : orange).add(row.player_id.toLowerCase());
    teams.set(row.match_guid, [blue, orange]);
  }
  const expected = new Map((board.matchRosters ?? []).map((roster) => [roster.match_guid, roster.expected_players]));
  const sizes = new Map<string, MatchSize>();
  for (const guid of new Set([...teams.keys(), ...expected.keys()])) {
    const [blue, orange] = teams.get(guid) ?? [new Set(), new Set()];
    const players = expected.get(guid);
    const confirmed = typeof players === 'number' && players > 0;
    const perTeam = Math.max(blue.size, orange.size, confirmed ? Math.ceil(players / 2) : 0);
    sizes.set(guid, { perTeam, confirmed });
  }
  return sizes;
}

// The board's matches are read for every player and every filter: their sizes, once per board.
const sizesCache = new WeakMap<Board['results'], Map<string, MatchSize>>();
const matchSizes = (board: Board) => {
  const known = sizesCache.get(board.results);
  if (known) return known;
  const sizes = matchSizesOf(board);
  sizesCache.set(board.results, sizes);
  return sizes;
};

/**
 * A match's playlist, or for one whose playlist no source sent (most were received before the app kept it, on
 * 12 November 2026), the ranked playlist of its size, once a source confirmed its scoreboard: a guess, which counts a
 * casual or private match of that size with the ranked ones. The club plays neither, or a handful.
 */
export const playlistOf = (playlist: number | null | undefined, size: MatchSize | undefined) =>
  playlist ?? (size?.confirmed ? (rankedOfSize[size.perTeam] ?? null) : null);

/** The Stats page's mode of a match: its ranked playlist, or a tournament of its size; null for any other. */
export function statsModeOf(playlist: number | null | undefined, size: MatchSize | undefined): StatsMode | null {
  const played = playlistOf(playlist, size);
  if (played === rankedPlaylists.duel) return 'duel';
  if (played === rankedPlaylists.doubles) return 'doubles';
  if (played === rankedPlaylists.standard) return 'standard';
  if (matchModeOf(played) === 'tournament') return tournamentOfSize[size?.perTeam ?? 0] ?? null;
  return null;
}

/** The modes the club played a match of, among those the Stats page counts. */
export function modesPlayed(board: Board): Set<StatsMode> {
  const sizes = matchSizes(board);
  return new Set(
    board.results
      .filter((row) => row.kind === 'match' && !row.review_required)
      .map((row) => statsModeOf(row.playlist, sizes.get(row.match_guid)))
      .filter((mode) => mode !== null),
  );
}

function inScope(scope: CareerScope | ReadonlySet<StatsMode>, playlist: number | null, size: MatchSize | undefined) {
  if (typeof scope !== 'string') {
    const mode = statsModeOf(playlist, size);
    return mode !== null && scope.has(mode);
  }
  if (scope === 'all') return true;
  const played = playlistOf(playlist, size);
  if (scope === 'ranked' || scope === 'tournament') return matchModeOf(played) === scope;
  return played === rankedPlaylists[scope];
}

/** The player the game named MVP of each match, by their game ID in lower case, once a collector 0.7.0 saw it. */
function gameMvpsOf(board: Board): Map<string, string> {
  return new Map(
    board.results
      .filter((row) => row.kind === 'match' && !row.review_required && (row.game_stats?.statfeed?.MVP ?? 0) > 0)
      .map((row) => [row.match_guid, row.player_id.toLowerCase()]),
  );
}

const mvpsCache = new WeakMap<Board['results'], Map<string, string>>();
const gameMvps = (board: Board) => {
  const known = mvpsCache.get(board.results);
  if (known) return known;
  const mvps = gameMvpsOf(board);
  mvpsCache.set(board.results, mvps);
  return mvps;
};

/** The game ID of the player's solo account, in lower case, once the rank source found it. */
export const soloAccountOf = (board: Board, name: string): string | null =>
  board.doublesRanks?.find((rank) => rank.player === name)?.solo?.playerId?.toLowerCase() ?? null;

function onAccount(account: CareerAccount, solo: string | null, playerId: string) {
  if (account === 'all') return true;
  return (solo === playerId.toLowerCase()) === (account === 'solo');
}

/**
 * The season a match was played in. A match received on its own day was played just before; one received later (an
 * import, a source catching up) only tells its day, counted at noon in Paris.
 */
export const seasonOf = (row: { day: string; received: string }): number | null =>
  seasonAt(parisDay(row.received) === row.day ? row.received : `${row.day}T12:00:00+01:00`);

const added = (total: number | null, value: number | null | undefined) =>
  typeof value === 'number' ? (total ?? 0) + value : total;

/** The player's lines of the matches no source disputes, each match once, and the MVPs among them. */
export function careerOf(
  board: Board,
  name: string,
  /** A view of the player's sheet, or the Stats page's modes. */
  scope: CareerScope | ReadonlySet<StatsMode>,
  account: CareerAccount = 'all',
  /** The competitive seasons counted, or every match when null. */
  seasons: ReadonlySet<number> | null = null,
): Career {
  const solo = soloAccountOf(board, name);
  const index = matchIndex(board.results, board.matchRosters ?? []);
  const sizes = matchSizes(board);
  const named = gameMvps(board);
  const lines = new Map(
    board.results
      .filter(
        (row) =>
          row.name === name &&
          row.kind === 'match' &&
          !row.review_required &&
          inScope(scope, row.playlist, sizes.get(row.match_guid)) &&
          onAccount(account, solo, row.player_id) &&
          (seasons === null || seasons.has(seasonOf(row) ?? 0)),
      )
      .map((row) => [row.match_guid, row]),
  );
  const career: Career = {
    matches: 0,
    wins: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    mvps: 0,
    demos: null,
    crossbarHits: null,
    winStreak: 0,
    lossStreak: 0,
    tournamentsWon: 0,
    score: 0,
    conceded: null,
    cleanSheets: 0,
    overtimeWins: 0,
    overtimeLosses: 0,
    forfeitsReceived: 0,
    forfeitsGiven: 0,
    left: 0,
    lateNight: 0,
    measured: { demos: 0, crossbarHits: 0, conceded: 0, mvp: 0 },
    game: {
      shots: tally(),
      goalsOnShots: 0,
      touches: tally(),
      carTouches: tally(),
      kickoffTouches: tally(),
      ownGoals: tally(),
      statfeed: new Map(),
      statfeedSecondary: new Map(),
      statfeedMatches: 0,
      assistsTo: new Map(),
      hardestHit: null,
      fastestGoal: null,
      longestGoal: null,
      quickestGoal: null,
    },
  };
  const tournamentsWon = board.rules?.tournamentWins ?? [];
  // A match received late (an import, a source catching up) still belongs to its own day.
  const played = [...lines].sort(
    ([, a], [, b]) => a.day.localeCompare(b.day) || (a.received ?? a.day).localeCompare(b.received ?? b.day),
  );
  // Wins in a row while positive, losses in a row while negative.
  let run = 0;
  for (const [guid, row] of played) {
    // A player who left lost the match, whatever his team did after.
    const won = !row.left && row.team === row.winner;
    career.matches++;
    career[won ? 'wins' : 'losses']++;
    run = won ? Math.max(run, 0) + 1 : Math.min(run, 0) - 1;
    career.winStreak = Math.max(career.winStreak, run);
    career.lossStreak = Math.max(career.lossStreak, -run);
    career.goals += row.goals;
    career.assists += row.assists;
    career.saves += row.saves;
    career.demos = added(career.demos, row.demos);
    career.crossbarHits = added(career.crossbarHits, row.crossbar_hits);
    if (typeof row.demos === 'number') career.measured.demos++;
    if (typeof row.crossbar_hits === 'number') career.measured.crossbarHits++;
    // The game's MVP when a collector saw it named, else the best score of the winners once the scoreboard is whole.
    const mvp = named.get(guid) ?? mvpOf(index.get(guid))?.toLowerCase() ?? null;
    if (!won || mvp !== null) career.measured.mvp++;
    if (won && mvp === row.player_id.toLowerCase()) career.mvps++;
    if (won && tournamentsWon.includes(guid)) career.tournamentsWon++;
    career.score += row.score;
    // The final score as the game counted it, blue first: a team is 0 for blue, 1 for orange.
    if (typeof row.blue_goals === 'number' && typeof row.orange_goals === 'number') {
      const against = row.team === 0 ? row.orange_goals : row.blue_goals;
      career.conceded = (career.conceded ?? 0) + against;
      career.measured.conceded++;
      if (against === 0) career.cleanSheets++;
    }
    if (row.overtime) career[won ? 'overtimeWins' : 'overtimeLosses']++;
    if (row.forfeit && !row.left) career[won ? 'forfeitsReceived' : 'forfeitsGiven']++;
    if (row.left) career.left++;
    // A match received on its own day was played just before: its hour is the one the collector sent it at.
    if (parisDay(row.received) === row.day && parisHour(row.received) < 5) career.lateNight++;
    if (row.game_stats) addGame(career.game, row.game_stats, row.goals, row.playlist);
  }
  return career;
}
