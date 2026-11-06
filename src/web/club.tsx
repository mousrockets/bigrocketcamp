import { createContext, useContext } from 'react';
import type { ClubPlayer, Platform, Roster } from '../lib/club';
import type { OwnProfile } from '../lib/members';
import { apiFetch } from './api';

// The club comes from the API once signed in (GET /api/club); before that, only its name (GET /api/club/name).

export interface Club {
  name: string;
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
export const ClubContext = createContext<Club | null>(null);

export const useClubName = (): string => useContext(ClubNameContext);

export function useClub(): Club {
  const club = useContext(ClubContext);
  if (!club) throw new Error('useClub needs a signed-in member.');
  return club;
}

export async function fetchClub(): Promise<Club | null> {
  const response = await apiFetch('/api/club', { cache: 'no-store' });
  if (!response.ok) return null;
  const club = (await response.json()) as Omit<Club, 'roster'>;
  return { ...club, roster: club.players.map((player) => player.slot) };
}

export async function fetchClubName(): Promise<string> {
  try {
    const response = await fetch('/api/club/name', { cache: 'no-store' });
    if (response.ok) return ((await response.json()) as { name: string }).name;
  } catch {
    // Offline: the page still works without the name.
  }
  return '';
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
