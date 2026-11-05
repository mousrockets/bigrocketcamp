CREATE TABLE `player_ranks` (
	`player` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`playlist` integer DEFAULT 11 NOT NULL,
	`mmr` integer,
	`tier` integer,
	`division` integer,
	`placement_matches` integer,
	`fetched_at` text,
	`last_attempt` text NOT NULL,
	`status` text NOT NULL
);
