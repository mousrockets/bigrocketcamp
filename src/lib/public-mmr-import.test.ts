import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readDoublesRanks } from './doubles-ranks';
import { readMonthlyMmr } from './monthly-mmr';
import { publicProfileHtml, publicStamp } from './public-profile-fixture';
import { importPublicMmr, publicProfiles } from './public-ranks';

const db = env.DB;

const pages = () =>
  publicProfiles.map((profile, index) => ({
    player: profile.player,
    html: publicProfileHtml(profile, { mmr: 1500 - index * 100, stamp: publicStamp() }),
  }));

async function giveIdentitiesToPlayers() {
  await db.batch(
    publicProfiles.map((profile, index) =>
      db
        .prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)')
        .bind(profile.player, index === 0 ? 'current-user' : `other-${index}`, `Epic|internal-test-${index}|0`),
    ),
  );
}

const mmrEntryCount = async () => (await db.prepare('SELECT count(*) AS n FROM mmr_entries').first<{ n: number }>())?.n;

beforeEach(async () => {
  await db.batch(
    ['player_identities', 'player_identity_aliases', 'mmr_entries', 'player_ranks', 'public_mmr_sync'].map((table) =>
      db.prepare(`DELETE FROM ${table}`),
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importPublicMmr', () => {
  test('persists every submitted reading without any network access', async () => {
    await giveIdentitiesToPlayers();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('No network'));
    const result = await importPublicMmr(db, pages());
    expect(result.updated).toHaveLength(publicProfiles.length);
    expect(network).not.toHaveBeenCalled();
    const monthly = await readMonthlyMmr(db, 'current-user');
    expect(monthly.current.rows.map((row) => row.mmr)).toEqual(
      publicProfiles.map((_profile, index) => 1500 - index * 100),
    );
    expect(JSON.stringify(monthly)).not.toContain('internal-test');
    expect((await readDoublesRanks(db)).every((rank) => rank.status === 'public')).toBe(true);
  });

  test('rejects an unknown source, a duplicated player and an oversized page without writing', async () => {
    await giveIdentitiesToPlayers();
    const [page] = pages();
    if (!page) throw Error('The test roster needs at least one player.');
    await expect(importPublicMmr(db, [{ player: 'unknown', html: 'x' }])).rejects.toThrow(
      'Envoi de profils publics invalide.',
    );
    await expect(importPublicMmr(db, [page, page])).rejects.toThrow('Envoi de profils publics invalide.');
    await expect(importPublicMmr(db, [{ player: page.player, html: 'x'.repeat(1550001) }])).rejects.toThrow(
      'Envoi de profils publics invalide.',
    );
    expect(await mmrEntryCount()).toBe(0);
  });

  test('keeps a private, stale or ambiguous profile as missing and invents nothing', async () => {
    await giveIdentitiesToPlayers();
    const player = publicProfiles[0]?.player ?? '';
    const result = await importPublicMmr(db, [{ player, html: '<h1>Connexion requise</h1>' }]);
    expect(result.updated).toHaveLength(0);
    expect(result.errors).toHaveLength(publicProfiles.length);
    expect(await mmrEntryCount()).toBe(0);
  });
});
