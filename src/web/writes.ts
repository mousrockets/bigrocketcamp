import {
  type ClubNameInput,
  done,
  type Invitation,
  type MemberChange,
  type MemberToRemove,
  type ProfileInput,
  pairingCodeCreated,
  type RuleChange,
} from '../lib/contract';
import type { ExerciseType } from '../lib/domain';
import { api, dataOf, errorOf, guestApi, sent } from './api';

// Every write to the API, run by the pages as TanStack Query mutations. None is retried by the cache:
// a write is sent once per action of the member, and the pages decide what a failure means.

/** The settings page's writes, by method and path, each sent through its typed route. */
const jsonWrites = {
  'PUT /api/club': (json: ClubNameInput) => api.club.$put({ json }),
  'PUT /api/club/rules': (json: RuleChange) => api.club.rules.$put({ json }),
  'POST /api/members': (json: Invitation) => api.members.$post({ json }),
  'PATCH /api/members': (json: MemberChange) => api.members.$patch({ json }),
  'DELETE /api/members': (json: MemberToRemove) => api.members.$delete({ json }),
};
type JsonWrites = typeof jsonWrites;

export type JsonWrite = {
  [Route in keyof JsonWrites]: Route extends `${infer Method} ${infer Path}`
    ? {
        path: Path;
        method: Method;
        body: Parameters<JsonWrites[Route]>[0];
        /** What the member reads when the API refuses without saying why. */
        fallback: string;
      }
    : never;
}[keyof JsonWrites];

/** Sends a JSON body; a refusal becomes the API's own message, or `fallback`. */
export async function sendJson({ path, method, body, fallback }: JsonWrite): Promise<void> {
  // JsonWrite pairs each route with its own body; once destructured, the compiler no longer sees the pairing.
  const route = `${method} ${path}` as keyof JsonWrites;
  const write = jsonWrites[route] as (body: JsonWrite['body']) => ReturnType<JsonWrites[typeof route]>;
  await sent(write(body), fallback);
}

export const saveProfile = (profile: ProfileInput) =>
  sent(api.profile.$put({ json: profile }), 'Enregistrement impossible.');

export const deleteAccount = (): Promise<void> => sent(api.profile.$delete(), 'Suppression impossible.');

export interface IdentityChange {
  slot: string;
  playerId: string;
  action: 'confirm' | 'remove';
}

export async function changeIdentity(change: IdentityChange): Promise<void> {
  await dataOf(api.identities.$post({ json: change }), done, 'Confirmation impossible.');
}

/** A one-time code that pairs a Windows collector. */
export async function createPairingCode(): Promise<{ code: string; expires: string }> {
  return dataOf(api.collectors.$post(), pairingCodeCreated, 'Code impossible à créer.');
}

export async function revokeCollector(id: string): Promise<void> {
  const response = await api.collectors.$delete({ json: { id } });
  // Already revoked elsewhere: the list read afterwards says so.
  if (!response.ok && response.status !== 404) throw Error(await errorOf(response, 'Révocation impossible.'));
}

export const uploadClubLogo = (image: Blob): Promise<void> =>
  // The typed client sends JSON or forms only: the image goes as the request's own body.
  sent(
    api.club.logo.$put(undefined, { headers: { 'Content-Type': image.type }, init: { body: image } }),
    'Envoi du logo impossible.',
  );

export const removeClubLogo = (): Promise<void> => sent(api.club.logo.$delete(), 'Retrait du logo impossible.');

/** An exercise as declared: its id is chosen by the page, so that resending it never counts twice. */
export interface Declaration {
  id: string;
  player: string;
  type: ExerciseType;
  count: number;
  day: string;
}

export async function declareExercise(exercise: Declaration): Promise<void> {
  await dataOf(api.exercise.$post({ json: exercise }), done, 'Impossible d’enregistrer cet exercice.');
}

export async function undoExercise(id: string): Promise<void> {
  await dataOf(api.exercise.$delete({ json: { id } }), done, 'Impossible d’annuler cette série.');
}

/** Marks a drink as offered, or takes that back. */
export async function settleDrink(body: { action: 'settle' | 'undo'; id: string }): Promise<void> {
  const result = await dataOf(api.monthly.$post({ json: body }), done, 'Action impossible.');
  if (!result.ok) throw Error('Action impossible.');
}

// Signing in happens before any session: these calls do not watch for a lost session.

export const requestSignInCode = (email: string) =>
  sent(guestApi.auth.code.$post({ json: { email } }), 'Impossible d’envoyer le code. Réessaie dans un instant.');

export const verifySignInCode = ({ email, code }: { email: string; code: string }) =>
  sent(guestApi.auth.verify.$post({ json: { email, code } }), 'Code incorrect ou expiré.');
