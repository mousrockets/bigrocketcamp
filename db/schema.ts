// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const results = sqliteTable('results', {
 matchGuid:text('match_guid').notNull(), playerId:text('player_id').notNull(), name:text('name').notNull(), day:text('day').notNull(), kind:text('kind').notNull(), team:integer('team').notNull(), winner:integer('winner').notNull(), score:integer('score').notNull(), goals:integer('goals').notNull(), assists:integer('assists').notNull(), saves:integer('saves').notNull(), received:text('received').notNull(),
},t=>[primaryKey({columns:[t.matchGuid,t.playerId]})]);
export const exercises=sqliteTable('exercises',{id:text('id').primaryKey(),player:text('player').notNull(),count:integer('count').notNull(),day:text('day').notNull(),created:text('created').notNull(),author:text('author').notNull(),type:text('type',{enum:['pushups','plank','crunches']}).notNull().default('pushups')});
export const collectors=sqliteTable('collectors',{id:text('id').primaryKey(),lastSeen:text('last_seen').notNull()});
