import { drizzle } from 'drizzle-orm/d1';
import type { Database } from './db';
import * as schema from './schema';

/** Typed queries on the database (src/lib/schema.ts); raw SQL stays where it reads better. */
export const orm = (db: Database) => drizzle(db as unknown as Parameters<typeof drizzle>[0], { schema });

export type Orm = ReturnType<typeof orm>;
