import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const noStore = { 'Cache-Control': 'no-store' };

/** A small JSON body, or null when it is too long or not JSON. */
export async function smallJson(c: Context, maxLength = 2000): Promise<Record<string, unknown> | null> {
  const text = await c.req.text();
  if (text.length > maxLength) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A database error quotes the query and its values: it stays in the server, by its name only. */
const isDatabaseError = (error: Error) =>
  error.name === 'DrizzleQueryError' || /D1_|SQLITE_|Failed query/.test(error.message);

/** The business rule's own message, or the fallback; never a database error. */
export function publicMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (isDatabaseError(error)) {
    console.error('database error', error.name);
    return fallback;
  }
  return error.message;
}

/** Answers with the error's own status when the business logic gave one; 500 for a database error. */
export function failure(c: Context, error: unknown, fallback: string, status: ContentfulStatusCode = 400) {
  const own = (error as { status?: number } | null)?.status as ContentfulStatusCode | undefined;
  const internal = error instanceof Error && isDatabaseError(error);
  return c.json({ error: publicMessage(error, fallback) }, internal ? 500 : (own ?? status), noStore);
}
