import { env, exports } from 'cloudflare:workers';
import { hc } from 'hono/client';
import { beforeAll, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import {
  boardChanges,
  challengeRules,
  club,
  clubIdentity,
  clubLogo,
  clubNameSaved,
  collectorDevices,
  collectorPairing,
  collectorStatus,
  done,
  health,
  identityList,
  livePlayers,
  liveReceived,
  memberList,
  memberProfile,
  monthlyStandings,
  monthsClosed,
  ownProfile,
  pairingCodeCreated,
  rankActivity,
  ranksRecorded,
  rankTargets,
} from '../lib/contract';
import { type core, parseOrThrow } from '../lib/validation';
import type { AppType } from './app';
import { sha256 } from './auth';
import { alicePlayerId, livePayload } from './live-fixture';

// Every answer of the API, asked through the typed client the web app uses, parses with its schema from the
// contract. The compiler checks what the routes build; this checks what they send, the database's rows included.

const origin = 'https://app.test';
const rankKey = 'k'.repeat(40);

const clientWith = (headers: Record<string, string>) =>
  hc<AppType>(origin, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => exports.default.fetch(input, init),
    headers,
  }).api;

let api = clientWith({});
const rankSource = clientWith({ 'X-Rank-Source-Key': rankKey });

/** The answer's data, which must succeed and parse with its schema. */
async function answer<Schema extends core.$ZodType>(
  request: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
  schema: Schema,
): Promise<core.output<Schema>> {
  const response = await request;
  const body = await response.json();
  // The body goes with the status: a refusal shows its own message.
  expect({ ok: response.ok, body }).toMatchObject({ ok: true });
  return parseOrThrow(schema, body, 'The answer breaks the contract.');
}

beforeAll(async () => {
  (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = rankKey;
  await joinTestClub(env.DB);
  const token = `session-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET role = 'admin' WHERE id = 'member-alice'"),
    env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)').bind(
      await sha256(token),
      'member-alice',
      Date.now() + 60_000,
    ),
    env.DB.prepare('INSERT OR REPLACE INTO player_identities (slot, owner, player_id) VALUES (?, ?, ?)').bind(
      'alice',
      'member-alice',
      alicePlayerId,
    ),
    env.DB.prepare('INSERT OR REPLACE INTO player_identity_aliases VALUES (?, ?, ?, ?)').bind(
      alicePlayerId,
      'alice',
      'member-alice',
      'synthetic',
    ),
  ]);
  api = clientWith({ Cookie: `session=${token}`, Origin: origin });
});

test('every write answers what the contract says', async () => {
  await answer(api.live.$post({ json: livePayload({ guid: 'synthetic-contract-match' }) }), liveReceived);
  const reading = { player: 'alice', playerId: alicePlayerId, mmr: 1234, tier: 15, division: 2, matches: 321 };
  await answer(
    rankSource.ranks.$post({ json: { ranks: [{ ...reading, observedAt: new Date().toISOString() }] } }),
    ranksRecorded,
  );
  const exercise = {
    id: 'exercise-contract-test',
    player: 'alice',
    type: 'pushups' as const,
    count: 5,
    day: '2026-11-05',
  };
  await answer(api.exercise.$post({ json: exercise }), done);
  await answer(api.reaction.$post({ json: { exerciseId: exercise.id, emoji: '💪' } }), done);
  await answer(api.club.$put({ json: { name: 'Big Rocket Camp' } }), clubNameSaved);
  await answer(api.club.rules.$put({ json: { lastPlace: { enabled: false } } }), challengeRules);
  await answer(api.club.logo.$delete(), clubLogo);
  await answer(api.profile.$put({ json: { duoPseudo: 'alice', soloPseudo: 'Alice', platform: 'pc' } }), ownProfile);
  await answer(api.members.$post({ json: { email: 'dora@example.com', role: 'member' } }), memberProfile);
  await answer(api.monthly.$post({ json: { action: 'refresh' } }), monthsClosed);

  const { code } = await answer(api.collectors.$post(), pairingCodeCreated);
  const { token } = await answer(api.collector.pair.$post({ json: { code } }), collectorPairing);
  await answer(clientWith({ Authorization: `Bearer ${token}` }).collector.status.$get(), collectorStatus);
});

test('every read answers what the contract says', async () => {
  await answer(api.health.$get(), health);
  await answer(api.club.name.$get(), clubIdentity);
  await answer(api.club.$get(), club);
  await answer(api.members.$get(), memberList);
  await answer(api.identities.$get(), identityList);
  await answer(api.live.$get(), livePlayers);
  await answer(api.collectors.$get(), collectorDevices);
  await answer(api.monthly.$get(), monthlyStandings);
  await answer(rankSource.ranks.targets.$get(), rankTargets);
  await answer(rankSource.ranks.activity.$get(), rankActivity);
  const board = await answer(api.state.$get({ query: { since: '0' } }), boardChanges);
  // The parts filled by the writes above: an empty list would prove nothing of its rows.
  expect(board.results.length).toBeGreaterThan(0);
  expect(board.exercises.length).toBeGreaterThan(0);
  expect(board.reactions.length).toBeGreaterThan(0);
  expect(board.collectors.length).toBeGreaterThan(0);
  expect(board.doublesRanks.find((rank) => rank.player === 'alice')?.peak).not.toBeNull();
});
