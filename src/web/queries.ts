import { queryOptions } from '@tanstack/react-query';
import {
  type Candidate,
  type CollectorDevice,
  collectorDevices,
  health,
  type Identity,
  type IdentityList,
  identityList,
  livePlayers,
  type MemberProfile,
  memberList,
} from '../lib/contract';
import { parseOrThrow } from '../lib/validation';
import type { DeployedVersion } from '../lib/version';
import { api, dataOf, errorOf, guestApi, isSignInRequired } from './api';
import { fetchClub, fetchClubIdentity } from './club';

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
    const response = await guestApi.health.$get();
    if (!response.ok) throw new Error(`The health check answered ${response.status}.`);
    // An API older than this check names no commit: nothing to compare.
    const { commit, deployedAt } = parseOrThrow(health, await response.json(), 'The health check names no commit.');
    return { commit, deployedAt };
  },
  refetchInterval: versionCheckEvery,
  refetchOnWindowFocus: 'always',
});

/** The club's members, for the administrators. */
export const membersQuery = queryOptions({
  queryKey: ['members'],
  queryFn: async (): Promise<MemberProfile[]> =>
    (await dataOf(api.members.$get(), memberList, 'Liste des membres indisponible.')).members,
});

export type { Candidate, CollectorDevice, Identity };

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
  queryFn: async (): Promise<IdentityList> => {
    const response = await api.identities.$get();
    if (!response.ok) throw new ApiError(response.status, await errorOf(response, ''));
    return parseOrThrow(identityList, await response.json(), 'Identités de jeu indisponibles.');
  },
});

/** The member's paired Windows collectors. */
export const collectorsQuery = queryOptions({
  queryKey: ['collectors'],
  queryFn: async (): Promise<CollectorDevice[]> =>
    (await dataOf(api.collectors.$get(), collectorDevices, 'Liste des collecteurs indisponible.')).devices,
});

/** The players this member can send live scoreboards for. */
export const livePlayersQuery = queryOptions({
  queryKey: ['live'],
  queryFn: async () => {
    const response = await api.live.$get();
    if (!response.ok) throw Error('Connecte-toi à RL-Pompes pour activer le direct.');
    return parseOrThrow(livePlayers, await response.json(), 'Réponse de connexion invalide.').players;
  },
});
