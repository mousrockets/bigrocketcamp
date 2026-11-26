// Turns an export of the production database (`wrangler d1 export --remote`) into SQL that replaces the local
// database with a minimised copy: what lets someone act as a member, or reach a member's devices, never reaches the
// developer's disk, and every e-mail address becomes a fictitious one at example.com. See docs/base-locale.md.

/**
 * Sessions, sign-in and pairing codes, paired collectors and push subscriptions: their rows are left out of the copy.
 * A push subscription would even let the local server notify a member's real phone.
 */
export const leftOutTables = [
  'sessions',
  'sign_in_codes',
  'collector_pairing_codes',
  'collector_devices',
  'push_subscriptions',
] as const;

export interface LocalMember {
  role: string;
  email: string;
}

export interface SchemaObject {
  type: string;
  name: string;
  /** The tables its foreign keys point to, comma-separated (`schemaObjects`). */
  parents?: string | null;
}

/** Lists what `dropEverything` drops, with what each table's foreign keys point to. */
export const schemaObjects = `SELECT type, name,
  (SELECT group_concat("table") FROM pragma_foreign_key_list(name)) AS parents
  FROM sqlite_schema WHERE type IN ('table', 'view', 'trigger')`;

const quoteId = (name: string) => `"${name.replaceAll('"', '""')}"`;
const quoteText = (text: string) => `'${text.replaceAll("'", "''")}'`;

/**
 * Drops every table, view and trigger of a database, the ones SQLite and D1 keep for themselves aside. A table goes
 * after every table whose foreign keys point to it: dropping it first makes SQLite fail on the others.
 */
export function dropEverything(objects: SchemaObject[]): string[] {
  const own = objects.filter(({ name }) => !name.startsWith('sqlite_') && !name.startsWith('_cf_'));
  const drop = (type: string, name: string) => `DROP ${type.toUpperCase()} IF EXISTS ${quoteId(name)};`;
  const others = (type: string) => own.filter((object) => object.type === type).map(({ name }) => drop(type, name));
  const tables = new Map(
    own.filter(({ type }) => type === 'table').map(({ name, parents }) => [name, parents?.split(',') ?? []]),
  );
  const tableDrops: string[] = [];
  while (tables.size > 0) {
    const referenced = new Set([...tables].flatMap(([name, parents]) => parents.filter((parent) => parent !== name)));
    const free = [...tables.keys()].filter((name) => !referenced.has(name));
    if (free.length === 0) throw new Error(`Foreign keys go round in circles: ${[...tables.keys()].join(', ')}`);
    for (const name of free) {
      tableDrops.push(drop('table', name));
      tables.delete(name);
    }
  }
  return [...others('trigger'), ...others('view'), ...tableDrops];
}

/**
 * The SQL that replaces the local database with the export: everything local is dropped first, in the same file, so
 * that a failed import leaves the local database as it was.
 */
export function localCopy(dump: string, localObjects: SchemaObject[]): { sql: string; members: LocalMember[] } {
  const members: LocalMember[] = [];
  const taken = new Set<string>();
  const lines = dump.split('\n').flatMap((line) => {
    const table = insertedTable(line);
    if (table && (leftOutTables as readonly string[]).includes(table)) return [];
    if (table !== 'members') return [line];
    const { line: rewritten, member } = withFictitiousEmail(line, taken);
    members.push(member);
    return [rewritten];
  });
  const sql = ['PRAGMA defer_foreign_keys=TRUE;', ...dropEverything(localObjects), ...lines].join('\n');
  return { sql, members };
}

/** The table a line of the export inserts into: the export writes one INSERT per line, line breaks escaped. */
function insertedTable(line: string): string | undefined {
  return /^INSERT INTO "((?:[^"]|"")+)" \(/.exec(line)?.[1]?.replaceAll('""', '"');
}

function withFictitiousEmail(line: string, taken: Set<string>): { line: string; member: LocalMember } {
  const match = /^(INSERT INTO "members" \()(.*?)(\) VALUES\()(.*)\);$/.exec(line);
  if (!match) throw new Error('Unexpected members row in the export: the copy stops before it reaches the disk.');
  const [, start = '', columnList = '', middle = '', valueList = ''] = match;
  const columns = columnList.split(',').map((column) => column.replace(/^"|"$/g, ''));
  const values = splitValues(valueList);
  const at = (column: string) => columns.indexOf(column);
  if (at('email') < 0 || values.length !== columns.length) {
    throw new Error('Unexpected members row in the export: the copy stops before it reaches the disk.');
  }
  const name = [at('duo_pseudo'), at('first_name')].map((index) => textOf(values[index] ?? '')).find(Boolean);
  const email = uniqueAddress(slug(name ?? '') || 'membre', taken);
  values[at('email')] = quoteText(email);
  const role = textOf(values[at('role')] ?? '') ?? 'member';
  return { line: `${start}${columnList}${middle}${values.join(',')});`, member: { role, email } };
}

/** Splits `'a','b,c',NULL,replace('x\ny','\n',char(10))` on its top-level commas. */
export function splitValues(list: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let inText = false;
  let start = 0;
  for (let index = 0; index < list.length; index++) {
    const char = list[index];
    if (char === "'") inText = !inText;
    else if (inText) continue;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      values.push(list.slice(start, index));
      start = index + 1;
    }
  }
  values.push(list.slice(start));
  return values;
}

/** The text of a plain SQL string literal; undefined for NULL, numbers and anything else. */
function textOf(value: string): string | undefined {
  const text = /^'(.*)'$/s.exec(value)?.[1];
  return text === undefined ? undefined : text.replaceAll("''", "'");
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueAddress(name: string, taken: Set<string>): string {
  let address = `${name}@example.com`;
  for (let suffix = 2; taken.has(address); suffix++) address = `${name}-${suffix}@example.com`;
  taken.add(address);
  return address;
}
