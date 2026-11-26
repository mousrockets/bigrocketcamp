CREATE TABLE `statfeed_labels` (
	`name` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `match_results` ADD `game_stats` text;