import { sql } from 'drizzle-orm';
import { blob, check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// The database, as Drizzle reads it and as drizzle-kit generates its migrations from (npm run db:generate).
// Migrations 0000 to 0016 were written before this file; the next ones come from the difference with it.
// Triggers live in the migrations only: drizzle-kit does not know them. Dates are ISO text unless noted.

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// The club

/** Members sign in with their e-mail address and a one-time code; their duo pseudo is their player slot. */
export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    created: text('created').notNull().default(isoNow),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    /** Every game record of the player is keyed by it. */
    duoPseudo: text('duo_pseudo'),
    soloPseudo: text('solo_pseudo'),
    /** The solo account's game ID, found by the rank source from the solo pseudo; cleared when the pseudo or the platform changes. */
    soloPlayerId: text('solo_player_id'),
    /** When the member last named another solo account: the rank source reads it a minute later. */
    soloChangedAt: text('solo_changed_at'),
    platform: text('platform', { enum: ['pc', 'playstation', 'xbox', 'switch'] }),
    /** Players are listed in the order they joined the club. */
    rosterPosition: integer('roster_position'),
  },
  (table) => [
    uniqueIndex('members_duo_pseudo').on(table.duoPseudo),
    uniqueIndex('members_solo_player_id').on(table.soloPlayerId),
    check('members_role', sql`${table.role} IN ('admin', 'member')`),
    check('members_platform', sql`${table.platform} IN ('pc', 'playstation', 'xbox', 'switch')`),
  ],
);

export const clubSettings = sqliteTable(
  'club_settings',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
  },
  (table) => [check('club_settings_single_row', sql`${table.id} = 1`)],
);

/** The club's logo, a small square the browser resized before sending it; `version` names this image in its URL. */
export const clubLogo = sqliteTable(
  'club_logo',
  {
    id: integer('id').primaryKey(),
    image: blob('image', { mode: 'buffer' }).notNull(),
    contentType: text('content_type', { enum: ['image/webp', 'image/jpeg', 'image/png'] }).notNull(),
    version: text('version').notNull(),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => [
    check('club_logo_single_row', sql`${table.id} = 1`),
    check('club_logo_content_type', sql`${table.contentType} IN ('image/webp', 'image/jpeg', 'image/png')`),
  ],
);

/**
 * The +5 for the club player with the fewest points of a losing team, as it changed over time. Each row applies
 * from its day until the next row's; before the first one there is no +5. Rows in the past never change (triggers).
 */
export const lastPlaceRules = sqliteTable(
  'last_place_rules',
  {
    effectiveFrom: text('effective_from').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    ties: text('ties', { enum: ['none', 'all'] })
      .notNull()
      .default('none'),
  },
  (table) => [check('last_place_rules_ties', sql`${table.ties} IN ('none', 'all')`)],
);

/**
 * The −5 of a win the opponents forfeited, as it changed over time. Each row applies from its day until the
 * next row's; before the first one the −5 applies. Rows in the past never change (triggers).
 */
export const forfeitRules = sqliteTable('forfeit_rules', {
  effectiveFrom: text('effective_from').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
});

/**
 * The −10 of a game from 1000 points, as it changed over time. Each row applies from its day until the next
 * row's; before the first one (2026-11-07) it does not apply. Rows in the past never change (triggers).
 */
export const highScoreRules = sqliteTable('high_score_rules', {
  effectiveFrom: text('effective_from').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
});

/** Only a hash of the code is stored. Times in milliseconds. */
export const signInCodes = sqliteTable('sign_in_codes', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expires: integer('expires').notNull(),
  attempts: integer('attempts').notNull().default(0),
  sent: integer('sent').notNull(),
});

/** Only a hash of the session token is stored. Expiry in milliseconds. */
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    expires: integer('expires').notNull(),
  },
  (table) => [index('sessions_member').on(table.memberId)],
);

// The Windows collector, paired with a one-time code. Times in milliseconds.

export const collectorPairingCodes = sqliteTable('collector_pairing_codes', {
  codeHash: text('code_hash').primaryKey(),
  memberId: text('member_id')
    .notNull()
    .unique()
    .references(() => members.id, { onDelete: 'cascade' }),
  expires: integer('expires').notNull(),
  attempts: integer('attempts').notNull().default(0),
});

export const collectorDevices = sqliteTable(
  'collector_devices',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    created: integer('created').notNull(),
    lastSeen: integer('last_seen'),
  },
  (table) => [index('collector_devices_member').on(table.memberId)],
);

/**
 * The last contact of each live source: a member's collector, under an anonymous name
 * (`live-` and a hash of the member). Written with every match received.
 */
export const collectors = sqliteTable('collectors', {
  id: text('id').primaryKey(),
  lastSeen: text('last_seen').notNull(),
  /** When it last sent a ranked 2v2 match: the only one that changes the rating the rank source reads. */
  lastRankedAt: text('last_ranked_at'),
});

// Game identities

/** The main game ID of each player slot, and the member who owns it. */
export const playerIdentities = sqliteTable(
  'player_identities',
  {
    slot: text('slot').primaryKey(),
    owner: text('owner').notNull(),
    playerId: text('player_id').notNull(),
  },
  (table) => [uniqueIndex('player_identities_player_id_unique').on(table.playerId)],
);

/** Every game ID a member confirmed as theirs, the main one included. */
export const playerIdentityAliases = sqliteTable('player_identity_aliases', {
  playerId: text('player_id').primaryKey(),
  slot: text('slot').notNull(),
  confirmedBy: text('confirmed_by').notNull(),
  confirmedAt: text('confirmed_at').notNull(),
});

// Matches: what the sources sent, and what the board shows

/** One player's line of a match, as one source saw it (`payload`: the line as JSON). */
export const resultObservations = sqliteTable(
  'result_observations',
  {
    id: text('id').primaryKey(),
    matchGuid: text('match_guid').notNull(),
    playerId: text('player_id').notNull(),
    sourceId: text('source_id').notNull(),
    sourceType: text('source_type').notNull(),
    payload: text('payload').notNull(),
    received: text('received').notNull(),
  },
  (table) => [index('result_observations_match').on(table.matchGuid)],
);

/** A source's full scoreboard of a match (`players`: JSON), which confirms who played it. */
export const sourceReports = sqliteTable(
  'source_reports',
  {
    id: text('id').primaryKey(),
    matchGuid: text('match_guid').notNull(),
    sourceId: text('source_id').notNull(),
    sourceType: text('source_type').notNull(),
    expectedPlayers: integer('expected_players').notNull(),
    players: text('players').notNull(),
    received: text('received').notNull(),
    /** Seconds left on the game's clock at the end (counting up in overtime); null from older collectors. */
    timeSeconds: integer('time_seconds'),
    overtime: integer('overtime', { mode: 'boolean' }),
    /** The clock's changes around the end of the match as the collector saw them (JSON); null from older ones. */
    clockTrace: text('clock_trace'),
    /** Every opponent left before the end, as the source's departures show: a forfeit; null when it showed none. */
    opponentsGone: integer('opponents_gone', { mode: 'boolean' }),
  },
  (table) => [index('source_reports_match').on(table.matchGuid)],
);

/**
 * A player who left a match before its end, as one source saw it (`payload`: his last line as JSON). Kept apart
 * from the final scoreboards, which only hold the players present at the end.
 */
export const matchDepartures = sqliteTable(
  'match_departures',
  {
    id: text('id').primaryKey(),
    matchGuid: text('match_guid').notNull(),
    playerId: text('player_id').notNull(),
    sourceId: text('source_id').notNull(),
    sourceType: text('source_type').notNull(),
    payload: text('payload').notNull(),
    received: text('received').notNull(),
  },
  (table) => [index('match_departures_match').on(table.matchGuid)],
);

/** Results imported from the prototype, never written since. */
export const prototypeResults = sqliteTable(
  'prototype_results',
  {
    matchGuid: text('match_guid').notNull(),
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    day: text('day').notNull(),
    kind: text('kind').notNull(),
    team: integer('team').notNull(),
    winner: integer('winner').notNull(),
    score: integer('score').notNull(),
    goals: integer('goals').notNull(),
    assists: integer('assists').notNull(),
    saves: integer('saves').notNull(),
    received: text('received').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchGuid, table.playerId] }),
    index('prototype_results_match_key').on(sql`lower(trim(${table.matchGuid}))`),
  ],
);

/** Complete scoreboards imported from the prototype, never written since. */
export const prototypeMatchRosters = sqliteTable(
  'prototype_match_rosters',
  {
    matchGuid: text('match_guid').primaryKey(),
    expectedPlayers: integer('expected_players').notNull(),
    received: text('received').notNull(),
  },
  (table) => [index('prototype_match_rosters_match_key').on(sql`lower(trim(${table.matchGuid}))`)],
);

/** Each match's results reconciled from its sources: what the board shows. */
export const matchResults = sqliteTable(
  'match_results',
  {
    matchGuid: text('match_guid').notNull(),
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    day: text('day').notNull(),
    kind: text('kind').notNull(),
    team: integer('team').notNull(),
    winner: integer('winner').notNull(),
    score: integer('score').notNull(),
    goals: integer('goals').notNull(),
    assists: integer('assists').notNull(),
    saves: integer('saves').notNull(),
    received: text('received').notNull(),
    reviewRequired: integer('review_required').notNull(),
    verification: text('verification').notNull(),
    /** Comma-separated. */
    sourceTypes: text('source_types').notNull(),
    selectedSource: text('selected_source').notNull(),
    sourceDifference: text('source_difference'),
    /** Set on every row of a match whose full scoreboard a source confirmed. */
    expectedPlayers: integer('expected_players'),
    /** Set on every row of a match whose losing team forfeited; null while no source sent the clock. */
    forfeit: integer('forfeit', { mode: 'boolean' }),
    /** Set on every row of a match that went to overtime; null while no source sent the clock. */
    overtime: integer('overtime', { mode: 'boolean' }),
    /** The player left before the end: a defeat, his line kept apart from the final scoreboard. */
    leftEarly: integer('left_early', { mode: 'boolean' }).notNull().default(false),
    seq: integer('seq').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.matchGuid, table.playerId] }), index('match_results_seq').on(table.seq)],
);

/** Each source received moves a match's revision; its stored results reflect `builtRevision`. */
export const matchBuilds = sqliteTable(
  'match_builds',
  {
    matchGuid: text('match_guid').primaryKey(),
    revision: integer('revision').notNull(),
    builtRevision: integer('built_revision'),
  },
  (table) => [index('match_builds_pending').on(table.matchGuid).where(sql`built_revision IS NOT revision`)],
);

// Exercises

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    player: text('player').notNull(),
    count: integer('count').notNull(),
    day: text('day').notNull(),
    created: text('created').notNull(),
    /** The member who declared it: private, a member only learns which exercises are theirs. */
    author: text('author').notNull(),
    type: text('type').notNull().default('pushups'),
    seq: integer('seq').notNull().default(0),
  },
  (table) => [index('exercises_seq').on(table.seq), index('exercises_author').on(table.author)],
);

export const exerciseReactions = sqliteTable(
  'exercise_reactions',
  {
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    emoji: text('emoji').notNull(),
    created: text('created').notNull(),
    seq: integer('seq').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.author, table.emoji] }),
    index('exercise_reactions_seq').on(table.seq),
  ],
);

// Ranks and the monthly 2v2 MMR challenge

/**
 * The highest rating the rank source read this season (the game gives no peak), with the rank it came with.
 * It starts over with the first reading of a new season.
 */
const seasonPeak = {
  season: integer('season'),
  peakMmr: integer('peak_mmr'),
  peakTier: integer('peak_tier'),
  peakDivision: integer('peak_division'),
  peakAt: text('peak_at'),
};

/** The ranked 2v2 rank on each player's card. */
export const playerRanks = sqliteTable('player_ranks', {
  player: text('player').primaryKey(),
  playerId: text('player_id').notNull(),
  mmr: integer('mmr'),
  tier: integer('tier'),
  division: integer('division'),
  fetchedAt: text('fetched_at'),
  lastAttempt: text('last_attempt').notNull(),
  status: text('status').notNull(),
  matchesPlayed: integer('matches_played'),
  ...seasonPeak,
});

/** The ranked 2v2 rank of each player's solo account, kept apart from the duo one. */
export const soloRanks = sqliteTable('solo_ranks', {
  player: text('player').primaryKey(),
  /** Null while the rank source has not found the account. */
  playerId: text('player_id'),
  mmr: integer('mmr'),
  tier: integer('tier'),
  division: integer('division'),
  matchesPlayed: integer('matches_played'),
  /** The rank source's latest reading of the account. */
  fetchedAt: text('fetched_at'),
  /** `ready`, or why the rank source could not read the account (`not_found`, `needs_player_id`…). */
  status: text('status').notNull(),
  ...seasonPeak,
});

/** Each change of a solo account's rating, as the rank source read it. */
export const soloMmrEntries = sqliteTable(
  'solo_mmr_entries',
  {
    id: text('id').primaryKey(),
    player: text('player').notNull(),
    playerId: text('player_id').notNull(),
    mmr: integer('mmr').notNull(),
    tier: integer('tier'),
    division: integer('division'),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [index('solo_mmr_entries_player_recorded').on(table.player, table.recordedAt)],
);

/** Each change of a player's rating, as the rank source read it: the only source since migration 0015. */
export const mmrEntries = sqliteTable(
  'mmr_entries',
  {
    id: text('id').primaryKey(),
    player: text('player').notNull(),
    mmr: integer('mmr').notNull(),
    tier: integer('tier'),
    division: integer('division'),
    recordedAt: text('recorded_at').notNull().default(isoNow),
  },
  (table) => [index('mmr_entries_player_recorded').on(table.player, table.recordedAt)],
);

export const monthlyMmrPolicy = sqliteTable('monthly_mmr_policy', {
  id: integer('id').primaryKey(),
  startsMonth: text('starts_month').notNull(),
});

/** Closed months: frozen, they never change (`snapshot`: the ranking as JSON). */
export const monthlyMmrResults = sqliteTable('monthly_mmr_results', {
  month: text('month').primaryKey(),
  cutoffAt: text('cutoff_at').notNull(),
  closedAt: text('closed_at').notNull(),
  status: text('status').notNull(),
  snapshot: text('snapshot').notNull(),
});

/** The drinks the month's last player owes the others. */
export const drinkDebts = sqliteTable('drink_debts', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  payer: text('payer').notNull(),
  recipient: text('recipient').notNull(),
  paidAt: text('paid_at'),
  paidBy: text('paid_by'),
});

// Following the board (see src/lib/board.ts)

/** One counter, moved by triggers with every change the board shows. */
export const syncState = sqliteTable(
  'sync_state',
  {
    id: integer('id').primaryKey(),
    version: integer('version').notNull(),
    /** The roster and confirmed game IDs the stored match results were built with. */
    matchBasis: text('match_basis'),
  },
  (table) => [check('sync_state_single_row', sql`${table.id} = 1`)],
);

/** What left the board, and at which version. */
export const syncRemovals = sqliteTable('sync_removals', {
  seq: integer('seq').primaryKey(),
  collection: text('collection').notNull(),
  key: text('key').notNull(),
  subkey: text('subkey'),
});
