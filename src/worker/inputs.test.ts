import { env, exports } from 'cloudflare:workers';
import { beforeAll, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import { sha256 } from './auth';

// Every input the API refuses, with the status and the French message it answers. The messages are part of
// the API: the web app and the collector show them as they come.

const origin = 'https://app.test';
let cookie = '';

beforeAll(async () => {
  await joinTestClub(env.DB);
  await env.DB.prepare("UPDATE members SET role = 'admin' WHERE id = 'member-alice'").run();
  const token = `session-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), 'member-alice', Date.now() + 60_000)
    .run();
  cookie = `session=${token}`;
});

type Case = [method: string, path: string, body: unknown, status: number, error: string];

const raw = (text: string) => ({ raw: text });
const exercise = { id: 'exercise-input-test-01', player: 'alice', type: 'pushups', count: 10, day: '2026-11-05' };

const cases: Case[] = [
  ['POST', '/api/auth/code', {}, 400, 'Adresse e-mail invalide.'],
  ['POST', '/api/auth/code', { email: 'not-an-address' }, 400, 'Adresse e-mail invalide.'],
  ['POST', '/api/auth/code', raw('{'), 400, 'Adresse e-mail invalide.'],
  ['POST', '/api/auth/verify', { email: 'alice@example.com', code: '12' }, 400, 'Code invalide.'],
  ['POST', '/api/auth/verify', { email: 'nobody', code: '123456' }, 400, 'Code invalide.'],
  ['PUT', '/api/club', { name: 'a' }, 400, 'Nom du club : de 2 à 60 caractères.'],
  ['PUT', '/api/club', {}, 400, 'Nom du club : de 2 à 60 caractères.'],
  ['POST', '/api/collector/pair', { code: 'abc' }, 400, 'Le code d’association fait 8 caractères.'],
  ['POST', '/api/collector/pair', {}, 400, 'Le code d’association fait 8 caractères.'],
  ['POST', '/api/collector/pair', raw('x'.repeat(201)), 400, 'Le code d’association fait 8 caractères.'],
  ['DELETE', '/api/collectors', {}, 400, 'Collecteur inconnu.'],
  ['DELETE', '/api/collectors', { id: 5 }, 400, 'Collecteur inconnu.'],
  ['POST', '/api/exercise', {}, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, id: 'short' }, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, count: 0 }, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, count: 10_001 }, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, type: 'plank', count: 60_001 }, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, type: 'squats' }, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, day: '2026-02-30' }, 400, 'Déclaration invalide.'],
  ['POST', '/api/exercise', { ...exercise, player: 'stranger' }, 400, 'Déclaration invalide.'],
  [
    'POST',
    '/api/exercise',
    { ...exercise, day: '2999-01-01' },
    400,
    'La déclaration ne peut pas être datée dans le futur.',
  ],
  ['POST', '/api/exercise', raw('x'.repeat(2001)), 400, 'Déclaration invalide.'],
  ['DELETE', '/api/exercise', { id: 'bad' }, 400, 'Série inconnue.'],
  ['DELETE', '/api/exercise', {}, 400, 'Série inconnue.'],
  ['POST', '/api/reaction', { exerciseId: 'x', emoji: '💪' }, 400, 'Réaction invalide.'],
  ['POST', '/api/reaction', { exerciseId: exercise.id, emoji: '🙂' }, 400, 'Réaction invalide.'],
  ['POST', '/api/identities', { slot: 'nobody', playerId: 'Epic|x|0' }, 400, 'Identifiant invalide.'],
  ['POST', '/api/identities', { slot: 'alice', playerId: 5 }, 400, 'Identifiant invalide.'],
  ['POST', '/api/identities', raw('x'.repeat(2001)), 413, 'Envoi trop volumineux.'],
  ['POST', '/api/live', raw('x'.repeat(64_001)), 413, 'Envoi trop volumineux.'],
  ['POST', '/api/live', {}, 400, 'Fin de match absente ou incohérente.'],
  ['POST', '/api/members', { email: 'bad' }, 400, 'Adresse e-mail invalide.'],
  ['POST', '/api/members', { email: 'new@example.com', role: 'boss' }, 400, 'Rôle invalide.'],
  ['PATCH', '/api/members', { id: 5, role: 'admin' }, 400, 'Membre inconnu.'],
  ['PATCH', '/api/members', { id: 'member-bob', role: 'boss' }, 400, 'Rôle invalide.'],
  ['DELETE', '/api/members', {}, 400, 'Membre inconnu.'],
  ['POST', '/api/monthly', { action: 'nope' }, 400, 'Action inconnue.'],
  ['POST', '/api/monthly', { action: 'settle', id: 5 }, 400, 'Dette invalide.'],
  ['POST', '/api/monthly', { action: 'settle', id: 'x'.repeat(161) }, 400, 'Dette invalide.'],
  ['POST', '/api/monthly', raw('x'.repeat(3001)), 413, 'Envoi trop volumineux.'],
  [
    'PUT',
    '/api/profile',
    { duoPseudo: 'a' },
    400,
    'Pseudo duo : de 2 à 32 lettres, chiffres, espaces, points ou tirets.',
  ],
  [
    'PUT',
    '/api/profile',
    { duoPseudo: 'alice', soloPseudo: 'x'.repeat(33), platform: 'pc' },
    400,
    'Pseudo solo : 32 caractères au plus.',
  ],
  ['PUT', '/api/profile', { duoPseudo: 'alice', platform: 'nes' }, 400, 'Choisis ta plateforme.'],
  ['GET', '/api/state?since=-1', undefined, 400, 'Version du tableau invalide.'],
  ['GET', '/api/state?since=abc', undefined, 400, 'Version du tableau invalide.'],
];

test.each(cases)('%s %s %j answers %i', async (method, path, body, status, error) => {
  const text =
    body === undefined ? null : typeof body === 'object' && body && 'raw' in body ? body.raw : JSON.stringify(body);
  const response = await exports.default.fetch(`${origin}${path}`, {
    method,
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: text as string | null,
  });
  expect({ status: response.status, body: await response.json() }).toEqual({ status, body: { error } });
});

/** A finished public 2v2 the collector would send, as received from the game. */
function liveMatch() {
  const now = Date.now();
  const players = [
    ['alice', 'Epic|alice-input-test|0', 0],
    ['Teammate', 'Steam|76561190000000001|0', 0],
    ['Opponent 1', 'Steam|76561190000000002|0', 1],
    ['Opponent 2', 'Steam|76561190000000003|0', 1],
  ].map(([Name, PrimaryId, TeamNum]) => ({ Name, PrimaryId, TeamNum, Score: 100, Goals: 0, Assists: 0, Saves: 0 }));
  return {
    startedAt: now - 360_000,
    endedAt: now - 1000,
    seenIds: players.map((player) => player.PrimaryId),
    end: { MatchGuid: 'input-test-match', WinnerTeamNum: 0 },
    state: {
      MatchGuid: 'input-test-match',
      Players: players,
      Game: {
        PlaylistId: 11,
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

type LiveMatch = ReturnType<typeof liveMatch>;
const liveCases: [string, (match: LiveMatch) => void, string][] = [
  ['an other match ends', (m) => (m.end.MatchGuid = 'other'), 'Fin de match absente ou incohérente.'],
  ['no winner team', (m) => (m.end.WinnerTeamNum = 2), 'Fin de match absente ou incohérente.'],
  ['a start after the end', (m) => (m.startedAt = m.endedAt + 1), 'Date du match invalide.'],
  ['an end in the future', (m) => (m.endedAt = Date.now() + 60_000), 'Date du match invalide.'],
  ['a training playlist', (m) => (m.state.Game.PlaylistId = 9), 'Match en ligne terminé requis.'],
  ['a replay', (m) => (m.state.Game.bReplay = true), 'Match en ligne terminé requis.'],
  ['one team', (m) => m.state.Game.Teams.pop(), 'Équipes finales invalides.'],
  ['another winner', (m) => (m.state.Game.Winner = 'Orange'), 'Gagnant du tableau différent de la fin de match.'],
  [
    'one player too many',
    (m) =>
      m.state.Players.push({
        ...(m.state.Players[0] as LiveMatch['state']['Players'][number]),
        PrimaryId: 'Steam|76561190000000009|0',
      }),
    'Tableau final invalide.',
  ],
  [
    'only bots',
    (m) => {
      for (const player of m.state.Players) player.PrimaryId = 'Bot|1|0';
    },
    'Aucun joueur identifié dans le tableau final.',
  ],
  [
    'a player seen twice',
    (m) => {
      const [first, second] = m.state.Players;
      if (first && second) second.PrimaryId = first.PrimaryId;
    },
    'Participants du tableau ambigus.',
  ],
  [
    'three players in a team',
    (m) => {
      const [, , third] = m.state.Players;
      if (third) third.TeamNum = 0;
    },
    'Tableau des équipes invalide.',
  ],
  [
    'a player in no team',
    (m) => {
      const [, , third] = m.state.Players;
      if (third) third.TeamNum = 2;
    },
    'Résultat invalide.',
  ],
  [
    'a negative score',
    (m) => {
      const [first] = m.state.Players;
      if (first) first.Score = -1;
    },
    'Statistiques invalides.',
  ],
  [
    'a nameless opponent',
    (m) => {
      const [, , third] = m.state.Players;
      if (third) third.Name = '';
    },
    'Nom du joueur invalide.',
  ],
];

test.each(liveCases)('a live match with %s is refused', async (_case, mutate, error) => {
  const match = liveMatch();
  mutate(match);
  const response = await exports.default.fetch(`${origin}/api/live`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(match),
  });
  expect({ status: response.status, body: await response.json() }).toEqual({ status: 400, body: { error } });
});

test.each([
  [{ ranks: 'x' }, 400, 'Relevé de rangs invalide.'],
  [
    { ranks: [{ player: 'alice', playerId: 'Epic|x|0', mmr: 1000, observedAt: new Date().toISOString() }] },
    400,
    'Relevé de rangs invalide.',
  ],
  [{}, 400, 'Relevé de rangs invalide.'],
  ['x'.repeat(20_001), 413, 'Envoi trop volumineux.'],
] as const)('the rank source sending %j answers %i', async (body, status, error) => {
  const key = 'k'.repeat(40);
  (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = key;
  const response = await exports.default.fetch(`${origin}/api/ranks`, {
    method: 'POST',
    headers: { 'X-Rank-Source-Key': key, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  expect({ status: response.status, body: await response.json() }).toEqual({ status, body: { error } });
});
