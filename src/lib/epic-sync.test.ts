import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { roster } from './club';
import {
  autoSync,
  collectionPaused,
  connectionStatus,
  disconnect,
  recapState,
  retiredReason,
  slots,
  syncHistories,
} from './epic-sync';

const [first = '', second = ''] = roster;
const accountId = 'b'.repeat(32);

async function reset() {
  await env.DB.batch(
    [
      'epic_accounts',
      'epic_grants',
      'player_identities',
      'player_identity_aliases',
      'player_ranks',
      'results',
      'result_observations',
      'source_reports',
      'match_rosters',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('retired Epic sync', () => {
  test('retirement is final: no external call even with the old flag and key restored', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External request forbidden'));
    expect(collectionPaused()).toBe(true);
    const synced = await syncHistories({ DB: env.DB, EPIC_COLLECTION_PAUSED: 'false' }, 'current-user');
    expect(synced).toEqual({
      synced: 0,
      ranksUpdated: 0,
      paused: true,
      retired: true,
      reason: retiredReason,
      results: [],
    });
    expect(await autoSync({ DB: env.DB })).toEqual({ ran: false, paused: true, retired: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('the status keeps identities and the frozen rank, without secrets', async () => {
    await reset();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').bind(
        second,
        'friend-one',
        `Epic|${accountId}|0`,
      ),
      env.DB.prepare('INSERT INTO player_ranks VALUES (?,?,?,?,?,?,?,?,?,?)').bind(
        second,
        'Epic|synthetic|0',
        11,
        1200,
        17,
        2,
        10,
        '2026-11-05T12:00:00Z',
        '2026-11-05T12:00:00Z',
        'frozen',
      ),
      env.DB.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(
        'synthetic-old-match',
        'Epic|synthetic|0',
        second,
        '2026-11-05',
        'match',
        0,
        1,
        200,
        0,
        0,
        0,
        'synthetic',
      ),
    ]);
    const state = await connectionStatus({ DB: env.DB }, 'current-user');
    expect(state.retired).toBe(true);
    expect(state.configured).toBe(false);
    expect(state.vaultConfigured).toBe(false);
    expect(state.credentialsStored?.accounts).toBe(0);
    expect(state.connections.map((c) => c.slot)).toEqual(slots);
    expect(state.connections.length).toBe(roster.length + 1);
    const identity = state.connections.find((c) => c.slot === second);
    expect(identity?.identityKnown).toBe(true);
    expect(identity?.owned).toBe(false);
    expect(state.doublesRanks[1]?.mmr).toBe(1200);
    expect(state.doublesRanks[1]?.status).toBe('frozen');
    expect(JSON.stringify(state)).not.toContain(accountId);
    expect(JSON.stringify(state)).not.toContain('tokens');

    const recap = await recapState({ DB: env.DB }, '2026-11-05');
    expect(recap.players[1]?.played).toBe(1);
    expect(recap.players[1]?.generated).toBe(5);
    expect(recap.coverage).toEqual([
      { slot: second, status: 'retired', last_sync: null, coverage: 'recent_only', detail: retiredReason },
    ]);
  });

  test('the old disconnect button checks the owner and keeps the live identity', async () => {
    await reset();
    await env.DB.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)')
      .bind(first, 'current-user', `Epic|${accountId}|0`)
      .run();
    await env.DB.prepare(
      "INSERT INTO epic_accounts (slot,owner,account_id,tokens,status) VALUES (?,?,?,'synthetic-secret','synced')",
    )
      .bind(first, 'current-user', accountId)
      .run();
    await expect(disconnect({ DB: env.DB }, 'someone-else', first)).rejects.toThrow(/Seul/);
    await expect(disconnect({ DB: env.DB }, 'current-user', 'unknown-slot')).rejects.toThrow('Compte inconnu.');
    expect(await disconnect({ DB: env.DB }, 'current-user', first)).toEqual({ ok: true, retired: true });
    const identities = await env.DB.prepare('SELECT COUNT(*) AS n FROM player_identities').first<{ n: number }>();
    expect(identities?.n).toBe(1);
    const accounts = await env.DB.prepare('SELECT COUNT(*) AS n FROM epic_accounts').first<{ n: number }>();
    expect(accounts?.n).toBe(0);
  });
});
