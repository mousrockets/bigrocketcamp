import type { Roster } from './club';
import { parisDay } from './days';
import { normalizeParticipant, type ReceivedResult } from './domain';
import { type ReceivedRoster, validateMatchRosters } from './match-rules';
import { parseOrThrow, says, z } from './validation';

// Official local Stats API. Matchmaking playlists, private matches and players' own tournaments; unknown,
// training and bot playlists fail closed. Count is the full standard scoreboard.
const playerCounts = new Map([
  [1, 2],
  [2, 4],
  [3, 6],
  [4, 8],
  [6, 8],
  [10, 2],
  [11, 4],
  [13, 6],
  [22, 6],
  [27, 4],
  [28, 6],
  [29, 6],
  [30, 6],
  [34, 6],
]);

/** Ranked Doubles: the only playlist whose matches change the 2v2 rating. */
export const rankedDoublesPlaylist = 11;

/** The kind of game a playlist plays, as the replay shows it. */
export type MatchMode = 'casual' | 'ranked' | 'tournament' | 'private';

const modes = new Map<number, MatchMode>([
  [1, 'casual'],
  [2, 'casual'],
  [3, 'casual'],
  [4, 'casual'],
  [6, 'private'],
  [10, 'ranked'],
  [11, 'ranked'],
  [13, 'ranked'],
  [22, 'tournament'],
  [27, 'ranked'],
  [28, 'ranked'],
  [29, 'ranked'],
  [30, 'ranked'],
  [34, 'tournament'],
]);

/** The kind of game of a playlist; null for one unknown, or a match received before playlists were kept. */
export const matchModeOf = (playlist: number | null | undefined): MatchMode | null =>
  (playlist == null ? undefined : modes.get(playlist)) ?? null;

/** Whether a received match can have changed its players' ranked 2v2 rating. */
export const isRankedDoubles = (match: LivePayload) => match.state.Game.PlaylistId === rankedDoublesPlaylist;

const canonical = (id: unknown) =>
  String(id)
    .replace(/^PSN\|/, 'PS4|')
    .replace(/^(Epic\|)([^|]+)/, (_, prefix: string, uid: string) => prefix + uid.toLowerCase());

export interface LivePlayer {
  Name?: unknown;
  PrimaryId?: unknown;
  /** How the game names the player in its events, with his team. */
  Shortcut?: unknown;
  TeamNum?: unknown;
  Score?: unknown;
  Goals?: unknown;
  Assists?: unknown;
  Saves?: unknown;
  /** Demolitions the player made. Absent from older collectors. */
  Demos?: unknown;
  /**
   * Shots of the player that hit the frame of the opponents' goal, once per touch, outside goal replays. Absent from
   * older collectors.
   */
  CrossbarHits?: unknown;
}

export interface LiveTeam {
  Name?: unknown;
  TeamNum?: unknown;
  Score?: unknown;
}

export interface LiveMatch {
  state: {
    MatchGuid: string;
    Players: LivePlayer[];
    Game: {
      PlaylistId?: unknown;
      Teams?: LiveTeam[];
      bHasWinner?: unknown;
      bReplay?: unknown;
      Winner?: unknown;
      /** Seconds left on the clock at the end; counts up in overtime. Absent from older collectors. */
      TimeSeconds?: unknown;
      bOvertime?: unknown;
    };
  };
  end: { MatchGuid: string; WinnerTeamNum: unknown };
  startedAt: number;
  endedAt: number | null;
  seenIds: unknown[];
  /** The clock's last changes before MatchEnded and its first ones after. Absent from older collectors. */
  clockTrace?: ClockSample[];
  /** The players who left before MatchEnded, omitted when nobody did. Absent from older collectors. */
  departures?: LiveDeparture[];
}

/**
 * An identified player seen in the match and absent from its last update before MatchEnded, with the last line
 * seen of him. A player who left and came back before the end is not one.
 */
export interface LiveDeparture {
  PrimaryId: unknown;
  Name: unknown;
  TeamNum: unknown;
  Score: unknown;
  Goals: unknown;
  Assists: unknown;
  Saves: unknown;
  Demos?: unknown;
  CrossbarHits?: unknown;
}

/** How many departures a payload holds at most. */
export const departuresMax = 8;

/** The sender left the match before its end: the last scoreboard he saw, which holds no result. */
export interface LiveLeft {
  left: true;
  state: {
    MatchGuid: string;
    Players: LivePlayer[];
    Game: { PlaylistId?: unknown; Teams?: LiveTeam[]; bReplay?: unknown };
  };
  startedAt: number;
  leftAt: number;
  seenIds: unknown[];
}

/** What the collector or the browser sends to POST /api/live: a finished match, or one its sender left. */
export type LivePayload = LiveMatch | LiveLeft;

export const isLeft = (payload: unknown): payload is LiveLeft =>
  typeof payload === 'object' && payload !== null && (payload as { left?: unknown }).left === true;

/**
 * One change of the game's clock near the end of a match. The trace shows how the game ends a forfeit, which no
 * documentation says: whether the clock keeps the time left, or goes to 0:00 at once or after MatchEnded.
 */
export interface ClockSample {
  TimeSeconds?: number;
  bOvertime?: boolean;
  /** Whether MatchEnded had come. */
  ended: boolean;
}

/** How many changes of the clock the trace keeps on each side of MatchEnded. */
export const clockTraceSide = 6;

const finished = 'Fin de match absente ou incohérente.';
const dated = 'Date du match invalide.';
const onlineMatch = 'Match en ligne terminé requis.';
const finalTeams = 'Équipes finales invalides.';
const winnerDiffers = 'Gagnant du tableau différent de la fin de match.';
const invalidBoard = 'Tableau final invalide.';
const nobody = 'Aucun joueur identifié dans le tableau final.';
const ambiguous = 'Participants du tableau ambigus.';
const unbalanced = 'Tableau des équipes invalide.';
const invalidResult = 'Résultat invalide.';
const invalidStats = 'Statistiques invalides.';
const nameless = 'Nom du joueur invalide.';
const leftMatch = 'Match quitté absent ou incohérent.';
const primaryId = /^(Epic|Steam|PS4|PSN|XboxOne|Switch|PsyNet)\|[^\s|]{1,128}\|0$/;
const identified = (player: LivePlayer) => typeof player.PrimaryId === 'string' && primaryId.test(player.PrimaryId);
const statistic = z.int(says(invalidStats)).min(0, says(invalidStats)).max(1_000_000, says(invalidStats));
const notBlank = (text: string) => text.trim() !== '';

/**
 * A finished public match as the collector sends it. The checks run in stages, each with its own message,
 * so that a scoreboard is refused for the first thing wrong with it. `now` dates the reception.
 * Players who left (a forfeit, a quit) are missing, and bots have no platform ID: neither is counted, so the
 * accepted scoreboard keeps only the identified players.
 */
const statistics = { Score: statistic, Goals: statistic, Assists: statistic, Saves: statistic };
// Older collectors send neither, and an unreadable one is unknown: the match still counts.
const optionalStatistic = z.int().min(0).max(1_000_000).optional().catch(undefined);
const extraStatistics = { Demos: optionalStatistic, CrossbarHits: optionalStatistic };
const playerName = z.string(says(nameless)).max(128, says(nameless)).refine(notBlank, says(nameless));

/** The checks of a scoreboard's players, end or left: each stage receives what the stage before it accepted. */
function scoreboardStages() {
  const publicGame = z.looseObject({
    state: z.looseObject({
      Game: z.looseObject(
        {
          PlaylistId: z.number(says(onlineMatch)).refine((id) => playerCounts.has(id), says(onlineMatch)),
          bReplay: z.literal(false, says(onlineMatch)),
        },
        says(onlineMatch),
      ),
    }),
  });
  const board = z
    .looseObject({
      state: z.looseObject({
        Players: z.array(z.unknown(), says(invalidBoard)),
        Game: z.looseObject({ PlaylistId: z.number() }),
      }),
    })
    .refine(({ state }) => state.Players.length <= (playerCounts.get(state.Game.PlaylistId) ?? 0), says(invalidBoard));
  const onlyIdentified = z.pipe(
    z.looseObject({ state: z.looseObject({ Players: z.array(z.unknown()) }) }),
    z.transform((match) => ({
      ...match,
      state: {
        ...match.state,
        Players: match.state.Players.filter(
          (player) => typeof player === 'object' && player !== null && identified(player as LivePlayer),
        ),
      },
    })),
  );
  const someone = z
    .looseObject({ state: z.looseObject({ Players: z.array(z.unknown()) }) })
    .refine(({ state }) => state.Players.length > 0, says(nobody));
  const distinct = z
    .looseObject({ state: z.looseObject({ Players: z.array(z.looseObject({ PrimaryId: z.string() })) }) })
    .refine(({ state }) => {
      const ids = state.Players.map((player) => canonical(player.PrimaryId));
      return new Set(ids).size === ids.length;
    }, says(ambiguous));
  const balanced = z
    .looseObject({
      state: z.looseObject({
        Players: z.array(z.looseObject({ TeamNum: z.unknown() })),
        Game: z.looseObject({ PlaylistId: z.number() }),
      }),
    })
    .refine(({ state }) => {
      const half = (playerCounts.get(state.Game.PlaylistId) ?? 0) / 2;
      return [0, 1].every((side) => state.Players.filter((player) => player.TeamNum === side).length <= half);
    }, says(unbalanced));
  const participants = z.looseObject({
    state: z.looseObject({
      Players: z.array(
        z.looseObject({
          TeamNum: z.literal([0, 1], says(invalidResult)),
          ...statistics,
          ...extraStatistics,
          Name: playerName,
        }),
      ),
    }),
  });
  return { publicGame, rest: [board, onlyIdentified, someone, distinct, balanced, participants] };
}

const chained = <Output>(stages: z.ZodType[]) =>
  stages
    .map((stage) => stage as unknown as z.ZodType<unknown, unknown>)
    .reduce((checked, stage) => z.pipe(checked, stage)) as unknown as z.ZodType<Output, unknown>;

/** A match's start and its end (or its leaving), received within a day. */
const timedBetween = (now: () => number, last: 'endedAt' | 'leftAt') =>
  z.looseObject({ startedAt: z.int(says(dated)), [last]: z.int(says(dated)) }).refine((match) => {
    const startedAt = match.startedAt as number;
    const at = match[last] as number;
    return startedAt <= at && at - startedAt <= 10_800_000 && at <= now() + 30_000 && at >= now() - 86_400_000;
  }, says(dated));

/**
 * A finished public match as the collector sends it. The checks run in stages, each with its own message,
 * so that a scoreboard is refused for the first thing wrong with it. `now` dates the reception.
 * Players who left (a forfeit, a quit) are missing, and bots have no platform ID: neither is counted, so the
 * accepted scoreboard keeps only the identified players.
 */
export function liveMatchInput(now: () => number = Date.now) {
  const ended = z
    .looseObject(
      {
        state: z.looseObject(
          { MatchGuid: z.string(says(finished)).max(128, says(finished)).refine(notBlank, says(finished)) },
          says(finished),
        ),
        end: z.looseObject(
          { MatchGuid: z.string(says(finished)), WinnerTeamNum: z.literal([0, 1], says(finished)) },
          says(finished),
        ),
      },
      says(finished),
    )
    .refine((match) => match.end.MatchGuid === match.state.MatchGuid, says(finished));
  const timed = timedBetween(now, 'endedAt');
  const { publicGame, rest } = scoreboardStages();
  // MatchEnded names the winner. A forfeit can end the match before the scoreboard says so, so bHasWinner
  // and Winner only have to agree with it when they are set.
  // The clock at the end tells a forfeit from an overtime. Older collectors do not send it, and an unreadable
  // one is unknown: the match still counts.
  const clock = z.looseObject({
    state: z.looseObject({
      Game: z.looseObject({
        TimeSeconds: z.number().min(0).max(10_800).optional().catch(undefined),
        bOvertime: z.boolean().optional().catch(undefined),
      }),
    }),
    clockTrace: z
      .array(
        z.object({
          TimeSeconds: z.number().min(0).max(10_800).optional(),
          bOvertime: z.boolean().optional(),
          ended: z.boolean(),
        }),
      )
      .max(clockTraceSide * 2)
      .optional()
      .catch(undefined),
  });
  // Who left before the end. Older collectors do not send it, and an unreadable list is dropped: the match
  // still counts, as if nobody had left.
  const departed = z.looseObject({
    departures: z
      .array(
        z.object({
          PrimaryId: z.string().regex(primaryId),
          Name: playerName,
          TeamNum: z.literal([0, 1]),
          ...statistics,
          ...extraStatistics,
        }),
      )
      .max(departuresMax)
      .optional()
      .catch(undefined),
  });
  const team = z.looseObject(
    {
      TeamNum: z.literal([0, 1], says(finalTeams)),
      Name: z.string(says(finalTeams)).min(1, says(finalTeams)),
      Score: z.int(says(finalTeams)).min(0, says(finalTeams)),
    },
    says(finalTeams),
  );
  const teams = z.looseObject({
    state: z.looseObject({
      Game: z.looseObject({
        Teams: z
          .array(team, says(finalTeams))
          .length(2, says(finalTeams))
          .refine((both) => new Set(both.map((side) => side.TeamNum)).size === 2, says(finalTeams)),
      }),
    }),
  });
  const winner = z
    .looseObject({
      end: z.looseObject({ WinnerTeamNum: z.number() }),
      state: z.looseObject({
        Game: z.looseObject({
          Teams: z.array(z.looseObject({ TeamNum: z.number(), Name: z.string() })),
          Winner: z.unknown(),
        }),
      }),
    })
    .refine(({ end, state }) => {
      const named = state.Game.Winner;
      return (
        typeof named !== 'string' ||
        !named ||
        named === state.Game.Teams.find((side) => side.TeamNum === end.WinnerTeamNum)?.Name
      );
    }, says(winnerDiffers));
  // Each stage receives what the stage before it accepted: a stage only reads what earlier stages checked.
  return chained<LiveMatch>([ended, timed, publicGame, clock, departed, teams, winner, ...rest]);
}

/**
 * A public match its sender left before the end: the last scoreboard he saw, checked like a final one but
 * without a winner, which nobody knew yet.
 */
export function liveLeftInput(now: () => number = Date.now) {
  const left = z.looseObject(
    {
      left: z.literal(true, says(leftMatch)),
      state: z.looseObject(
        { MatchGuid: z.string(says(leftMatch)).max(128, says(leftMatch)).refine(notBlank, says(leftMatch)) },
        says(leftMatch),
      ),
    },
    says(leftMatch),
  );
  const { publicGame, rest } = scoreboardStages();
  return chained<LiveLeft>([left, timedBetween(now, 'leftAt'), publicGame, ...rest]);
}

/** What POST /api/live accepts: a payload that says it was left is checked as one, any other as a finished match. */
export function livePayloadInput(now: () => number = Date.now) {
  const ended = liveMatchInput(now);
  const left = liveLeftInput(now);
  return z.unknown().transform((input, context): LivePayload => {
    const result = z.safeParse(isLeft(input) ? left : ended, input);
    if (result.success) return result.data;
    for (const issue of result.error.issues)
      context.addIssue({ code: 'custom', message: issue.message, path: [...issue.path] });
    return z.NEVER;
  });
}

/** What a received match or departure becomes: result lines, full scoreboards, and lines of players who left. */
export interface LiveRows {
  rows: ReceivedResult[];
  rosters: ReceivedRoster[];
  /** Players who left before the end: each one's last line, a defeat for his team. */
  departures: ReceivedResult[];
}

/** A player's line of a match, named after the club's players; `winner` decides it. */
function lineOf(roster: Roster, guid: string, day: string, player: LivePlayer, winner: unknown): ReceivedResult {
  return normalizeParticipant(roster, {
    MatchGuid: guid.trim().toLowerCase(),
    PlayerId: canonical(player.PrimaryId),
    Name: player.Name,
    Day: day,
    Kind: 'match',
    Team: player.TeamNum,
    Winner: winner,
    Score: player.Score,
    Goals: player.Goals,
    Assists: player.Assists,
    Saves: player.Saves,
    Demos: player.Demos,
    CrossbarHits: player.CrossbarHits,
  });
}

/** A player who left lost the match, whatever his team did after. */
const leaverLine = (roster: Roster, guid: string, day: string, player: LivePlayer) =>
  lineOf(roster, guid, day, player, player.TeamNum === 0 ? 1 : 0);

/**
 * Every identified player of the losing team left before the end: a forfeit. The final scoreboard alone never
 * tells it, losers often quit during the podium; and a player seen whom neither the scoreboard nor the departures
 * place may be a loser who stayed until the end.
 */
function opponentsGone(match: LiveMatch, departures: readonly LiveDeparture[]): boolean {
  const losers = match.end.WinnerTeamNum === 0 ? 1 : 0;
  const placed = new Set([...match.state.Players, ...departures].map((player) => canonical(player.PrimaryId)));
  const unplaced = match.seenIds.some(
    (id) => typeof id === 'string' && primaryId.test(id) && !placed.has(canonical(id)),
  );
  return (
    departures.some((player) => player.TeamNum === losers) &&
    !match.state.Players.some((player) => player.TeamNum === losers) &&
    !unplaced
  );
}

/** The match's lines, once `liveMatchInput` accepted it, named after the club's players. */
export function liveMatchRows(roster: Roster, match: LiveMatch): LiveRows {
  const { state, end, startedAt } = match;
  // Epic groups its history by RecordStartTimestamp. Use the observed start,
  // including matches that finish after Paris midnight, to keep that convention.
  const day = parisDay(new Date(startedAt));
  const rows = state.Players.map((player: LivePlayer) =>
    lineOf(roster, state.MatchGuid, day, player, end.WinnerTeamNum),
  );
  // A player on the final scoreboard came back: he did not leave.
  const present = new Set(state.Players.map((player) => canonical(player.PrimaryId)));
  const gone = (match.departures ?? []).filter(
    (player, index, all) =>
      !present.has(canonical(player.PrimaryId)) &&
      all.findIndex((other) => canonical(other.PrimaryId) === canonical(player.PrimaryId)) === index,
  );
  const { TimeSeconds, bOvertime } = state.Game;
  const clock = {
    ...(typeof TimeSeconds === 'number' ? { timeSeconds: TimeSeconds } : {}),
    ...(typeof bOvertime === 'boolean' ? { overtime: bOvertime } : {}),
  };
  const trace = match.clockTrace ? { clockTrace: JSON.stringify(match.clockTrace) } : {};
  const forfeit = opponentsGone(match, gone) ? { opponentsGone: true } : {};
  // The scoreboard only holds the players present at the end; the teams' score keeps the goals of those who left.
  const goalsOf = (team: number) => state.Game.Teams?.find((side) => side.TeamNum === team)?.Score;
  const [blueGoals, orangeGoals] = [goalsOf(0), goalsOf(1)];
  const score = typeof blueGoals === 'number' && typeof orangeGoals === 'number' ? { blueGoals, orangeGoals } : {};
  const rosters = validateMatchRosters([{ MatchGuid: rows[0]?.matchGuid, PlayerCount: rows.length }], rows).map(
    (roster) => ({ ...roster, ...clock, ...trace, ...forfeit, ...score, playlist: state.Game.PlaylistId as number }),
  );
  return { rows, rosters, departures: gone.map((player) => leaverLine(roster, state.MatchGuid, day, player)) };
}

/**
 * A match its sender left, once `liveLeftInput` accepted it: its lines are no results, the match was not over.
 * `rows` holds them to tell whose scoreboard it is; `departures`, the line of each player, of whom the route
 * keeps the sender's own.
 */
export function leftMatchRows(roster: Roster, match: LiveLeft): LiveRows {
  const day = parisDay(new Date(match.startedAt));
  const departures = match.state.Players.map((player) => leaverLine(roster, match.state.MatchGuid, day, player));
  return { rows: departures, rosters: [], departures };
}

/** What a payload accepted by `livePayloadInput` becomes. */
export const livePayloadRows = (roster: Roster, payload: LivePayload): LiveRows =>
  isLeft(payload) ? leftMatchRows(roster, payload) : liveMatchRows(roster, payload);

export function parseLiveMatch(roster: Roster, input: unknown, now: number = Date.now()): LiveRows {
  return livePayloadRows(
    roster,
    parseOrThrow(
      livePayloadInput(() => now),
      input,
      'Envoi invalide.',
    ),
  );
}

/** Checks a payload before keeping or sending it; the API names the club's players when it arrives. */
export function checkLiveMatch(input: unknown, now: number): void {
  parseLiveMatch([], input, now);
}

export interface StatsMessage {
  Event?: string;
  // biome-ignore lint/suspicious/noExplicitAny: the game's event payloads differ by event.
  Data?: any;
}

const maxBuffer = 262_144;

// WebSocket frames may contain several JSON objects, or part of one object.
// Bound the stream and handle braces inside escaped JSON strings correctly.
export function statsStream() {
  let buffer = '';
  return {
    push(text: unknown): StatsMessage[] {
      if (typeof text !== 'string' || text.length > maxBuffer) {
        buffer = '';
        throw new Error('Message local trop volumineux.');
      }
      buffer += text;
      if (buffer.length > maxBuffer) {
        buffer = '';
        throw new Error('Message local trop volumineux.');
      }
      const messages: StatsMessage[] = [];
      let start = -1;
      let depth = 0;
      let quoted = false;
      let escaped = false;
      let consumed = 0;
      try {
        for (let index = 0; index < buffer.length; index++) {
          const character = buffer[index] ?? '';
          if (start < 0) {
            if (/\s/.test(character)) {
              consumed = index + 1;
              continue;
            }
            if (character !== '{') throw new Error();
            start = index;
            depth = 1;
            continue;
          }
          if (quoted) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') quoted = false;
            continue;
          }
          if (character === '"') quoted = true;
          else if (character === '{') depth++;
          else if (character === '}' && --depth === 0) {
            const message = JSON.parse(buffer.slice(start, index + 1));
            if (typeof message.Data === 'string') message.Data = JSON.parse(message.Data);
            messages.push(message);
            if (messages.length > 100) throw new Error();
            start = -1;
            consumed = index + 1;
          }
        }
      } catch {
        buffer = '';
        throw new Error('Message local illisible.');
      }
      buffer = buffer.slice(consumed);
      return messages;
    },
    reset() {
      buffer = '';
    },
  };
}

interface CurrentMatch {
  guid: string;
  startedAt: number;
  seen: Set<unknown>;
  end: { MatchGuid: string; WinnerTeamNum: unknown } | null;
  endedAt: number | null;
  candidate: string | null;
  /** The latest scoreboard seen, sent if the match is left right after its end (a forfeit, an early exit). */
  last: LiveMatch['state'] | null;
  clock: MatchClock;
  trace: ClockSample[];
  /** Each identified player seen in a usable update before MatchEnded, first seen first, with his last line. */
  players: Map<string, LiveDeparture>;
  /** The identified players of the last usable update before MatchEnded. */
  present: Set<string>;
  /** The last usable scoreboard before MatchEnded, sent if the sender leaves the match before its end. */
  usable: LiveLeft['state'] | null;
  sent: boolean;
  /** Each identified player by the shortcut and team the game names him with in its events. */
  shortcuts: Map<string, string>;
  /** Crossbar or post hits of each identified player, by his ID. */
  crossbars: Map<string, number>;
  /** False once the ball hit the frame, until someone touches it again: a bounce bar then post is one shot. */
  touchedSinceFrame: boolean;
  /** True from a goal to the next kickoff: the goal replay sends the hits of the frame again. */
  afterGoal: boolean;
}

/** The goal a team attacks: blue (0) the orange one, at positive Y; orange (1) the blue one, at negative Y. */
const hitsOpponentGoal = (team: unknown, y: unknown) =>
  typeof y === 'number' && ((team === 0 && y > 0) || (team === 1 && y < 0));

/** The game names a player in its events by a shortcut, unique within his team. */
const shortcutKey = (shortcut: unknown, team: unknown) => JSON.stringify([shortcut, team]);

interface MatchClock {
  TimeSeconds?: unknown;
  bOvertime?: unknown;
}

/**
 * The clock of the last update before MatchEnded, which the API reads a forfeit from. The tick that reaches 0:00
 * may arrive after MatchEnded, so an update after the end lowers a clock that showed one second at most. More
 * time left stays: the game may set the clock to 0:00 once a team forfeits, and the forfeit would be lost.
 */
function keptClock(kept: MatchClock, game: MatchClock | undefined, ended: boolean): MatchClock {
  const seen = { TimeSeconds: game?.TimeSeconds, bOvertime: game?.bOvertime };
  if (!ended) return seen;
  const lastSecond = typeof kept.TimeSeconds !== 'number' || kept.TimeSeconds <= 1;
  const lower =
    lastSecond &&
    typeof seen.TimeSeconds === 'number' &&
    (typeof kept.TimeSeconds !== 'number' || seen.TimeSeconds < kept.TimeSeconds);
  return {
    TimeSeconds: lower ? seen.TimeSeconds : kept.TimeSeconds,
    bOvertime: kept.bOvertime === undefined ? seen.bOvertime : kept.bOvertime,
  };
}

/**
 * The trace with an update's clock when it changed: the last changes before the end, the first ones after. A game
 * that sends no clock leaves it empty, and the payload without it.
 */
function tracedClock(trace: ClockSample[], game: MatchClock | undefined, ended: boolean): ClockSample[] {
  const sample: ClockSample = {
    ...(typeof game?.TimeSeconds === 'number' ? { TimeSeconds: game.TimeSeconds } : {}),
    ...(typeof game?.bOvertime === 'boolean' ? { bOvertime: game.bOvertime } : {}),
    ended,
  };
  if (!('TimeSeconds' in sample) && !('bOvertime' in sample)) return trace;
  const previous = trace.at(-1);
  if (
    previous?.TimeSeconds === sample.TimeSeconds &&
    previous?.bOvertime === sample.bOvertime &&
    previous?.ended === ended
  )
    return trace;
  if (!ended) return [...trace, sample].slice(-clockTraceSide);
  return trace.filter((kept) => kept.ended).length < clockTraceSide ? [...trace, sample] : trace;
}

/** The players seen before the end and absent from its last usable update, at most `departuresMax`. */
function departuresOf(match: CurrentMatch): { departures?: LiveDeparture[] } {
  const gone = [...match.players.values()]
    .filter((player) => !match.present.has(player.PrimaryId as string))
    .slice(0, departuresMax);
  return gone.length ? { departures: gone } : {};
}

function endPayload(match: CurrentMatch, state: LiveMatch['state'], end: LiveMatch['end']): LiveMatch {
  return {
    state,
    end,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    seenIds: [...match.seen],
    ...(match.trace.length ? { clockTrace: match.trace } : {}),
    ...departuresOf(match),
  };
}

// A live match must be observed from its creation/initialization. Never import
// a loaded replay or reuse another match's cached scoreboard. Wait for two
// identical post-winner updates instead of treating the last pre-end tick as final,
// unless the match is left first: then the latest scoreboard goes with MatchEnded's winner.
// A match left before MatchEnded (destroyed, or another one created) sends its last usable scoreboard as left:
// the sender's defeat. A closed stream or socket sends nothing: the game may still be playing the match.
export function matchCapture(onComplete: (payload: LivePayload) => void, now: () => number = Date.now) {
  let current: CurrentMatch | null = null;
  const blocked = new Set<string>();
  const leave = (match: CurrentMatch) => {
    if (match.end || match.sent || !match.usable) return;
    const payload: LiveLeft = {
      left: true,
      state: match.usable,
      startedAt: match.startedAt,
      leftAt: now(),
      seenIds: [...match.seen],
    };
    try {
      checkLiveMatch(payload, now());
    } catch {
      return;
    }
    match.sent = true;
    onComplete(payload);
  };
  return {
    handle(message: StatsMessage | null | undefined) {
      const { Event: event, Data: data } = message || {};
      if (!data || typeof data.MatchGuid !== 'string') return;
      const guid: string = data.MatchGuid;
      if (event === 'ReplayCreated') {
        blocked.add(guid);
        if (blocked.size > 30) blocked.delete(blocked.values().next().value as string);
        if (current?.guid === guid) current = null;
        return;
      }
      if (event === 'MatchDestroyed') {
        if (current?.guid !== guid) return;
        const ended = current;
        current = null;
        if (!ended.end) {
          leave(ended);
          return;
        }
        if (ended.sent || !ended.last) return;
        const payload = endPayload(ended, ended.last, ended.end);
        try {
          checkLiveMatch(payload, now());
        } catch {
          return;
        }
        ended.sent = true;
        onComplete(payload);
        return;
      }
      if ((event === 'MatchCreated' || event === 'MatchInitialized') && !blocked.has(guid)) {
        if (current?.guid !== guid) {
          if (current) leave(current);
          current = {
            guid,
            startedAt: now(),
            seen: new Set(),
            end: null,
            endedAt: null,
            candidate: null,
            last: null,
            clock: {},
            trace: [],
            players: new Map(),
            present: new Set(),
            usable: null,
            sent: false,
            shortcuts: new Map(),
            crossbars: new Map(),
            touchedSinceFrame: true,
            afterGoal: false,
          };
        }
        return;
      }
      if (!current || current.guid !== guid || current.sent || blocked.has(guid)) return;
      if (event === 'MatchEnded') {
        current.end = { MatchGuid: guid, WinnerTeamNum: data.WinnerTeamNum };
        current.endedAt = now();
        current.candidate = null;
        return;
      }
      if (event === 'BallHit') {
        current.touchedSinceFrame = true;
        return;
      }
      if (event === 'GoalScored') {
        current.afterGoal = true;
        return;
      }
      if (event === 'CountdownBegin' || event === 'RoundStarted') {
        current.afterGoal = false;
        current.touchedSinceFrame = true;
        return;
      }
      if (event === 'CrossbarHit') {
        const counts = !current.end && !current.afterGoal && current.touchedSinceFrame;
        current.touchedSinceFrame = false;
        const touch = data.BallLastTouch?.Player;
        const id = current.shortcuts.get(shortcutKey(touch?.Shortcut, touch?.TeamNum));
        if (counts && id && hitsOpponentGoal(touch?.TeamNum, data.BallLocation?.Y))
          current.crossbars.set(id, (current.crossbars.get(id) ?? 0) + 1);
        return;
      }
      if (event !== 'UpdateState' || !Array.isArray(data.Players)) return;
      for (const player of data.Players) current.seen.add(player.PrimaryId);
      if (current.seen.size > 16) {
        current = null;
        return;
      }
      if (data.Game?.bReplay === false && data.Players.length > 0) {
        current.clock = keptClock(current.clock, data.Game, current.end !== null);
        current.trace = tracedClock(current.trace, data.Game, current.end !== null);
      }
      for (const player of data.Players as LivePlayer[])
        if (identified(player))
          current.shortcuts.set(shortcutKey(player.Shortcut, player.TeamNum), player.PrimaryId as string);
      const crossbars = current.crossbars;
      const players = data.Players.map(
        ({ Name, PrimaryId, TeamNum, Score, Goals, Assists, Saves, Demos }: LivePlayer) => ({
          Name,
          PrimaryId,
          TeamNum,
          Score,
          Goals,
          Assists,
          Saves,
          Demos,
          CrossbarHits: typeof PrimaryId === 'string' ? (crossbars.get(PrimaryId) ?? 0) : 0,
        }),
      );
      const usable = data.Game?.bReplay === false && players.some(identified);
      if (usable && !current.end) {
        const ids = new Set<string>();
        for (const player of players.filter(identified)) {
          const { PrimaryId, Name, TeamNum, Score, Goals, Assists, Saves, Demos, CrossbarHits } = player;
          current.players.set(PrimaryId, {
            PrimaryId,
            Name,
            TeamNum,
            Score,
            Goals,
            Assists,
            Saves,
            Demos,
            CrossbarHits,
          });
          ids.add(PrimaryId);
        }
        current.present = ids;
        current.usable = {
          MatchGuid: guid,
          Players: players,
          Game: {
            PlaylistId: data.Game?.PlaylistId,
            Teams: data.Game?.Teams?.map(({ Name, TeamNum, Score }: LiveTeam) => ({ Name, TeamNum, Score })),
            bReplay: false,
          },
        };
      }
      const state = {
        MatchGuid: guid,
        Players: players,
        Game: {
          PlaylistId: data.Game?.PlaylistId,
          Teams: data.Game?.Teams?.map(({ Name, TeamNum, Score }: LiveTeam) => ({ Name, TeamNum, Score })),
          bHasWinner: data.Game?.bHasWinner,
          bReplay: data.Game?.bReplay,
          Winner: data.Game?.Winner,
          TimeSeconds: current.clock.TimeSeconds,
          bOvertime: current.clock.bOvertime,
        },
      };
      current.last = state;
      if (!current.end) return;
      const payload = endPayload(current, state, current.end);
      try {
        checkLiveMatch(payload, now());
      } catch {
        current.candidate = null;
        return;
      }
      const snapshot = JSON.stringify(state);
      if (snapshot !== current.candidate) {
        current.candidate = snapshot;
        return;
      }
      current.sent = true;
      onComplete(payload);
    },
    reset() {
      current = null;
    },
  };
}
