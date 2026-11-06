import type { Roster } from './club';
import { normalizeParticipant, parisDay, type ReceivedResult } from './domain';
import { type ReceivedRoster, validateMatchRosters } from './match-rules';

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

export function parseLiveMatch(
  roster: Roster,
  input: unknown,
  now: number = Date.now(),
): { rows: ReceivedResult[]; rosters: ReceivedRoster[] } {
  // biome-ignore lint/suspicious/noExplicitAny: the browser's payload is checked field by field below.
  const { state, end, startedAt, endedAt, seenIds } = (input || {}) as Record<string, any>;
  const game = state?.Game;
  const guid = state?.MatchGuid;
  if (
    typeof guid !== 'string' ||
    !guid.trim() ||
    guid.length > 128 ||
    end?.MatchGuid !== guid ||
    ![0, 1].includes(end?.WinnerTeamNum)
  ) {
    throw new Error('Fin de match absente ou incohérente.');
  }
  if (
    !Number.isSafeInteger(startedAt) ||
    !Number.isSafeInteger(endedAt) ||
    startedAt > endedAt ||
    endedAt - startedAt > 10_800_000 ||
    endedAt > now + 30_000 ||
    endedAt < now - 86_400_000
  ) {
    throw new Error('Date du match invalide.');
  }
  const count = playerCounts.get(game?.PlaylistId);
  if (!count || game?.bHasWinner !== true || game?.bReplay !== false) throw new Error('Match public terminé requis.');
  if (
    !Array.isArray(game.Teams) ||
    game.Teams.length !== 2 ||
    new Set(game.Teams.map((team: LiveTeam) => team.TeamNum)).size !== 2 ||
    !game.Teams.every(
      (team: LiveTeam) =>
        [0, 1].includes(team.TeamNum as number) &&
        typeof team.Name === 'string' &&
        team.Name &&
        Number.isSafeInteger(team.Score) &&
        (team.Score as number) >= 0,
    )
  ) {
    throw new Error('Équipes finales invalides.');
  }
  const winner = game.Teams.find((team: LiveTeam) => team.TeamNum === end.WinnerTeamNum);
  if (game.Winner !== winner.Name) throw new Error('Gagnant du tableau différent de la fin de match.');
  if (
    !Array.isArray(state.Players) ||
    state.Players.length !== count ||
    !Array.isArray(seenIds) ||
    seenIds.length !== count
  ) {
    throw new Error('Tableau final incomplet : aucune dette ajoutée.');
  }
  const ids = state.Players.map((player: LivePlayer) => canonical(player.PrimaryId));
  if (
    new Set(ids).size !== count ||
    new Set(seenIds.map(canonical)).size !== count ||
    !seenIds.every((id) => ids.includes(canonical(id)))
  ) {
    throw new Error('Participants du tableau incomplets ou ambigus.');
  }
  if (
    !state.Players.every(
      (player: LivePlayer) =>
        typeof player.PrimaryId === 'string' &&
        /^(Epic|Steam|PS4|PSN|XboxOne|Switch|PsyNet)\|[^\s|]{1,128}\|0$/.test(player.PrimaryId),
    )
  ) {
    throw new Error('Identité de joueur manquante ou bot.');
  }
  if (
    ![0, 1].every((team) => state.Players.filter((player: LivePlayer) => player.TeamNum === team).length === count / 2)
  ) {
    throw new Error('Tableau des équipes incomplet.');
  }
  // Epic groups its history by RecordStartTimestamp. Use the observed start,
  // including matches that finish after Paris midnight, to keep that convention.
  const day = parisDay(new Date(startedAt));
  const rows = state.Players.map((player: LivePlayer) =>
    normalizeParticipant(roster, {
      MatchGuid: guid.trim().toLowerCase(),
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
  const rosters = validateMatchRosters([{ MatchGuid: rows[0].matchGuid, PlayerCount: count }], rows);
  return { rows, rosters };
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
