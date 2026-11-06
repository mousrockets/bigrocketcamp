// Turns the prototype's data export (one JSON array per table) into SQL for the new database:
//   node scripts/import-prototype.ts <export-directory> > import.sql
//   npx wrangler d1 execute bigrocketcamp --remote --file import.sql
// Rows are copied column for column into today's tables (src/lib/schema.ts): renamed tables take their new
// name, and columns the migrations retired are left out.
// The export holds personal data: keep it and import.sql out of the repository, and delete both afterwards.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../src/lib/schema.ts';

/** The prototype's tables that changed name (migration 0018). */
const renamed: Record<string, string> = { results: 'prototype_results', match_rosters: 'prototype_match_rosters' };

const columnsOf = new Map(
  (Object.values(schema) as unknown[])
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => [getTableName(table), new Set(getTableConfig(table).columns.map((column) => column.name))]),
);

const tables = [
  'results',
  'exercises',
  'exercise_reactions',
  'collectors',
  'match_rosters',
  'result_observations',
  'source_reports',
  'player_ranks',
  'player_identities',
  'player_identity_aliases',
  'monthly_mmr_policy',
  'mmr_entries',
  'monthly_mmr_results',
  'drink_debts',
];

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

// The app keeps only the rank source's readings (migrations 0014 and 0015), and a reaction only with its
// exercise (migration 0017).
const exported = (table: string): Record<string, unknown>[] => {
  const file = join(directory ?? '', `${table}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
};
const obsolete: Record<string, (row: Record<string, unknown>) => boolean> = {
  mmr_entries: (row) => row.source !== undefined && row.source !== 'observer',
  player_ranks: (row) => row.status !== 'ready',
  exercise_reactions: (row) => !exported('exercises').some((exercise) => exercise.id === row.exercise_id),
};

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/import-prototype.ts <export-directory>');

const statements: string[] = [];
for (const table of tables) {
  const file = join(directory, `${table}.json`);
  if (!existsSync(file)) {
    console.error(`skipped ${table}: no ${file}`);
    continue;
  }
  const rows = (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[]).filter(
    (row) => !obsolete[table]?.(row),
  );
  const target = renamed[table] ?? table;
  const kept = columnsOf.get(target);
  if (!kept) throw new Error(`No table ${target} in src/lib/schema.ts`);
  // The migrations already insert some rows (the monthly policy): the export replaces them.
  statements.push(`DELETE FROM ${target};`);
  for (const row of rows) {
    const columns = Object.keys(row).filter((column) => kept.has(column));
    statements.push(
      `INSERT INTO ${target} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`,
    );
  }
  console.error(`${table}: ${rows.length} rows`);
}
process.stdout.write(`${statements.join('\n')}\n`);
