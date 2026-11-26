// The local database that `npm run dev` uses (docs/base-locale.md):
//   node scripts/local-database.ts pull-prod   replaces it with a minimised copy of production (npm run db:pull-prod)
//   node scripts/local-database.ts reset       puts back the fictitious players of scripts/seed-dev.sql (npm run db:reset)
// The production export goes through .wrangler/database-copy, ignored by git and deleted at the end, even on failure.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dropEverything, localCopy, type SchemaObject, schemaObjects } from './production-copy.ts';

const database = 'bigrocketcamp';
const workDirectory = join('.wrangler', 'database-copy');

function wrangler(args: string[], options: { quiet?: boolean } = {}): string {
  return execFileSync('npx', ['wrangler', ...args, '--config', 'wrangler.jsonc'], {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

function localObjects(): SchemaObject[] {
  const output = wrangler(['d1', 'execute', database, '--local', '--json', '--command', schemaObjects], {
    quiet: true,
  });
  const [answer] = JSON.parse(output) as { results: SchemaObject[] }[];
  return answer?.results ?? [];
}

/** Its answer (one empty result per statement) is left out; errors still show. */
function executeFile(file: string): void {
  wrangler(['d1', 'execute', database, '--local', '--yes', '--file', file], { quiet: true });
}

function executeLocally(sql: string): void {
  const file = join(workDirectory, 'local.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  executeFile(file);
}

function migrate(): void {
  wrangler(['d1', 'migrations', 'apply', database, '--local']);
}

function withWorkDirectory(work: () => void): void {
  rmSync(workDirectory, { recursive: true, force: true });
  mkdirSync(workDirectory, { recursive: true, mode: 0o700 });
  try {
    work();
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

function pullProduction(): void {
  withWorkDirectory(() => {
    const exported = join(workDirectory, 'production.sql');
    wrangler(['d1', 'export', database, '--remote', '--output', exported]);
    const { sql, members } = localCopy(readFileSync(exported, 'utf8'), localObjects());
    rmSync(exported);
    executeLocally(sql);
    // Production may be behind this branch: its own migrations come on top of the copy.
    migrate();
    console.log(
      '\nLocal copy of production ready. Sign in with one of these addresses (code in the npm run dev terminal):',
    );
    for (const member of members) console.log(`  ${member.role.padEnd(6)}  ${member.email}`);
    console.log(
      'Then reload the app: if it shows the old board, clear the site data of 127.0.0.1:10071 in the browser.',
    );
  });
}

function reset(): void {
  withWorkDirectory(() => {
    executeLocally(['PRAGMA defer_foreign_keys=TRUE;', ...dropEverything(localObjects())].join('\n'));
    migrate();
    executeFile(join('scripts', 'seed-dev.sql'));
    console.log('\nLocal database back to the fictitious players of scripts/seed-dev.sql.');
  });
}

const commands: Record<string, () => void> = { 'pull-prod': pullProduction, reset };
const command = commands[process.argv[2] ?? ''];
if (!command) throw new Error('Usage: node scripts/local-database.ts pull-prod | reset');
command();
