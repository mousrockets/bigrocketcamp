import { createContext, useContext } from 'react';
import type { ClubPlayer, Platform, Roster } from '../lib/club';
import type { ChallengeRules } from '../lib/club-rules';
import type { OwnProfile } from '../lib/members';
import { fetchWithin } from '../lib/timeout';
import { apiFetch } from './api';

// The club comes from the API once signed in (GET /api/club); before that, only its name (GET /api/club/name).

/** What a visitor sees of the club before signing in. */
export interface ClubIdentity {
  name: string;
  /** The uploaded logo's address, or null for the default picture. */
  logo: string | null;
}

export interface Club extends ClubIdentity {
  /** Absent from an older API: the default rules then apply. */
  rules?: ChallengeRules;
  players: ClubPlayer[];
  roster: Roster;
  me: OwnProfile;
}

export const platformLabels: Record<Platform, string> = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  switch: 'Switch',
};

export const ClubNameContext = createContext('');
export const ClubLogoContext = createContext<string | null>(null);
export const ClubContext = createContext<Club | null>(null);

export const useClubName = (): string => useContext(ClubNameContext);

/** The picture shown when the club has not uploaded a logo. */
export const defaultLogo = '/club-photo.jpg';
export const useClubLogo = (): string => useContext(ClubLogoContext) ?? defaultLogo;

export function useClub(): Club {
  const club = useContext(ClubContext);
  if (!club) throw new Error('useClub needs a signed-in member.');
  return club;
}

export async function fetchClub(): Promise<Club | null> {
  const response = await apiFetch('/api/club', { cache: 'no-store' });
  if (!response.ok) return null;
  const club = (await response.json()) as Omit<Club, 'roster'>;
  return { ...club, logo: club.logo ?? null, roster: club.players.map((player) => player.slot) };
}

export async function fetchClubIdentity(): Promise<ClubIdentity> {
  try {
    const response = await fetchWithin(fetch, '/api/club/name', { cache: 'no-store' });
    if (response.ok) {
      const identity = (await response.json()) as Partial<ClubIdentity>;
      return { name: identity.name ?? '', logo: identity.logo ?? null };
    }
  } catch {
    // Offline: the page still works without the name.
  }
  return { name: '', logo: null };
}

/** The platform shown on a player's card. */
export function playerPlatform(players: readonly ClubPlayer[], name: string): string {
  const platform = players.find((player) => player.slot === name)?.platform;
  return platform ? platformLabels[platform] : '';
}

/** The error message of an API answer, or a fallback. */
export async function errorOf(response: Response, fallback: string): Promise<string> {
  try {
    return ((await response.json()) as { error?: string }).error || fallback;
  } catch {
    return fallback;
  }
}
