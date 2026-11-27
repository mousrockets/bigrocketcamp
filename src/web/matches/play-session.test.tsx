import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeApi } from '../settings/fake-api';
import { aRank, aSoloRank, boardWith, renderInApp, testClub } from '../test-utils';
import { MatchesPage } from './matches-page';

// The play sessions, in Matchs above the last session: Alice plays on PC, Bob on PlayStation.

const now = new Date('2026-11-27T20:30:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});

/** What a session answers. */
const api = (session: unknown = null) => fakeApi({ 'POST /api/play-session': { session } });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A player's duo account, and their solo one when given. */
const ranks = (player: string, duo: { mmr: number; best: number }, solo?: { mmr: number; best: number }) =>
  aRank({
    player,
    ...duo,
    fetchedAt: '2026-11-27T20:28:00Z',
    solo: solo
      ? aSoloRank({
          pseudo: `${player}-solo`,
          playerId: `Epic|${player}-solo|0`,
          ...solo,
          fetchedAt: '2026-11-27T20:29:20Z',
        })
      : null,
  });

const asBob = {
  ...testClub,
  me: { ...testClub.me, id: 'member-bob', duoPseudo: 'bob', platform: 'playstation' as const },
};

const bobPlaying = {
  player: 'bob',
  startedAt: '2026-11-27T20:17:56Z',
  endsAt: '2026-11-27T20:59:20Z',
  startDuoMmr: 1300,
  startSoloMmr: 1180,
};

test('on a console, starts the session at once, with or without a solo account', async () => {
  const sent = api(bobPlaying);
  renderInApp(<MatchesPage />, {
    path: '/matchs',
    club: asBob,
    board: boardWith({ doublesRanks: [ranks('bob', { mmr: 1300, best: 1350 })] }, asBob),
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Lancer une session' }));
  expect(sent).toContainEqual({ method: 'POST', path: '/api/play-session', body: { action: 'start' } });
});

test('on a computer, points to the collector first, and starts anyway when the member wants', async () => {
  const sent = api();
  renderInApp(<MatchesPage />, {
    path: '/matchs',
    board: boardWith({ doublesRanks: [ranks('alice', { mmr: 1400, best: 1450 }, { mmr: 1300, best: 1350 })] }),
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Lancer une session' }));
  expect(await screen.findByRole('alertdialog', { name: 'Le collecteur fait mieux' })).toBeInTheDocument();
  expect(sent.filter((request) => request.path === '/api/play-session')).toEqual([]);
  await userEvent.click(screen.getByRole('button', { name: 'Lancer quand même' }));
  expect(sent).toContainEqual({ method: 'POST', path: '/api/play-session', body: { action: 'start' } });
});

test('the whole club sees a session live: its length, and each account’s rating won and way to its peak', async () => {
  renderInApp(<MatchesPage />, {
    path: '/matchs',
    board: boardWith({
      doublesRanks: [ranks('bob', { mmr: 1310, best: 1360 }, { mmr: 1220, best: 1240 })],
      playSessions: [bobPlaying],
    }),
  });
  const live = await screen.findByRole('region', { name: 'Session de bob' });
  expect(live).toHaveTextContent('En session');
  expect(live).toHaveTextContent('12:04');
  // The solo account first, then the duo one.
  const [solo, duo] = within(live).getAllByRole('listitem');
  expect(duo).toHaveTextContent(/Duo\s*1\s310\s*MMR\s*\+10/);
  expect(duo).toHaveTextContent('Encore 50 MMR pour son peak · 1 360');
  expect(solo).toHaveTextContent(/Solo\s*1\s220\s*MMR\s*\+40/);
  expect(solo).toHaveTextContent('Encore 20 MMR pour son peak · 1 240');
  expect(within(live).getByRole('progressbar', { name: 'Vers le peak solo de bob' })).toBeInTheDocument();
  // Only Bob stops his, and reads how it works.
  expect(within(live).queryByRole('button', { name: 'Terminer' })).not.toBeInTheDocument();
  expect(live).not.toHaveTextContent('relevés toutes les 2 min');
});

test('the member stops their own session, and reads how it works', async () => {
  const sent = api();
  renderInApp(<MatchesPage />, {
    path: '/matchs',
    club: asBob,
    board: boardWith(
      {
        doublesRanks: [ranks('bob', { mmr: 1310, best: 1360 }, { mmr: 1250, best: 1240 })],
        playSessions: [bobPlaying],
      },
      asBob,
    ),
  });
  const live = await screen.findByRole('region', { name: 'Session de bob' });
  // Past the solo peak all time.
  expect(live).toHaveTextContent('Peak all time battu : 1 240. GG !');
  expect(live).toHaveTextContent(
    'Pendant que tu joues, tes comptes solo et duo sont relevés toutes les 2 min : aucun peak ne t’échappe. La session s’arrête seule si ton MMR ne bouge plus pendant 30 min.',
  );
  await userEvent.click(within(live).getByRole('button', { name: 'Terminer' }));
  expect(sent).toContainEqual({ method: 'POST', path: '/api/play-session', body: { action: 'stop' } });
});

test('without a solo account, the session shows the duo one alone', async () => {
  renderInApp(<MatchesPage />, {
    path: '/matchs',
    club: asBob,
    board: boardWith({ doublesRanks: [ranks('bob', { mmr: 1310, best: 1360 })], playSessions: [bobPlaying] }, asBob),
  });
  const live = await screen.findByRole('region', { name: 'Session de bob' });
  expect(within(live).getAllByRole('listitem')).toHaveLength(1);
  expect(live).toHaveTextContent('Pendant que tu joues, ton compte est relevé toutes les 2 min');
});

test('a session that ended shows no more', async () => {
  renderInApp(<MatchesPage />, {
    path: '/matchs',
    board: boardWith({
      doublesRanks: [ranks('alice', { mmr: 1400, best: 1450 }), ranks('bob', { mmr: 1310, best: 1360 })],
      playSessions: [{ ...bobPlaying, endsAt: '2026-11-27T20:29:00Z' }],
    }),
  });
  await screen.findByRole('button', { name: 'Lancer une session' });
  expect(screen.queryByRole('region', { name: 'Session de bob' })).not.toBeInTheDocument();
});
