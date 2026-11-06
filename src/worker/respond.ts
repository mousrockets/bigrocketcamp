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

/** Answers with the error's own status when the business logic gave one. */
export function failure(c: Context, error: unknown, fallback: string) {
  const status = ((error as { status?: number } | null)?.status ?? 400) as ContentfulStatusCode;
  return c.json({ error: error instanceof Error ? error.message : fallback }, status, noStore);
}
