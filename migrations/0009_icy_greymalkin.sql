CREATE TABLE `public_mmr_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_attempt` text,
	`next_attempt` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `mmr_entries` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `mmr_entries` ADD `source_at` text;--> statement-breakpoint
ALTER TABLE `mmr_entries` ADD `source_url` text;