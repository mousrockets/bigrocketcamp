import * as z from 'zod/mini';
import type * as core from 'zod/v4/core';

// Input schemas shared with the web app use Zod Mini, which keeps the app light; the API's own schemas
// use Zod (src/worker/inputs.ts). Both share this setting: every rule names its own French message, and a
// rule that would not gets an empty one, which the input's general message replaces. Zod's English never
// reaches a member.
z.config({ customError: () => '' });

export { type core, z };

/** Gives a rule its message. */
export const says = (message: string) => ({ error: message });

/** The message of the first rule the input broke. */
export const firstMessage = (error: { issues: readonly { message: string }[] }, fallback: string): string =>
  error.issues[0]?.message || fallback;

/** Parses with the schema, or throws the first broken rule's message. */
export function parseOrThrow<Schema extends core.$ZodType>(
  schema: Schema,
  input: unknown,
  fallback: string,
): core.output<Schema> {
  const result = z.safeParse(schema, input);
  if (!result.success) throw new Error(firstMessage(result.error, fallback));
  return result.data;
}
