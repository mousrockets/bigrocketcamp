import { z } from '../validation';
import type { Known } from './shared';

/** Which build answers, and since when: the web app reloads itself when it no longer matches. */
export const health = z.looseObject({
  status: z.string(),
  /** The build's short commit; an API older than this check names none, and the app has nothing to compare. */
  commit: z.string(),
  deployedAt: z.string().nullable().catch(null),
});
export type Health = Known<z.output<typeof health>>;
