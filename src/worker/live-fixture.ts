import { rankedDoublesPlaylist } from '../lib/live-stats';

// A finished 2v2 match as the collector sends it: a fictional player of the club against three opponents.

export const alicePlayerId = `Epic|${'b'.repeat(32)}|0`;

export function livePayload({ guid = 'synthetic-collector-match', playlist = rankedDoublesPlaylist } = {}) {
  const now = Date.now();
  const players = [
    ['alice', alicePlayerId],
    ['Opponent 1', `Epic|${'d'.repeat(32)}|0`],
    ['Opponent 2', `Epic|${'e'.repeat(32)}|0`],
    ['Opponent 3', `Epic|${'f'.repeat(32)}|0`],
  ].map(([Name, PrimaryId], i) => ({
    Name,
    PrimaryId,
    TeamNum: i < 2 ? 0 : 1,
    Score: 100,
    Goals: 0,
    Assists: 0,
    Saves: 0,
  }));
  return {
    startedAt: now - 360_000,
    endedAt: now - 1000,
    seenIds: players.map((player) => player.PrimaryId),
    end: { MatchGuid: guid, WinnerTeamNum: 0 },
    state: {
      MatchGuid: guid,
      Players: players,
      Game: {
        PlaylistId: playlist,
        Teams: [
          { Name: 'Blue', TeamNum: 0, Score: 2 },
          { Name: 'Orange', TeamNum: 1, Score: 1 },
        ],
        bHasWinner: true,
        bReplay: false,
        Winner: 'Blue',
      },
    },
  };
}
