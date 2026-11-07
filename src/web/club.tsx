import { createContext, useContext } from 'react';
import type { ClubPlayer, Platform, Roster } from '../lib/club';
import { type Club as ClubAnswer, type ClubIdentity, club as clubAnswer, clubIdentity } from '../lib/contract';
import { api, guestApi } from './api';

// The club comes from the API once signed in (GET /api/club); before that, only its name (GET /api/club/name).

export { errorOf } from './api';
export type { ClubIdentity };

export interface Club extends ClubAnswer {
  roster: Roster;
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

/** The club, or null when the API did not give it. */
export async function fetchClub(): Promise<Club | null> {
  const response = await api.club.$get();
  if (!response.ok) return null;
  const read = clubAnswer.safeParse(await response.json());
  if (!read.success) return null;
  return { ...read.data, roster: read.data.players.map((player) => player.slot) };
}

export async function fetchClubIdentity(): Promise<ClubIdentity> {
  try {
    const response = await guestApi.club.name.$get();
    const identity = response.ok && clubIdentity.safeParse(await response.json());
    if (identity?.success) return identity.data;
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
