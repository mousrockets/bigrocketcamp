import { zValidator } from '@hono/zod-validator';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { type core, firstMessage } from '../lib/validation';
import type { AppEnv } from './auth';
import { noStore } from './respond';

interface BodyRules {
  /** The route's message for a body that is not what it expects. */
  invalid: string;
  maxLength?: number;
  /** Answered with 413 for a body over `maxLength`; without it, an over-long body is just invalid. */
  tooLarge?: string;
}

const refuse = (message: string, status: ContentfulStatusCode = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...noStore },
  });

/** The JSON body, checked against its schema; refused with the route's own French messages. */
export function jsonBody<Schema extends core.$ZodType>(
  schema: Schema,
  { invalid, maxLength = 2000, tooLarge }: BodyRules,
) {
  const readable = createMiddleware<AppEnv>(async (c, next) => {
    // Hono keeps the text it read: the validator parses it again without reading the request twice.
    const text = await c.req.text();
    if (text.length > maxLength) return refuse(tooLarge ?? invalid, tooLarge ? 413 : 400);
    try {
      JSON.parse(text);
    } catch {
      return refuse(invalid);
    }
    await next();
  });
  const valid = zValidator('json', schema, (result) => {
    if (!result.success) return refuse(firstMessage(result.error, invalid));
  });
  return [readable, valid] as const;
}

/** The query string, checked against its schema. */
export const queryOf = <Schema extends core.$ZodType>(schema: Schema, invalid: string) =>
  zValidator('query', schema, (result) => {
    if (!result.success) return refuse(firstMessage(result.error, invalid));
  });
