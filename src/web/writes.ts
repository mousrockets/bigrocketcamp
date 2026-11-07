import type { Platform } from '../lib/club';
import type { ExerciseType } from '../lib/domain';
import { fetchWithin } from '../lib/timeout';
import { apiFetch } from './api';
import { errorOf } from './club';

// Every write to the API, run by the pages as TanStack Query mutations. None is retried by the cache:
// a write is sent once per action of the member, and the pages decide what a failure means.

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export interface JsonWrite {
  path: string;
  method: string;
  body: unknown;
  /** What the member reads when the API refuses without saying why. */
  fallback: string;
}

/** Sends a JSON body; a refusal becomes the API's own message, or `fallback`. */
export async function sendJson({ path, method, body, fallback }: JsonWrite): Promise<void> {
  const response = await apiFetch(path, json(method, body));
  if (!response.ok) throw Error(await errorOf(response, fallback));
}

/** Like `sendJson`, for the routes that always answer in JSON, even on success. */
async function sendExpectingJson(path: string, method: string, body: unknown, fallback: string): Promise<void> {
  const response = await apiFetch(path, json(method, body));
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw Error(result.error || fallback);
}

export interface ProfileFields {
  duoPseudo: string;
  soloPseudo: string;
  platform: Platform;
}

export const saveProfile = (profile: ProfileFields) =>
  sendJson({ path: '/api/profile', method: 'PUT', body: profile, fallback: 'Enregistrement impossible.' });

export async function deleteAccount(): Promise<void> {
  const response = await apiFetch('/api/profile', { method: 'DELETE' });
  if (!response.ok) throw Error(await errorOf(response, 'Suppression impossible.'));
}

export interface IdentityChange {
  slot: string;
  playerId: string;
  action: 'confirm' | 'remove';
}

export const changeIdentity = (change: IdentityChange) =>
  sendExpectingJson('/api/identities', 'POST', change, 'Confirmation impossible.');

/** A one-time code that pairs a Windows collector. */
export async function createPairingCode(): Promise<{ code: string; expires: string }> {
  const response = await apiFetch('/api/collectors', { method: 'POST' });
  if (!response.ok) throw Error(await errorOf(response, 'Code impossible à créer.'));
  return (await response.json()) as { code: string; expires: string };
}

export async function revokeCollector(id: string): Promise<void> {
  const response = await apiFetch('/api/collectors', json('DELETE', { id }));
  // Already revoked elsewhere: the list read afterwards says so.
  if (!response.ok && response.status !== 404) throw Error(await errorOf(response, 'Révocation impossible.'));
}

export async function uploadClubLogo(image: Blob): Promise<void> {
  const response = await apiFetch('/api/club/logo', {
    method: 'PUT',
    headers: { 'Content-Type': image.type },
    body: image,
  });
  if (!response.ok) throw Error(await errorOf(response, 'Envoi du logo impossible.'));
}

export async function removeClubLogo(): Promise<void> {
  const response = await apiFetch('/api/club/logo', { method: 'DELETE' });
  if (!response.ok) throw Error(await errorOf(response, 'Retrait du logo impossible.'));
}

/** An exercise as declared: its id is chosen by the page, so that resending it never counts twice. */
export interface Declaration {
  id: string;
  player: string;
  type: ExerciseType;
  count: number;
  day: string;
}

export const declareExercise = (exercise: Declaration) =>
  sendExpectingJson('/api/exercise', 'POST', exercise, 'Impossible d’enregistrer cet exercice.');

export const undoExercise = (id: string) =>
  sendExpectingJson('/api/exercise', 'DELETE', { id }, 'Impossible d’annuler cette série.');

export async function reactToExercise({ exerciseId, emoji }: { exerciseId: string; emoji: string }): Promise<void> {
  const response = await apiFetch('/api/reaction', json('POST', { exerciseId, emoji }));
  if (!response.ok) throw Error(((await response.json()) as { error?: string }).error || 'Réaction impossible.');
}

/** Asks the API to close the finished months now; returns how many it closed, or null if it could not. */
export async function closeDueMonths(): Promise<number | null> {
  const response = await apiFetch('/api/monthly', json('POST', { action: 'refresh' }));
  return response.ok ? (((await response.json()) as { closed?: number }).closed ?? 0) : null;
}

/** Marks a drink as offered, or takes that back. */
export async function settleDrink(body: { action: 'settle' | 'undo'; id: string }): Promise<void> {
  const response = await apiFetch('/api/monthly', json('POST', body));
  const result = (await response.json()) as { error?: string; ok?: boolean };
  if (!response.ok || !result.ok) throw Error(result.error || 'Action impossible.');
}

// Signing in happens before any session: these calls do not go through apiFetch, which watches for a lost session.

async function postSignIn(path: string, body: Record<string, string>, fallback: string): Promise<void> {
  const response = await fetchWithin(fetch, path, json('POST', body));
  if (!response.ok) throw Error(await errorOf(response, fallback));
}

export const requestSignInCode = (email: string) =>
  postSignIn('/api/auth/code', { email }, 'Impossible d’envoyer le code. Réessaie dans un instant.');

export const verifySignInCode = ({ email, code }: { email: string; code: string }) =>
  postSignIn('/api/auth/verify', { email, code }, 'Code incorrect ou expiré.');
