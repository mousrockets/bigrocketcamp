import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';

// Replays migration 0014 on data shaped like the prototype's: the RLStats readings go, closed months keep their values.

const tables = ['mmr_entries', 'player_ranks', 'player_identities', 'monthly_mmr_results', 'drink_debts'];

const closedRows = [
  {
    player: 'alice',
    mmr: 1300,
    recordedAt: '2026-10-31T22:50:00.000Z',
    source: 'rlstats',
    sourceUrl: 'https://rlstats.example/profile/alice',
    confirmedForClose: true,
  },
  { player: 'bob', mmr: 1200, recordedAt: '2026-10-31T20:00:00.000Z', source: 'manual', confirmedForClose: true },
  { player: 'carla', mmr: 1100, recordedAt: '2026-10-31T21:00:00.000Z', source: 'observer', confirmedForClose: true },
];

async function replayMigration() {
  const migration = env.TEST_MIGRATIONS.find((candidate) => candidate.name.startsWith('0014_'));
  if (!migration) throw new Error('migration 0014 not found');
  for (const query of migration.queries) await env.DB.prepare(query).run();
}

test('RLStats readings are removed, and closed months and drinks keep their values', async () => {
  await env.DB.batch(tables.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
  const snapshot = JSON.stringify({ month: '2026-10', status: 'final', losers: ['carla'], rows: closedRows });
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO player_identities (slot, owner, player_id) VALUES ('alice', 'member-alice', 'Epic|alice-test|0'), ('bob', 'member-bob', 'Epic|bob-test|0'), ('carla', 'member-carla', 'PS4|carla-test|0')",
    ),
    env.DB.prepare(
      `INSERT INTO mmr_entries (id, player, mmr, author, recorded_at, source, source_at, source_url) VALUES
        ('alice-observer', 'alice', 1250, 'rank-source', '2026-11-02T10:00:00.000Z', 'observer', NULL, NULL),
        ('alice-public', 'alice', 1300, 'agent', '2026-11-03T10:00:00.000Z', 'rlstats', '2026-11-03T09:59:00.000Z', 'https://rlstats.example/profile/alice'),
        ('bob-public', 'bob', 1200, 'agent', '2026-11-03T10:00:00.000Z', 'rlstats', '2026-11-03T09:59:00.000Z', 'https://rlstats.example/profile/bob'),
        ('carla-manual', 'carla', 1100, 'member-carla', '2026-11-04T10:00:00.000Z', 'manual', NULL, NULL)`,
    ),
    env.DB.prepare(
      `INSERT INTO player_ranks (player, player_id, playlist, mmr, fetched_at, last_attempt, status) VALUES
        ('alice', 'Epic|alice-test|0', 11, 1300, '2026-11-03T09:59:00.000Z', '2026-11-03T10:00:00.000Z', 'public'),
        ('bob', 'Epic|bob-test|0', 11, 1200, '2026-11-03T09:59:00.000Z', '2026-11-03T10:00:00.000Z', 'public'),
        ('carla', 'PS4|carla-test|0', 11, 1100, '2026-11-04T10:00:00.000Z', '2026-11-04T10:00:00.000Z', 'manual')`,
    ),
    env.DB.prepare(
      "INSERT INTO monthly_mmr_results (month, cutoff_at, closed_at, status, snapshot) VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
    ).bind(snapshot),
    env.DB.prepare(
      "INSERT INTO drink_debts (id, month, payer, recipient) VALUES ('2026-10:carla:alice', '2026-10', 'carla', 'alice'), ('2026-10:carla:bob', '2026-10', 'carla', 'bob')",
    ),
  ]);

  await replayMigration();

  const entries = await env.DB.prepare('SELECT id FROM mmr_entries ORDER BY id').all<{ id: string }>();
  expect(entries.results.map((entry) => entry.id)).toEqual(['alice-observer', 'carla-manual']);
  const ranks = await env.DB.prepare('SELECT player, mmr, status FROM player_ranks ORDER BY player').all();
  expect(ranks.results).toEqual([
    { player: 'alice', mmr: 1250, status: 'ready' },
    { player: 'carla', mmr: 1100, status: 'manual' },
  ]);

  const closed = await env.DB.prepare('SELECT status, snapshot FROM monthly_mmr_results').first<{
    status: string;
    snapshot: string;
  }>();
  expect(closed?.status).toBe('final');
  expect(JSON.parse(closed?.snapshot ?? '{}')).toEqual({
    month: '2026-10',
    status: 'final',
    losers: ['carla'],
    rows: closedRows.map(({ source: _source, sourceUrl: _sourceUrl, ...row }) => row),
  });
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM drink_debts').first('n')).toBe(2);

  const dropped = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('public_mmr_sync', 'epic_accounts', 'epic_grants')",
  ).first('n');
  expect(dropped).toBe(0);
});
