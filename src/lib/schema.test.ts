import { env } from 'cloudflare:workers';
import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import * as schema from './schema';

// src/lib/schema.ts must describe the database the migrations build: drizzle-kit generates the next
// migration from the difference, so a gap here would become a wrong migration.

const tables = (Object.values(schema) as unknown[]).filter((value): value is SQLiteTable => is(value, SQLiteTable));

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

test('every table of the database is in the schema, and only those', async () => {
  const stored = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
  ).all<{ name: string }>();
  expect(tables.map((table) => getTableName(table)).sort()).toEqual(stored.results.map((row) => row.name));
});

test.each(tables.map((table) => [getTableName(table), table] as const))(
  '%s matches its columns',
  async (name, table) => {
    const config = getTableConfig(table);
    const columns = (await env.DB.prepare(`PRAGMA table_info(\`${name}\`)`).all<ColumnInfo>()).results;
    const primary = new Set([
      ...config.columns.filter((column) => column.primary).map((column) => column.name),
      ...config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name)),
    ]);
    expect(
      config.columns
        .map((column) => [
          column.name,
          column.getSQLType(),
          column.notNull || primary.has(column.name),
          primary.has(column.name),
        ])
        .sort(),
    ).toEqual(
      columns
        .map((column) => [column.name, column.type.toLowerCase(), column.notnull === 1 || column.pk > 0, column.pk > 0])
        .sort(),
    );
  },
);

test.each(tables.map((table) => [getTableName(table), table] as const))('%s has its indexes', async (name, table) => {
  const config = getTableConfig(table);
  const declared = [
    ...config.indexes.map((index) => index.config.name),
    ...config.columns.filter((column) => column.isUnique).map((column) => column.uniqueName),
  ];
  const stored = (
    await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'",
    )
      .bind(name)
      .all<{ name: string }>()
  ).results.map((index) => index.name);
  // A column declared unique in the migrations has SQLite's own index; drizzle-kit names the ones it creates.
  expect(stored.every((index) => declared.includes(index))).toBe(true);
  const unnamedUnique = config.columns.filter((column) => column.isUnique).map((column) => column.uniqueName);
  expect(declared.filter((index) => !unnamedUnique.includes(index)).sort()).toEqual(
    stored.filter((index) => !unnamedUnique.includes(index)).sort(),
  );
});
