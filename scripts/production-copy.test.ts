import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { dropEverything, localCopy, type SchemaObject, schemaObjects, splitValues } from './production-copy';

// An export as `wrangler d1 export` writes it: one statement per line for the rows, line breaks escaped.
const dump = [
  'PRAGMA defer_foreign_keys=TRUE;',
  'CREATE TABLE `members` (`id` text PRIMARY KEY NOT NULL, `email` text NOT NULL);',
  `INSERT INTO "members" ("id","email","role","first_name","duo_pseudo") VALUES('m1','lea.real@gmail.com','admin','Léa','Nokouki');`,
  `INSERT INTO "members" ("id","email","role","first_name","duo_pseudo") VALUES('m2','sam@real.fr','member','Sam',NULL);`,
  `INSERT INTO "members" ("id","email","role","first_name","duo_pseudo") VALUES('m3','o''neil@real.fr','member',NULL,'nokouki');`,
  `INSERT INTO "sessions" ("token_hash","member_id","expires") VALUES('hash','m1',1);`,
  `INSERT INTO "sign_in_codes" ("email","code_hash","expires","attempts","sent") VALUES('sam@real.fr','h',1,0,1);`,
  `INSERT INTO "collector_pairing_codes" ("code_hash","member_id","expires","attempts") VALUES('h','m1',1,0);`,
  `INSERT INTO "collector_devices" ("id","token_hash","member_id","created","last_seen") VALUES('d','h','m1',1,NULL);`,
  `INSERT INTO "push_subscriptions" ("id","member_id","endpoint","p256dh","auth") VALUES('p','m1','https://push.example/x','k','a');`,
  `INSERT INTO "exercises" ("id","note") VALUES('e1',replace('GG,\\nFF','\\n',char(10)));`,
  'CREATE TRIGGER `exercises_insert` AFTER INSERT ON `exercises` BEGIN',
  '  UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;',
  'END;',
].join('\n');

describe('the local copy of production', () => {
  it('leaves out the sessions, the codes, the paired collectors and the push subscriptions', () => {
    const { sql } = localCopy(dump, []);
    for (const table of [
      'sessions',
      'sign_in_codes',
      'collector_pairing_codes',
      'collector_devices',
      'push_subscriptions',
    ]) {
      expect(sql).not.toContain(`INSERT INTO "${table}"`);
    }
    expect(sql).not.toContain('push.example');
  });

  it('gives every member a fictitious address at example.com, named after their pseudo or first name', () => {
    const { sql, members } = localCopy(dump, []);
    expect(members).toEqual([
      { role: 'admin', email: 'nokouki@example.com' },
      { role: 'member', email: 'sam@example.com' },
      { role: 'member', email: 'nokouki-2@example.com' },
    ]);
    expect(sql).not.toMatch(/real|gmail/);
    expect(sql).toContain(
      `INSERT INTO "members" ("id","email","role","first_name","duo_pseudo") VALUES('m1','nokouki@example.com','admin','Léa','Nokouki');`,
    );
  });

  it('keeps the game data, the schema and the triggers as exported', () => {
    const { sql } = localCopy(dump, []);
    expect(sql).toContain(`INSERT INTO "exercises" ("id","note") VALUES('e1',replace('GG,\\nFF','\\n',char(10)));`);
    expect(sql).toContain('CREATE TRIGGER `exercises_insert`');
  });

  it('drops the local database first, in the same file, so that a failed import changes nothing', () => {
    const { sql } = localCopy(dump, [{ type: 'table', name: 'members', parents: null }]);
    expect(sql.split('\n').slice(0, 2)).toEqual(['PRAGMA defer_foreign_keys=TRUE;', 'DROP TABLE IF EXISTS "members";']);
  });

  it('stops before writing anything when a member row has an unexpected shape', () => {
    expect(() => localCopy(`INSERT INTO "members" ("id","name") VALUES('m1','x');`, [])).toThrow(
      'Unexpected members row',
    );
  });
});

describe('emptying the local database', () => {
  it('drops the triggers and views, then each table after the tables pointing to it', () => {
    expect(
      dropEverything([
        { type: 'table', name: 'members', parents: null },
        { type: 'table', name: 'sound_draws', parents: 'members,exercises' },
        { type: 'table', name: 'exercises', parents: null },
        { type: 'table', name: 'exercise_reactions', parents: 'exercises' },
        { type: 'trigger', name: 'exercises_insert', parents: null },
        { type: 'view', name: 'board', parents: null },
        { type: 'table', name: 'sqlite_sequence', parents: null },
        { type: 'table', name: '_cf_KV', parents: null },
      ]),
    ).toEqual([
      'DROP TRIGGER IF EXISTS "exercises_insert";',
      'DROP VIEW IF EXISTS "board";',
      'DROP TABLE IF EXISTS "sound_draws";',
      'DROP TABLE IF EXISTS "exercise_reactions";',
      'DROP TABLE IF EXISTS "members";',
      'DROP TABLE IF EXISTS "exercises";',
    ]);
  });
});

describe('reading a row of the export', () => {
  it('splits the values on their top-level commas only', () => {
    expect(splitValues(`'a,b','it''s',NULL,12,replace('x\\ny','\\n',char(10)),X'00ff'`)).toEqual([
      `'a,b'`,
      `'it''s'`,
      'NULL',
      '12',
      `replace('x\\ny','\\n',char(10))`,
      `X'00ff'`,
    ]);
  });
});

describe('the list of what a reset drops', () => {
  it('reads a D1 database, its own tables left out, with what each table points to', async () => {
    const { results } = await env.DB.prepare(schemaObjects).all<SchemaObject>();
    expect(results.filter(({ name }) => name.startsWith('_cf_') || name.startsWith('sqlite_'))).toEqual([]);
    expect(results).toContainEqual({ type: 'table', name: 'exercise_reactions', parents: 'exercises' });
  });
});
