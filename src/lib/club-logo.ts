import { eq, type SQLWrapper, sql } from 'drizzle-orm';
import type { Database } from './db';
import { excluded, orm } from './orm';
import { clubLogo } from './schema';

// The club's logo lives in D1, resized by the browser before sending: a small square of a few tens of kB.

export const logoTypes = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type LogoType = (typeof logoTypes)[number];

/** Far above what the browser sends (about 50 kB), far below what a D1 row holds (2 MB). */
export const largestLogo = 100 * 1024;

export interface ClubLogo {
  image: Uint8Array<ArrayBuffer>;
  contentType: LogoType;
  version: string;
}

const startsWith = (bytes: Uint8Array, expected: readonly number[], offset = 0) =>
  expected.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));

/** The image type the bytes themselves say, whatever the request claims. */
export function imageTypeOf(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  return null;
}

async function versionOf(image: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', image));
  return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The address the app shows the logo at: a new image gets a new address, so browsers may keep each one. */
export const logoUrl = (version: string) => `/api/club/logo?v=${version}`;

const theLogo = eq(clubLogo.id, 1);

// The Worker has no Node Buffer, which Drizzle's blob column reads and writes: the bytes go through as they are.
const asStored = (image: SQLWrapper | Uint8Array) => sql<number[] | ArrayBuffer>`${image}`;

export async function readLogoVersion(db: Database): Promise<string | null> {
  const row = await orm(db).select({ version: clubLogo.version }).from(clubLogo).where(theLogo).get();
  return row?.version ?? null;
}

export async function readLogo(db: Database): Promise<ClubLogo | null> {
  const row = await orm(db)
    .select({ image: asStored(clubLogo.image), contentType: clubLogo.contentType, version: clubLogo.version })
    .from(clubLogo)
    .where(theLogo)
    .get();
  if (!row) return null;
  return { image: new Uint8Array(row.image), contentType: row.contentType, version: row.version };
}

export async function saveLogo(db: Database, image: Uint8Array<ArrayBuffer>, contentType: LogoType): Promise<string> {
  const version = await versionOf(image);
  const logo = { image: asStored(image), contentType, version };
  await orm(db)
    .insert(clubLogo)
    .values({ id: 1, ...logo })
    .onConflictDoUpdate({ target: clubLogo.id, set: { ...logo, updatedAt: excluded(clubLogo.updatedAt) } });
  return version;
}

export async function removeLogo(db: Database): Promise<void> {
  await orm(db).delete(clubLogo).where(theLogo);
}
