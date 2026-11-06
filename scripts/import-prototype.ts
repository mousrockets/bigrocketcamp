// Turns the prototype's data export (one JSON array per table) into SQL for the new database:
//   node scripts/import-prototype.ts <export-directory> > import.sql
//   npx wrangler d1 execute bigrocketcamp --remote --file import.sql
// The schema is the prototype's own (migrations 0000 to 0009), so rows are copied column for column.
// The export holds personal data: keep it and import.sql out of the repository, and delete both afterwards.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  'public_mmr_sync',
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

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/import-prototype.ts <export-directory>');

const statements: string[] = [];
for (const table of tables) {
  const file = join(directory, `${table}.json`);
  if (!existsSync(file)) {
    console.error(`skipped ${table}: no ${file}`);
    continue;
  }
  const rows: Record<string, unknown>[] = JSON.parse(readFileSync(file, 'utf8'));
  // The migrations already insert some rows (the monthly policy): the export replaces them.
  statements.push(`DELETE FROM ${table};`);
  for (const row of rows) {
    const columns = Object.keys(row);
    statements.push(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`,
    );
  }
  console.error(`${table}: ${rows.length} rows`);
}
process.stdout.write(`${statements.join('\n')}\n`);
