CREATE TABLE `epic_accounts` (
	`slot` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`account_id` text NOT NULL,
	`tokens` text NOT NULL,
	`status` text NOT NULL,
	`last_sync` text,
	`last_attempt` text,
	`cooldown_until` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`coverage` text DEFAULT 'unknown' NOT NULL,
	`newest_match` integer,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `epic_grants` (
	`slot` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`device` text NOT NULL,
	`expires` integer NOT NULL,
	`next_poll` integer NOT NULL,
	`interval` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `result_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`match_guid` text NOT NULL,
	`player_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_type` text NOT NULL,
	`payload` text NOT NULL,
	`received` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`match_guid` text NOT NULL,
	`source_id` text NOT NULL,
	`source_type` text NOT NULL,
	`expected_players` integer NOT NULL,
	`players` text NOT NULL,
	`received` text NOT NULL
);
