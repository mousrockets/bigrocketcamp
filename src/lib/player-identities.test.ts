import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import { roster } from './club';
import { summarize } from './domain';
import {
  attributeLivePlayers,
  canonicalPlayerId,
  readIdentityBindings,
  readPlayerIdentities,
  unassignedPrefix,
} from './player-identities';
import { observationWrites, readMerged } from './reconcile';

const [first = '', second = '', third = ''] = roster;

async function setup() {
  await env.DB.batch(
    ['player_identities', 'player_identity_aliases', 'result_observations', 'source_reports', 'results'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
  const identities: [string, string, string][] = [
    [first, 'other-owner', 'Epic|synthetic-main|0'],
    [third, 'current-user', 'Epic|synthetic-console-account|0'],
  ];
  for (const [slot, owner, id] of identities) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').bind(slot, owner, id),
      env.DB.prepare('INSERT INTO player_identity_aliases VALUES (?,?,?,?)').bind(id, slot, owner, 'synthetic'),
    ]);
  }
  const game = { matchGuid: 'synthetic-identity-game', day: '2026-11-05', kind: 'match', winner: 1 };
  const rows = [
    { ...game, playerId: 'PS4|222222|0', name: unassignedPrefix + third, team: 0, score: 100 },
    { ...game, playerId: 'Epic|opponent|0', name: 'Opponent', team: 1, score: 200 },
  ].map((row) => ({ ...row, goals: 0, assists: 0, saves: 0 }));
  const writes = await observationWrites(
    env.DB,
    {
      rows,
      rosters: [{ matchGuid: 'synthetic-identity-game', playerCount: 2 }],
      sourceId: 'synthetic-local',
      sourceType: 'collector',
    },
    'synthetic',
  );
  await env.DB.batch(writes as D1PreparedStatement[]);
}

async function thirdPlayerDue() {
  const merged = await readMerged(env.DB);
  return { merged, due: summarize(merged.rows, [], '')[2]?.due };
}

test('an opponent nickname stays unassigned until the owner confirms its platform ID', async () => {
  await setup();
  const mapped = attributeLivePlayers([{ playerId: 'Epic|unknown|0', name: second }], []);
  expect(mapped[0]?.name).toBe(unassignedPrefix + second);
  expect((await thirdPlayerDue()).due).toBe(0);

  // What the identities route stores once the owner confirms the console ID.
  await env.DB.prepare('INSERT INTO player_identity_aliases VALUES (?,?,?,?)')
    .bind('PS4|222222|0', third, 'current-user', 'synthetic')
    .run();
  const confirmed = await thirdPlayerDue();
  expect(confirmed.due).toBe(5);
  expect(confirmed.merged.rosters.length).toBe(1);
  const observations = await env.DB.prepare('SELECT COUNT(*) AS n FROM result_observations').first<{ n: number }>();
  expect(observations?.n).toBe(2);

  await env.DB.prepare('DELETE FROM player_identity_aliases WHERE player_id=?').bind('PS4|222222|0').run();
  expect((await thirdPlayerDue()).due).toBe(0);
});

test('identities and bindings are read per owner and limited to the roster', async () => {
  await setup();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').bind(
      'former-member',
      'current-user',
      'Epic|former|0',
    ),
    env.DB.prepare('INSERT INTO player_identity_aliases VALUES (?,?,?,?)').bind(
      'Epic|former|0',
      'former-member',
      'current-user',
      'synthetic',
    ),
  ]);
  expect((await readPlayerIdentities(env.DB)).map((i) => i.slot).sort()).toEqual([first, third].sort());
  const owned = await readPlayerIdentities(env.DB, 'current-user');
  expect(owned.map((i) => [i.slot, i.player_id, i.coverage])).toEqual([
    [third, 'Epic|synthetic-console-account|0', 'recent_only'],
  ]);
  expect((await readIdentityBindings(env.DB)).map((b) => b.slot).sort()).toEqual([first, third].sort());
});

test('live players are attributed through canonical platform IDs', () => {
  expect(canonicalPlayerId('epic|ABCDEF|0')).toBe('Epic|abcdef|0');
  expect(canonicalPlayerId('PSN|123|0')).toBe('PS4|123|0');
  const bindings = [{ slot: first, player_id: 'Epic|abcdef|0' }];
  const rows = [
    { playerId: 'Epic|ABCDEF|0', name: 'renamed' },
    { playerId: 'Epic|other|0', name: second },
    { playerId: 'Epic|stranger|0', name: 'Stranger' },
  ];
  expect(attributeLivePlayers(rows, bindings).map((r) => r.name)).toEqual([
    first,
    unassignedPrefix + second,
    'Stranger',
  ]);
});
