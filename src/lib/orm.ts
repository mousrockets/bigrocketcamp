import { getTableColumns, type SQL, type SQLWrapper, sql, type Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { type AnySQLiteColumn, SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import type { Database, Statement } from './db';
import * as schema from './schema';

/** Typed queries on the database (src/lib/schema.ts); raw SQL stays where Drizzle cannot express it. */
export const orm = (db: Database) => drizzle(db as unknown as Parameters<typeof drizzle>[0], { schema });

export type Orm = ReturnType<typeof orm>;

const dialect = new SQLiteAsyncDialect();

/**
 * A Drizzle query, or raw SQL written with sql``, as a D1 statement: for a batch that mixes both, which
 * Drizzle's own batch() cannot run on D1 (it fails on raw SQL with parameters).
 */
export const statementOf = (db: Database, query: SQLWrapper): Statement => {
  const { sql: text, params } = dialect.sqlToQuery(query.getSQL());
  return db.prepare(text).bind(...params);
};

/**
 * `value IN list`, the list sent as one JSON parameter: D1 binds at most 100 parameters per statement,
 * where inArray() would bind one per item.
 */
export const inJsonList = (value: SQLWrapper, list: readonly unknown[]): SQL =>
  sql`${value} IN (SELECT value FROM json_each(${JSON.stringify(list)}))`;

/** SQLite's own row number, which Drizzle does not declare: the order rows were written in. */
export const rowid = sql<number>`rowid`;

/** In an upsert's update, the value the insert proposed for this column: Drizzle has no builder for it. */
export const excluded = (column: AnySQLiteColumn): SQL => sql`excluded.${sql.identifier(column.name)}`;

type SqlNamed<T extends Table> = {
  [Key in keyof T['_']['columns'] as T['_']['columns'][Key]['_']['name']]: T['_']['columns'][Key];
};

/** A table's columns under their SQL names, as `SELECT *` returns them to code written for them. */
export const sqlNamed = <T extends Table>(table: T): SqlNamed<T> =>
  Object.fromEntries(Object.values(getTableColumns(table)).map((column) => [column.name, column])) as SqlNamed<T>;
