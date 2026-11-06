import type { Roster } from './club';
import { normalizeParticipant, parisDay, type ReceivedResult } from './domain';
import { type ReceivedRoster, validateMatchRosters } from './match-rules';
import { parseOrThrow, says, z } from './validation';

// Official local Stats API. Public matchmaking playlists only; unknown, private,
// training and bot playlists fail closed. Count is the full standard scoreboard.
const playerCounts = new Map([
  [1, 2],
  [2, 4],
  [3, 6],
  [4, 8],
  [10, 2],
  [11, 4],
  [13, 6],
  [27, 4],
  [28, 6],
  [29, 6],
  [30, 6],
  [34, 6],
]);

const canonical = (id: unknown) =>
  String(id)
    .replace(/^PSN\|/, 'PS4|')
    .replace(/^(Epic\|)([^|]+)/, (_, prefix: string, uid: string) => prefix + uid.toLowerCase());

export interface LivePlayer {
  Name?: unknown;
  PrimaryId?: unknown;
  TeamNum?: unknown;
  Score?: unknown;
  Goals?: unknown;
  Assists?: unknown;
  Saves?: unknown;
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
    Game: { PlaylistId?: unknown; Teams?: LiveTeam[]; bHasWinner?: unknown; bReplay?: unknown; Winner?: unknown };
  };
  end: { MatchGuid: string; WinnerTeamNum: unknown };
  startedAt: number;
  endedAt: number | null;
  seenIds: unknown[];
}

const finished = 'Fin de match absente ou incohérente.';
const dated = 'Date du match invalide.';
const publicMatch = 'Match public terminé requis.';
const finalTeams = 'Équipes finales invalides.';
const winnerDiffers = 'Gagnant du tableau différent de la fin de match.';
const incomplete = 'Tableau final incomplet : aucune dette ajoutée.';
const ambiguous = 'Participants du tableau incomplets ou ambigus.';
const botOrMissing = 'Identité de joueur manquante ou bot.';
const teamsIncomplete = 'Tableau des équipes incomplet.';
const invalidStats = 'Statistiques invalides.';
const nameless = 'Nom du joueur invalide.';
const primaryId = /^(Epic|Steam|PS4|PSN|XboxOne|Switch|PsyNet)\|[^\s|]{1,128}\|0$/;
const statistic = z.int(says(invalidStats)).check(z.gte(0, says(invalidStats)), z.lte(1_000_000, says(invalidStats)));
const notBlank = (message: string) => z.refine<string>((text) => text.trim() !== '', says(message));

/**
 * A finished public match as the collector sends it. The checks run in stages, each with its own message,
 * so that a scoreboard is refused for the first thing wrong with it. `now` dates the reception.
 */
export function liveMatchInput(now: () => number = Date.now) {
  const ended = z
    .looseObject(
      {
        state: z.looseObject(
          { MatchGuid: z.string(says(finished)).check(z.maxLength(128, says(finished)), notBlank(finished)) },
          says(finished),
        ),
        end: z.looseObject(
          { MatchGuid: z.string(says(finished)), WinnerTeamNum: z.literal([0, 1], says(finished)) },
          says(finished),
        ),
      },
      says(finished),
    )
    .check(z.refine((match) => match.end.MatchGuid === match.state.MatchGuid, says(finished)));
  const timed = z
    .looseObject({ startedAt: z.int(says(dated)), endedAt: z.int(says(dated)) })
    .check(
      z.refine(
        ({ startedAt, endedAt }) =>
          startedAt <= endedAt &&
          endedAt - startedAt <= 10_800_000 &&
          endedAt <= now() + 30_000 &&
          endedAt >= now() - 86_400_000,
        says(dated),
      ),
    );
  const publicGame = z.looseObject({
    state: z.looseObject({
      Game: z.looseObject(
        {
          PlaylistId: z.number(says(publicMatch)).check(z.refine((id) => playerCounts.has(id), says(publicMatch))),
          bHasWinner: z.literal(true, says(publicMatch)),
          bReplay: z.literal(false, says(publicMatch)),
        },
        says(publicMatch),
      ),
    }),
  });
  const team = z.looseObject(
    {
      TeamNum: z.literal([0, 1], says(finalTeams)),
      Name: z.string(says(finalTeams)).check(z.minLength(1, says(finalTeams))),
      Score: z.int(says(finalTeams)).check(z.gte(0, says(finalTeams))),
    },
    says(finalTeams),
  );
  const teams = z.looseObject({
    state: z.looseObject({
      Game: z.looseObject({
        Teams: z.array(team, says(finalTeams)).check(
          z.length(2, says(finalTeams)),
          z.refine((both) => new Set(both.map((side) => side.TeamNum)).size === 2, says(finalTeams)),
        ),
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
    .check(
      z.refine(
        ({ end, state }) =>
          state.Game.Winner === state.Game.Teams.find((side) => side.TeamNum === end.WinnerTeamNum)?.Name,
        says(winnerDiffers),
      ),
    );
  const complete = z
    .looseObject({
      state: z.looseObject({
        Players: z.array(z.unknown(), says(incomplete)),
        Game: z.looseObject({ PlaylistId: z.number() }),
      }),
      seenIds: z.array(z.unknown(), says(incomplete)),
    })
    .check(
      z.refine(({ state, seenIds }) => {
        const count = playerCounts.get(state.Game.PlaylistId);
        return state.Players.length === count && seenIds.length === count;
      }, says(incomplete)),
    );
  const distinct = z
    .looseObject({
      state: z.looseObject({ Players: z.array(z.looseObject({ PrimaryId: z.unknown() }, says(ambiguous))) }),
      seenIds: z.array(z.unknown()),
    })
    .check(
      z.refine(({ state, seenIds }) => {
        const ids = state.Players.map((player) => canonical(player.PrimaryId));
        return (
          new Set(ids).size === ids.length &&
          new Set(seenIds.map(canonical)).size === ids.length &&
          seenIds.every((id) => ids.includes(canonical(id)))
        );
      }, says(ambiguous)),
    );
  const identified = z.looseObject({
    state: z.looseObject({
      Players: z.array(
        z.looseObject({ PrimaryId: z.string(says(botOrMissing)).check(z.regex(primaryId, says(botOrMissing))) }),
      ),
    }),
  });
  const balanced = z
    .looseObject({ state: z.looseObject({ Players: z.array(z.looseObject({ TeamNum: z.unknown() })) }) })
    .check(
      z.refine(
        ({ state }) =>
          [0, 1].every(
            (side) => state.Players.filter((player) => player.TeamNum === side).length === state.Players.length / 2,
          ),
        says(teamsIncomplete),
      ),
    );
  const participants = z.looseObject({
    state: z.looseObject({
      Players: z.array(
        z.looseObject({
          Score: statistic,
          Goals: statistic,
          Assists: statistic,
          Saves: statistic,
          Name: z.string(says(nameless)).check(z.maxLength(128, says(nameless)), notBlank(nameless)),
        }),
      ),
    }),
  });
  // Each stage receives the scoreboard as received: a stage only reads what earlier stages checked.
  const stages = [ended, timed, publicGame, teams, winner, complete, distinct, identified, balanced, participants];
  return stages
    .map((stage) => stage as unknown as z.ZodMiniType<unknown, unknown>)
    .reduce((checked, stage) => z.pipe(checked, stage)) as unknown as z.ZodMiniType<LiveMatch, unknown>;
}

/** The match's lines, once `liveMatchInput` accepted it, named after the club's players. */
export function liveMatchRows(roster: Roster, match: LiveMatch): { rows: ReceivedResult[]; rosters: ReceivedRoster[] } {
  const { state, end, startedAt } = match;
  const count = state.Players.length;
  // Epic groups its history by RecordStartTimestamp. Use the observed start,
  // including matches that finish after Paris midnight, to keep that convention.
  const day = parisDay(new Date(startedAt));
  const rows = state.Players.map((player: LivePlayer) =>
    normalizeParticipant(roster, {
      MatchGuid: state.MatchGuid.trim().toLowerCase(),
      PlayerId: canonical(player.PrimaryId),
      Name: player.Name,
      Day: day,
      Kind: 'match',
      Team: player.TeamNum,
      Winner: end.WinnerTeamNum,
      Score: player.Score,
      Goals: player.Goals,
      Assists: player.Assists,
      Saves: player.Saves,
    }),
  );
  const rosters = validateMatchRosters([{ MatchGuid: rows[0]?.matchGuid, PlayerCount: count }], rows);
  return { rows, rosters };
}

export function parseLiveMatch(
  roster: Roster,
  input: unknown,
  now: number = Date.now(),
): { rows: ReceivedResult[]; rosters: ReceivedRoster[] } {
  return liveMatchRows(
    roster,
    parseOrThrow(
      liveMatchInput(() => now),
      input,
      'Envoi invalide.',
    ) as LiveMatch,
  );
}

/** Checks a scoreboard before keeping or sending it; the API names the club's players when it arrives. */
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
  sent: boolean;
}

// A live match must be observed from its creation/initialization. Never import
// a loaded replay or reuse another match's cached scoreboard. Wait for two
// identical post-winner updates instead of treating the last pre-end tick as final.
export function matchCapture(onComplete: (payload: LiveMatch) => void, now: () => number = Date.now) {
  let current: CurrentMatch | null = null;
  const blocked = new Set<string>();
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
        if (current?.guid === guid) current = null;
        return;
      }
      if ((event === 'MatchCreated' || event === 'MatchInitialized') && !blocked.has(guid)) {
        if (current?.guid !== guid)
          current = { guid, startedAt: now(), seen: new Set(), end: null, endedAt: null, candidate: null, sent: false };
        return;
      }
      if (!current || current.guid !== guid || current.sent || blocked.has(guid)) return;
      if (event === 'MatchEnded') {
        current.end = { MatchGuid: guid, WinnerTeamNum: data.WinnerTeamNum };
        current.endedAt = now();
        current.candidate = null;
        return;
      }
      if (event !== 'UpdateState' || !Array.isArray(data.Players)) return;
      for (const player of data.Players) current.seen.add(player.PrimaryId);
      if (current.seen.size > 16) {
        current = null;
        return;
      }
      if (!current.end) return;
      const state = {
        MatchGuid: guid,
        Players: data.Players.map(({ Name, PrimaryId, TeamNum, Score, Goals, Assists, Saves }: LivePlayer) => ({
          Name,
          PrimaryId,
          TeamNum,
          Score,
          Goals,
          Assists,
          Saves,
        })),
        Game: {
          PlaylistId: data.Game?.PlaylistId,
          Teams: data.Game?.Teams?.map(({ Name, TeamNum, Score }: LiveTeam) => ({ Name, TeamNum, Score })),
          bHasWinner: data.Game?.bHasWinner,
          bReplay: data.Game?.bReplay,
          Winner: data.Game?.Winner,
        },
      };
      const payload: LiveMatch = {
        state,
        end: current.end,
        startedAt: current.startedAt,
        endedAt: current.endedAt,
        seenIds: [...current.seen],
      };
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
