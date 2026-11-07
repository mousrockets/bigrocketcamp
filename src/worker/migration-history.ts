import { env } from 'cloudflare:workers';

// For the migration tests: a database as production held it right before a given migration, whatever the
// migrations that came after changed. It lives in its own binding, apart from the tests' migrated database.
// Raw SQL throughout: it runs the migration files themselves, and reads and drops what sqlite_master lists,
// none of which the Drizzle schema (the latest one) describes.

const historical = () => env.MIGRATION_DB;

const migrationsWhere = (keep: (name: string) => boolean) =>
  env.TEST_MIGRATIONS.filter((migration) => keep(migration.name)).sort((a, b) => a.name.localeCompare(b.name));

async function apply(db: D1Database, keep: (name: string) => boolean) {
  for (const migration of migrationsWhere(keep)) {
    for (const query of migration.queries) await db.prepare(query).run();
  }
}

/** An empty database, then every migration before the one whose name starts with `prefix`. */
export async function databaseBefore(prefix: string): Promise<D1Database> {
  const db = historical();
  const objects = await db
    .prepare(
      "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND type IN ('trigger', 'view', 'table')",
    )
    .all<{ type: string; name: string }>();
  if (objects.results.length) {
    await db.batch([
      db.prepare('PRAGMA defer_foreign_keys = ON'),
      ...objects.results.map((object) => db.prepare(`DROP ${object.type.toUpperCase()} IF EXISTS \`${object.name}\``)),
    ]);
  }
  await apply(db, (name) => name < prefix);
  return db;
}

/** Runs the migration whose name starts with `prefix`. */
export const runMigration = (db: D1Database, prefix: string) => apply(db, (name) => name.startsWith(prefix));

/** Runs every migration from the one whose name starts with `prefix`. */
export const runMigrationsFrom = (db: D1Database, prefix: string) => apply(db, (name) => name >= prefix);
