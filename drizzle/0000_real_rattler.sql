CREATE TABLE `collectors` (
	`id` text PRIMARY KEY NOT NULL,
	`last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`count` integer NOT NULL,
	`day` text NOT NULL,
	`created` text NOT NULL,
	`author` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `results` (
	`match_guid` text NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`team` integer NOT NULL,
	`winner` integer NOT NULL,
	`score` integer NOT NULL,
	`goals` integer NOT NULL,
	`assists` integer NOT NULL,
	`saves` integer NOT NULL,
	`received` text NOT NULL,
	PRIMARY KEY(`match_guid`, `player_id`)
);
