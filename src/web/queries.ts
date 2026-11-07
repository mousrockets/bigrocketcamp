import { queryOptions } from '@tanstack/react-query';
import type { Profile } from '../lib/members';
import { fetchWithin } from '../lib/timeout';
import type { DeployedVersion } from '../lib/version';
import { apiFetch, isSignInRequired } from './api';
import { errorOf, fetchClub, fetchClubIdentity } from './club';

// Every read of the API, shared by the pages through TanStack Query. The writes are in `writes.ts`.
// The board is not here: it keeps its own sync (board-client.ts), with the browser's copy as its source.

/** A query that failed is asked again when the member comes back to the page or the network returns. */
const againAfterFailure = (query: { state: { status: string } }) => (query.state.status === 'error' ? 'always' : false);

/**
 * The club of the signed-in member, or null once a sign-in is needed. Asked once per page: an installed app opened
 * offline has no reload button, so it tries again once the network or the member is back.
 */
export const clubQuery = queryOptions({
  queryKey: ['club'],
  queryFn: async () => {
    const club = await fetchClub();
    if (!club && !isSignInRequired()) throw new Error('The club did not answer.');
    return club;
  },
  staleTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: againAfterFailure,
  refetchOnReconnect: againAfterFailure,
});

/** The club's name and logo, shown on the sign-in screen. */
export const clubIdentityQuery = queryOptions({
  queryKey: ['club', 'identity'],
  queryFn: fetchClubIdentity,
  staleTime: Number.POSITIVE_INFINITY,
});

const versionCheckEvery = 5 * 60_000;

/**
 * The build the API runs: checked on load, every five minutes while the page is visible, and on each return to it.
 * A failed check keeps the last answer.
 */
export const deployedVersionQuery = queryOptions({
  queryKey: ['health'],
  queryFn: async (): Promise<DeployedVersion> => {
    const response = await fetchWithin(fetch, '/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error(`The health check answered ${response.status}.`);
    const body = (await response.json()) as Partial<DeployedVersion>;
    // An API older than this check names no commit: nothing to compare.
    if (typeof body.commit !== 'string') throw new Error('The health check names no commit.');
    return { commit: body.commit, deployedAt: body.deployedAt ?? null };
  },
  refetchInterval: versionCheckEvery,
  refetchOnWindowFocus: 'always',
});

/** The club's members, for the administrators. */
export const membersQuery = queryOptions({
  queryKey: ['members'],
  queryFn: async () => {
    const response = await apiFetch('/api/members', { cache: 'no-store' });
    if (!response.ok) throw Error(await errorOf(response, 'Liste des membres indisponible.'));
    return ((await response.json()) as { members: Profile[] }).members;
  },
});

type Alias = { playerId: string; primary: boolean };
export type Identity = { slot: string; known: boolean; owned: boolean; aliases: Alias[] };
export type Candidate = { playerId: string; name: string; day: string };

/** An API answer that is not a success; each page words it its own way. */
export class ApiError extends Error {
  readonly status: number;
  /** The API's own explanation, if it gave one. */
  readonly reason: string;

  constructor(status: number, reason: string) {
    super(reason || `The API answered ${status}.`);
    this.status = status;
    this.reason = reason;
  }
}

/** The game identities of the club's players, and the players seen in received scoreboards. */
export const identitiesQuery = queryOptions({
  queryKey: ['identities'],
  queryFn: async () => {
    const response = await apiFetch('/api/identities', { cache: 'no-store' });
    if (!response.ok) throw new ApiError(response.status, await errorOf(response, ''));
    return (await response.json()) as { identities: Identity[]; candidates: Candidate[] };
  },
});

export interface CollectorDevice {
  id: string;
  created: string;
  lastSeen: string | null;
}

/** The member's paired Windows collectors. */
export const collectorsQuery = queryOptions({
  queryKey: ['collectors'],
  queryFn: async () => {
    const response = await apiFetch('/api/collectors', { cache: 'no-store' });
    if (!response.ok) throw Error(await errorOf(response, 'Liste des collecteurs indisponible.'));
    return ((await response.json()) as { devices: CollectorDevice[] }).devices;
  },
});

/** The players this member can send live scoreboards for. */
export const livePlayersQuery = queryOptions({
  queryKey: ['live'],
  queryFn: async () => {
    const response = await apiFetch('/api/live');
    if (!response.ok) throw Error('Connecte-toi à RL-Pompes pour activer le direct.');
    const data = (await response.json()) as { players: string[] };
    if (!Array.isArray(data.players)) throw Error('Réponse de connexion invalide.');
    return data.players;
  },
});
